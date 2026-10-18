import { createHash } from 'node:crypto'
import { openSync, fstatSync, readSync, closeSync } from 'node:fs'

const MAX_BYTES = 1024 * 1024
const fail = code => { throw new Error(code) }
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const exactKeys = (value, keys) => record(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const label = (value, max = 500) => typeof value === 'string' && value.trim().length > 0 && value.length <= max

// JSON.parse validates syntax first; tokens then detect duplicate (including escaped) keys.
function parseInput(text) {
  let input
  try { input = JSON.parse(text) } catch { fail('INVALID_JSON') }
  const tokens = text.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) ?? []
  const stack = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token === '{' || token === '[') stack.push(token === '{' ? new Set() : null)
    else if (token === '}' || token === ']') stack.pop()
    else if (tokens[i + 1] === ':') {
      const keys = stack.at(-1)
      const key = JSON.parse(token)
      if (keys.has(key)) fail('DUPLICATE_JSON_KEY')
      keys.add(key)
    }
  }
  return input
}

function readInput(path) {
  const fd = openSync(path, 'r')
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size > MAX_BYTES) fail('INPUT_FILE_LIMIT')
    const buffer = Buffer.alloc(MAX_BYTES + 1)
    let length = 0
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, null)
      if (!count) break
      length += count
    }
    if (length > MAX_BYTES) fail('INPUT_FILE_LIMIT')
    return buffer.subarray(0, length)
  } finally { closeSync(fd) }
}

function audit(input, inputSha256) {
  if (!exactKeys(input, ['schemaVersion', 'design', 'pairs']) || input.schemaVersion !== 1 ||
      !exactKeys(input.design, ['unitOfAnalysis', 'pairingBasis', 'independenceBasis', 'metric', 'groupA', 'groupB', 'missingPolicy']) ||
      !Array.isArray(input.pairs) || input.pairs.length > 20000) fail('INVALID_SCHEMA')
  const { design, pairs } = input
  for (const key of ['unitOfAnalysis', 'pairingBasis', 'independenceBasis', 'metric', 'groupA', 'groupB']) {
    if (!label(design[key])) fail('MISSING_DESIGN_DECLARATION')
  }
  if (design.groupA.trim() === design.groupB.trim() ||
      !['stop', 'complete-pairs'].includes(design.missingPolicy)) fail('INVALID_DESIGN')
  const issues = []
  const excludedPairOrdinals = []
  const seen = new Set()
  const differences = []
  let missingMeasurements = 0
  pairs.forEach((pair, index) => {
    if (!exactKeys(pair, ['unitId', 'a', 'b']) || !label(pair.unitId, 200) ||
        ![pair.a, pair.b].every(value => value === null || (typeof value === 'number' && Number.isFinite(value)))) fail('INVALID_PAIR')
    const ordinal = index + 1
    // Normalize incidental surrounding spaces only for detecting ambiguous duplicate units.
    const id = pair.unitId.trim()
    if (seen.has(id)) issues.push({ code: 'DUPLICATE_UNIT', pairOrdinal: ordinal })
    seen.add(id)
    const missing = Number(pair.a === null) + Number(pair.b === null)
    missingMeasurements += missing
    if (missing) excludedPairOrdinals.push(ordinal)
    else differences.push(pair.b - pair.a)
  })
  if (excludedPairOrdinals.length && design.missingPolicy === 'stop') issues.push({ code: 'INCOMPLETE_PAIRS' })
  if (differences.length < 2) issues.push({ code: 'INSUFFICIENT_COMPLETE_PAIRS' })
  if (!differences.every(Number.isFinite)) issues.push({ code: 'ARITHMETIC_OVERFLOW' })
  let summary = null
  if (!issues.length) {
    const meanDifference = differences.reduce((sum, value) => sum + value / differences.length, 0)
    const sampleSdDifference = Math.sqrt(differences.reduce((sum, value) =>
      sum + (value - meanDifference) ** 2 / (differences.length - 1), 0))
    if (![meanDifference, sampleSdDifference].every(Number.isFinite)) issues.push({ code: 'ARITHMETIC_OVERFLOW' })
    else summary = { pairedN: differences.length, subtraction: 'B minus A', meanDifference, sampleSdDifference }
  }
  return {
    schemaVersion: 1,
    status: issues.length ? 'blocked' : 'descriptive_only',
    inputSha256,
    design,
    counts: {
      inputPairs: pairs.length,
      completePairs: differences.length,
      incompletePairs: excludedPairOrdinals.length,
      missingMeasurements,
      excludedPairs: design.missingPolicy === 'complete-pairs' ? excludedPairOrdinals.length : 0,
      usablePairs: issues.length ? 0 : differences.length,
    },
    issues,
    // With stop policy these positions are unresolved, not silently excluded.
    excludedPairOrdinals: design.missingPolicy === 'complete-pairs' ? excludedPairOrdinals : [],
    incompletePairOrdinals: excludedPairOrdinals,
    summary,
    inference: { status: 'not_performed', pValue: null, confidenceInterval: null },
    limits: ['Design declarations are not independently verified.', 'No hypothesis test, interval, causal or generalization claim is computed.'],
  }
}

try {
  const args = process.argv.slice(2)
  if (args.length !== 2 || args[0] !== '--input' || !args[1]) fail('USAGE')
  const bytes = readInput(args[1])
  let text
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { fail('INVALID_UTF8') }
  const result = audit(parseInput(text), createHash('sha256').update(bytes).digest('hex'))
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  process.exitCode = result.status === 'blocked' ? 2 : 0
} catch (error) {
  const known = new Set(['USAGE', 'INVALID_JSON', 'DUPLICATE_JSON_KEY', 'INPUT_FILE_LIMIT', 'INVALID_UTF8', 'INVALID_SCHEMA', 'MISSING_DESIGN_DECLARATION', 'INVALID_DESIGN', 'INVALID_PAIR'])
  process.stdout.write(JSON.stringify({ status: 'input_error', code: known.has(error.message) ? error.message : 'INPUT_READ_FAILED' }) + '\n')
  process.exitCode = 1
}
