import { describe, expect, it } from 'vitest'
import { parseImportedSkill } from '../dist/import.js'

const body = 'Use only the selected references/check.md. Version: `legacy-7`\nKeep all supplied evidence; do not execute scripts.'
const skill = (version = '') => [{ path: 'SKILL.md', text: `---\nname: synthetic-version-check\ndescription: Check supplied research text\n${version}---\n${body}` }, { path: 'references/check.md', text: '合成证据末尾 SAMPLE_END\n' }]

describe('imported skill release metadata', () => {
  it('recognizes scientific Skill metadata.version without changing bodies, references or dependency boundaries', () => {
    const files = skill('metadata:\n  author: Synthetic Author\n  version: "2.1"\n')
    const parsed = parseImportedSkill(files, 1, 2)
    expect(parsed.release).toBe('2.1')
    expect(parsed.instructions).toBe(body)
    expect(parsed.references).toEqual([files[1]])
    expect(parsed.requirements).toEqual(['脚本执行'])
    expect(parsed.scriptCount).toBe(1)
    expect(parsed.assetCount).toBe(2)
  })
  it.each(['2.10', '0', '01', '1.20e+2'])('preserves numeric scalar spelling %s rather than converting through JS Number', version => {
    expect(parseImportedSkill(skill(`metadata:\n  version: ${version}\n`)).release).toBe(version)
  })
  it('keeps root version precedence and existing body fallback; null/missing optional metadata does not break legacy packages', () => {
    expect(parseImportedSkill(skill('version: "root-3"\nmetadata:\n  version: "nested-2"\n')).release).toBe('root-3')
    expect(parseImportedSkill(skill('version: null\nmetadata:\n  version: "nested-2"\n')).release).toBe('nested-2')
    for (const meta of ['', 'metadata: null\n', 'metadata: plain-text\n', 'metadata: []\n']) expect(parseImportedSkill(skill(meta)).release).toBe('legacy-7')
    expect(parseImportedSkill([{ path: 'SKILL.md', text: '---\nname: no-version\ndescription: Synthetic\n---\nNo release declared.' }]).release).toBe('未标注')
  })
  it.each(['true', '[1, 2]', '{value: 2}', '.inf', '.nan', '"bad\\nlabel"', '"' + 'a'.repeat(101) + '"'])('rejects malformed release %s without silently truncating or falling back', value => {
    expect(() => parseImportedSkill(skill(`metadata:\n  version: ${value}\n`))).toThrow(/技能版本/)
    expect(() => parseImportedSkill(skill(`version: ${value}\n`))).toThrow(/技能版本/)
  })
  it('still rejects invalid YAML and aliases, even when selected version is valid', () => {
    expect(() => parseImportedSkill(skill('metadata:\n  version: 1\n  version: 2\n'))).toThrow(/YAML/)
    expect(() => parseImportedSkill(skill('version: "1"\nmetadata: &meta {version: "2"}\nother: *meta\n'))).toThrow()
  })
})
