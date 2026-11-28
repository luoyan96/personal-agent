import { readFile, readdir, mkdir, writeFile, cp, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve, relative, isAbsolute } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = resolve(root, 'agents/roles'), output = resolve(root, 'packages/research-skills/dist')
const read = async path => (await readFile(resolve(source, path), 'utf8')).replace(/\r\n/g, '\n')
const manifest = JSON.parse(await read('manifest.json'))
if (manifest.format !== 'acceptcat-role-catalog/v1' || !Array.isArray(manifest.roles) || !manifest.roles.length) throw Error('Invalid role catalog')
const ids = manifest.roles
if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,60}$/.test(id))) throw Error('Invalid role directory')
const directories = (await readdir(source, { withFileTypes: true })).filter(e => e.isDirectory() && e.name !== '_shared').map(e => e.name).sort()
if (JSON.stringify(directories) !== JSON.stringify([...ids].sort())) throw Error('Every role directory must be registered in manifest.json')
const sharedRolePolicy = (await read('_shared/colleague.md')).trim()
const dialogueAudiences = ['owner', 'consultation', 'group']
const sharedDialoguePolicy = Object.fromEntries(await Promise.all(dialogueAudiences.map(async audience =>
  [audience, (await read(`_shared/dialogue-${audience}.md`)).trim()])))
const legacyRoleProfiles = JSON.parse(await read('legacy-profiles.json'))
if (!sharedRolePolicy || Buffer.byteLength(sharedRolePolicy) > 600) throw Error('Shared conversation policy must fit the existing chat budget')
for (const [audience, policy] of Object.entries(sharedDialoguePolicy)) {
  if (!policy || Buffer.byteLength(policy) > 200) throw Error(`Dialogue policy must fit the existing chat budget: ${audience}`)
}
const { createRoleBundle, roleCategories, roleTeams } = await import('../packages/research-skills/dist/roles.js')
const roles = []
for (const id of ids) {
  const meta = JSON.parse(await read(`${id}/meta.json`))
  if (meta.id !== id || (!Number.isSafeInteger(meta.version) || meta.version < 1) || !['coordinator', 'specialist', 'public_capability'].includes(meta.kind)) throw Error(`Invalid role metadata: ${id}`)
  for (const key of ['displayName', 'introduction', 'summary', 'input', 'boundary']) if (typeof meta[key] !== 'string' || !meta[key].trim()) throw Error(`Missing ${key}: ${id}`)
  if (!roleCategories.includes(meta.category) || !Array.isArray(meta.teams) || !meta.teams.length || new Set(meta.teams).size !== meta.teams.length || meta.teams.some(team => !roleTeams.some(item => item.id === team))) throw Error(`Invalid role discovery category: ${id}`)
  if (!Array.isArray(meta.methods) || !meta.methods.length || meta.methods.length > 5 || new Set(meta.methods).size !== meta.methods.length) throw Error(`Invalid role methods: ${id}`)
  for (const method of meta.methods) {
    if (typeof method !== 'string' || !/^[a-z][a-z0-9-]{0,95}$/.test(method)) throw Error(`Invalid method ID: ${id}`)
    await readFile(resolve(root, 'agents/skills', method, 'SKILL.md'), 'utf8')
  }
  const profile = { displayName: meta.displayName, introduction: meta.introduction,
    personality: (await read(`${id}/persona.md`)).trim(), capabilityDescription: (await read(`${id}/work.md`)).trim() }
  const bundle = createRoleBundle(profile, meta.kind, meta.version)
  if (Buffer.byteLength(JSON.stringify(profile)) > (meta.kind === 'coordinator' ? 500 : 1600)) throw Error(`Default role exceeds chat admission budget: ${id}`)
  const skill = await read(`${id}/SKILL.md`)
  if (!skill.includes(`name: ${id}\n`) || !skill.includes('](persona.md)') || !skill.includes('](work.md)') || !skill.includes('](../_shared/colleague.md)')) throw Error(`Missing role loading references: ${id}`)
  if (meta.methods.some(method => !skill.includes(`](../../skills/${method}/SKILL.md)`))) throw Error(`Missing role method reference: ${id}`)
  for (const heading of ['## 身份与协作', '## 表达与判断', '## 对话示例', '## 纠正与边界']) if (!profile.personality.includes(heading)) throw Error(`Missing persona section ${heading}: ${id}`)
  for (const heading of ['## 职责', '## 工作方法', '## 交付与限制']) if (!profile.capabilityDescription.includes(heading)) throw Error(`Missing work section ${heading}: ${id}`)
  roles.push({ ...meta, profile, skill })
}
for (const kind of ['coordinator', 'specialist', 'public_capability']) if (!roles.some(role => role.kind === kind && role.id === manifest.defaults[kind])) throw Error(`Missing default role: ${kind}`)
for (const legacy of legacyRoleProfiles) {
  if (!roles.some(role => role.id === legacy.id)) throw Error('Unknown legacy role')
  createRoleBundle(legacy.profile, 'specialist', 1)
}
const roleCatalogDigest = createHash('sha256').update(JSON.stringify({ manifest, sharedRolePolicy, sharedDialoguePolicy, roles, legacyRoleProfiles })).digest('hex')
await mkdir(output, { recursive: true })
await writeFile(resolve(output, 'role-catalog.js'), `// Generated from agents/roles. Do not edit.\nexport const agentRoles = ${JSON.stringify(roles)};\nexport const sharedRolePolicy = ${JSON.stringify(sharedRolePolicy)};\nexport const sharedDialoguePolicy = ${JSON.stringify(sharedDialoguePolicy)};\nexport const roleDefaults = ${JSON.stringify(manifest.defaults)};\nexport const roleCatalogDigest = ${JSON.stringify(roleCatalogDigest)};\nexport const legacyRoleProfiles = ${JSON.stringify(legacyRoleProfiles)};\n`)
await writeFile(resolve(output, 'role-catalog.d.ts'), `import type { AgentRoleDefinition, AgentRoleKind, AgentRoleProfile } from './roles.js';\nexport declare const agentRoles: readonly AgentRoleDefinition[];\nexport declare const sharedRolePolicy: string;\nexport declare const sharedDialoguePolicy: Readonly<Record<${dialogueAudiences.map(audience => `'${audience}'`).join(' | ')}, string>>;\nexport declare const roleDefaults: Record<AgentRoleKind, string>;\nexport declare const roleCatalogDigest: string;\nexport declare const legacyRoleProfiles: readonly {id: string; profile: AgentRoleProfile}[];\n`)
const target = resolve(output, 'roles'), child = relative(output, target)
if (!child || child.startsWith('..') || isAbsolute(child)) throw Error('Invalid generated role path')
await rm(target, { recursive: true, force: true })
await cp(source, target, { recursive: true })
console.log(`Packaged ${roles.length} role definitions and shared colleague policy (${roleCatalogDigest.slice(0, 12)}).`)
