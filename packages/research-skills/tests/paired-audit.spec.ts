import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const packaged = join(root, 'packages/research-skills/dist/skills/statistical-result-analysis/scripts/audit-pairs.mjs')
const fixture = JSON.parse(readFileSync(join(root, 'evaluations/fixtures/statistical-analysis-paired.json'), 'utf8'))
const temporary: string[] = []
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true })
})
function run(input: unknown = fixture, raw?: string | Buffer) {
  const dir = mkdtempSync(join(tmpdir(), 'acceptcat-pair-audit-'))
  temporary.push(dir)
  const path = join(dir, 'private-input.json')
  const bytes = raw === undefined ? Buffer.from(JSON.stringify(input)) : Buffer.from(raw)
  writeFileSync(path, bytes)
  const child = spawnSync(process.execPath, [packaged, '--input', path], { encoding: 'utf8', timeout: 5000 })
  expect(child.error).toBeUndefined()
  expect(child.stderr).toBe('')
  expect(readFileSync(path)).toEqual(bytes)
  expect(child.stdout).not.toContain(dir)
  return { code: child.status, report: JSON.parse(child.stdout), bytes }
}
const copy = () => structuredClone(fixture)

describe('packaged paired-data audit CLI with synthetic data', () => {
  it('computes differences by declared unit, preserves source bytes and never performs inference', () => {
    const { code, report, bytes } = run()
    expect(code).toBe(0)
    expect(report.status).toBe('descriptive_only')
    expect(report.counts).toEqual({ inputPairs: 3, completePairs: 3, incompletePairs: 0, missingMeasurements: 0, excludedPairs: 0, usablePairs: 3 })
    expect(report.summary).toEqual({ pairedN: 3, subtraction: 'B minus A', meanDifference: 4, sampleSdDifference: 2 })
    expect(report.inputSha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(report.inference).toEqual({ status: 'not_performed', pValue: null, confidenceInterval: null })
    expect(JSON.stringify(report)).not.toContain('specimen-1')
  })
  it('produces the same summary after row permutation and negative mean after condition reversal', () => {
    const input = copy()
    input.pairs.reverse()
    const permuted = run(input).report.summary
    expect(permuted.pairedN).toBe(3)
    expect(permuted.meanDifference).toBeCloseTo(4, 12)
    expect(permuted.sampleSdDifference).toBeCloseTo(2, 12)
    input.pairs.forEach((pair: any) => { [pair.a, pair.b] = [pair.b, pair.a] })
    const reversed = run(input).report.summary
    expect(reversed.meanDifference).toBeCloseTo(-4, 12)
    expect(reversed.sampleSdDifference).toBeCloseTo(2, 12)
  })
  it('blocks incomplete pairs by default without claiming an exclusion', () => {
    const input = copy()
    input.pairs[0].a = null
    const { code, report } = run(input)
    expect(code).toBe(2)
    expect(report).toMatchObject({ status: 'blocked', summary: null, counts: { completePairs: 2, incompletePairs: 1, missingMeasurements: 1, excludedPairs: 0, usablePairs: 0 }, incompletePairOrdinals: [1], excludedPairOrdinals: [] })
    expect(report.issues).toContainEqual({ code: 'INCOMPLETE_PAIRS' })
  })
  it('excludes the whole pair only under declared complete-pairs policy', () => {
    const input = copy()
    input.design.missingPolicy = 'complete-pairs'
    input.pairs[0].a = null
    const { code, report } = run(input)
    expect(code).toBe(0)
    expect(report.counts).toMatchObject({ usablePairs: 2, excludedPairs: 1 })
    expect(report.excludedPairOrdinals).toEqual([1])
    expect(report.summary.meanDifference).toBe(5)
    expect(report.summary.sampleSdDifference).toBeCloseTo(Math.SQRT2)
  })
  it('blocks duplicate units rather than averaging technical replicates', () => {
    const input = copy()
    input.pairs[1].unitId = ' specimen-1 '
    const { code, report } = run(input)
    expect(code).toBe(2)
    expect(report.summary).toBeNull()
    expect(report.issues).toContainEqual({ code: 'DUPLICATE_UNIT', pairOrdinal: 2 })
  })
  it.each([{ pairs: [] }, { pairs: [fixture.pairs[0]] }])('blocks insufficient complete units: $pairs', ({ pairs }) => {
    const { code, report } = run({ ...fixture, pairs })
    expect(code).toBe(2)
    expect(report.summary).toBeNull()
    expect(report.issues).toContainEqual({ code: 'INSUFFICIENT_COMPLETE_PAIRS' })
  })
  it('does not turn zero spread into a significance claim', () => {
    const input = copy()
    input.pairs.forEach((pair: any) => { pair.b = pair.a + 2 })
    expect(run(input).report).toMatchObject({ summary: { meanDifference: 2, sampleSdDifference: 0 }, inference: { status: 'not_performed', pValue: null } })
  })
  it('blocks overflow instead of serializing infinity to null', () => {
    const input = copy()
    input.pairs[0] = { unitId: 'extreme', a: -1e308, b: 1e308 }
    expect(run(input).report).toMatchObject({ status: 'blocked', summary: null, issues: [{ code: 'ARITHMETIC_OVERFLOW' }] })
  })
  it.each([
    ['undeclared pairing', (v: any) => { v.design.pairingBasis = '' }],
    ['undeclared unit', (v: any) => { delete v.design.unitOfAnalysis }],
    ['undeclared independence', (v: any) => { v.design.independenceBasis = '' }],
    ['identical conditions', (v: any) => { v.design.groupB = v.design.groupA }],
    ['implicit deletion', (v: any) => { v.design.missingPolicy = 'drop' }],
    ['numeric strings', (v: any) => { v.pairs[0].a = '10' }],
    ['absent measurement', (v: any) => { delete v.pairs[0].a }],
    ['blank unit', (v: any) => { v.pairs[0].unitId = ' ' }],
    ['unknown measurement field', (v: any) => { v.pairs[0].c = 9 }],
    ['unknown schema', (v: any) => { v.schemaVersion = 2 }],
  ])('rejects %s without deriving results', (_name, mutate) => {
    const input = copy()
    mutate(input)
    const { code, report } = run(input)
    expect(code).toBe(1)
    expect(report.status).toBe('input_error')
    expect(report.summary).toBeUndefined()
  })
  it.each(['{', '{"design":{},"design":{}}', '{"a":1,"\\u0061":2}', '{"a":1e999}', '[1,2]', 'null'])('rejects invalid/schema-unsafe JSON %s', raw => {
    expect(run(null, raw).code).toBe(1)
  })
  it('rejects malformed UTF-8 and oversized files without exposing bytes', () => {
    expect(run(null, Buffer.from([0xc3, 0x28])).report.code).toBe('INVALID_UTF8')
    expect(run(null, ' '.repeat(1024 * 1024 + 1)).report.code).toBe('INPUT_FILE_LIMIT')
  })
  it('handles usage and file errors without echoing local paths', () => {
    for (const args of [[], ['--input', join(tmpdir(), 'private-absent-acceptcat-input.json')]]) {
      const child = spawnSync(process.execPath, [packaged, ...args], { encoding: 'utf8', timeout: 5000 })
      expect(child.status).toBe(1)
      expect(child.stderr).toBe('')
      expect(JSON.parse(child.stdout)).toEqual({ status: 'input_error', code: args.length ? 'INPUT_READ_FAILED' : 'USAGE' })
    }
  })
})
