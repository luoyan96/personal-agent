import { describe, it, expect } from 'vitest'
import { PlanInput } from '@research-agent-platform/contracts'
import { parsePlanningOutput, planningOutputDiagnostic } from '../src/planning-output.js'

const schedule = { suggested: null, hardDeadline: null, committed: null, checkpoint: null, estimatedHumanHours: null }
const item = { id: 'compare', title: 'Synthetic comparison', goal: 'Compare Metric A', deliverable: 'Comparison', acceptanceCriteria: 'Traceable evidence', allocation: { kind: 'self' }, dependencies: [], schedule, inputArtifactIds: [], budget: null }
const draft = () => ({ labId: 'lab_synthetic', goal: 'Synthetic continuation', proposedItems: [structuredClone(item)], unresolvedQuestions: [] })
const reply = (plan: unknown) => JSON.stringify({ intent: 'draft', plan })

describe('planning model content and server-owned fields', () => {
  it('accepts the legacy input and the content-only output without changing task content', () => {
    const full = draft(), { labId: _lab, ...content } = full
    const { schedule: _schedule, inputArtifactIds: _inputs, ...step } = item
    for (const value of [full, { ...content, proposedItems: [step] }]) {
      expect(parsePlanningOutput(reply(value), 'lab_synthetic').plan).toEqual(full)
    }
  })
  it('accepts a copied second-turn Plan but never trusts its identity, dates, source grants or confirmation', () => {
    const copied = { ...draft(), labId: 'other_lab', id: 'other_plan', ownerId: 'other_owner', version: 999, status: 'confirmed', createdAt: '2026-01-01T00:00:00Z', conclusionRefs: [{ id: 'private', version: 1, status: 'current' }], proposedItems: [{ ...item, schedule: null, inputArtifactIds: ['private_file'] }] }
    expect(() => PlanInput.parse(copied)).toThrow()
    expect(parsePlanningOutput(reply(copied), 'lab_synthetic').plan).toEqual(draft())
  })
  it('continues an early conversation with no tasks and keeps the actual response', () => {
    const plan = { goal: 'Synthetic existing work', proposedItems: [], unresolvedQuestions: ['A synthetic next step.'] }
    expect(parsePlanningOutput('```json\n' + reply(plan) + '\n```', 'lab_synthetic').plan).toEqual({ ...plan, labId: 'lab_synthetic' })
  })
  it('rejects missing research fields, unsupported dependency aliases, unsafe IDs and unknown actions', () => {
    for (const plan of [{ ...draft(), proposedItems: [{ ...item, acceptanceCriteria: undefined }] }, { ...draft(), proposedItems: [{ ...item, depends_on: ['other'] }] }, { ...draft(), proposedItems: [{ ...item, id: 'bad/id' }] }, { ...draft(), execute: true }]) {
      expect(() => parsePlanningOutput(reply(plan), 'lab_synthetic')).toThrow()
    }
    expect(() => parsePlanningOutput(JSON.stringify({ intent: 'execute', plan: draft() }), 'lab_synthetic')).toThrow()
    expect(() => parsePlanningOutput('Unstructured prose', 'lab_synthetic')).toThrow()
  })
  it('records bounded shape diagnostics without private prose or arbitrary field names', () => {
    const text = reply({ ...draft(), proposedItems: [{ ...item, acceptanceCriteria: undefined, PRIVATE_SECRET_FIELD: 'PRIVATE_MATERIAL_SENTINEL' }] })
    try { parsePlanningOutput(text, 'lab_synthetic'); throw new Error('Expected validation failure') } catch (error) {
      const diagnostic = planningOutputDiagnostic(text, 'parsing', error)
      expect(diagnostic.category).toBe('schema')
      expect(JSON.stringify(diagnostic)).not.toMatch(/PRIVATE_|Synthetic continuation/)
      expect(diagnostic.issues?.length).toBeGreaterThan(0)
    }
    expect(planningOutputDiagnostic('PRIVATE_MATERIAL_SENTINEL', 'parsing', new SyntaxError('PRIVATE_MATERIAL_SENTINEL')).category).toBe('json')
  })
})
