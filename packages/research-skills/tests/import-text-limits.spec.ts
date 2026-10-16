import { describe, expect, it } from 'vitest'
import { SkillPackage } from '../../contracts/dist/skills.js'
import { parseImportedSkill } from '../dist/import.js'

const root = (body = 'Follow the supplied research protocol.') => ({
  path: 'SKILL.md',
  text: `---\nname: text-limit-check\ndescription: Synthetic protocol for import validation\n---\n${body}`,
})

describe('imported Skill text fits the existing API contract', () => {
  it.each(['references/protocol.md', 'assets/template.json'])('rejects %s above 120,000 characters with its path before installation', path => {
    for (const character of ['x', '中']) {
      expect(() => parseImportedSkill([root(), { path, text: character.repeat(120001) }]))
        .toThrow(new RegExp(`${path.replace('.', '\\.')}.*120,000`))
    }
  })
  it.each(['x', '中'])('accepts exactly 120,000 %s characters in instructions and a reference without losing content', character => {
    const text = character.repeat(120000)
    const reference = { path: 'references/protocol.md', text }
    const parsed = parseImportedSkill([root(text), reference])
    expect(parsed.instructions).toBe(text)
    expect(parsed.references).toEqual([reference])
    expect(SkillPackage.safeParse(parsed).success).toBe(true)
  })
  it('rejects excessive instructions with a useful file name and preserves the aggregate byte limit', () => {
    expect(() => parseImportedSkill([root('x'.repeat(120001))])).toThrow(/SKILL\.md.*120,000/)
    expect(() => parseImportedSkill([root(), ...['a', 'b', 'c'].map(name => ({
      path: `references/${name}.md`, text: '中'.repeat(110000),
    }))])).toThrow(/900 KB/)
  })
  it('identifies invalid reference text without accepting a truncated prefix', () => {
    expect(() => parseImportedSkill([root(), { path: 'references/bad.md', text: 'prefix\0tail' }]))
      .toThrow(/references\/bad\.md/)
  })
})
