import { z } from 'zod'
import { PlanInput, ProposedItem } from '@research-agent-platform/contracts'

// The model proposes research content. Identity, material access and dates are
// supplied by the service, never granted by fields copied from a prior Plan.
const DraftItem = ProposedItem.omit({ schedule: true, inputArtifactIds: true })
const Draft = PlanInput.omit({ labId: true }).extend({ proposedItems: z.array(DraftItem).max(100) })
export const PlanningModelReply = z.strictObject({ intent: z.enum(['draft', 'progress', 'find_work']), plan: Draft.nullable() })
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const unknownSchedule = () => ({ suggested: null, hardDeadline: null, committed: null, checkpoint: null, estimatedHumanHours: null })

export function parsePlanningOutput(text: string, labId: string) {
  const raw: unknown = JSON.parse(text.trim().replace(/^\uFEFF/, '').replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''))
  let normalized = raw
  if (record(raw) && record(raw.plan)) {
    const { labId: _lab, id: _id, ownerId: _owner, version: _version, status: _status, createdAt: _created, conclusionRefs: _refs, ...draft } = raw.plan
    normalized = { ...raw, plan: { ...draft, proposedItems: Array.isArray(draft.proposedItems) ? draft.proposedItems.map(item => {
      if (!record(item)) return item
      const { schedule: _schedule, inputArtifactIds: _inputs, ...content } = item
      return content
    }) : draft.proposedItems } }
  }
  const answer = PlanningModelReply.parse(normalized)
  return { intent: answer.intent, plan: answer.plan === null ? null : PlanInput.parse({ ...answer.plan, labId, proposedItems: answer.plan.proposedItems.map(item => ({ ...item, schedule: unknownSchedule(), inputArtifactIds: [] })) }) }
}

// Diagnose shape/stage only. Never store model prose, quotes, keys or issue
// messages (JSON/Zod messages can contain user material or arbitrary field names).
export function planningOutputDiagnostic(text: string, stage: string, error: unknown, finishReason?: string) {
  const fields = new Set(['intent', 'plan', ...Object.keys(PlanInput.shape), ...Object.keys(ProposedItem.shape), 'kind', 'memberId', 'audience', 'summary', 'capability', 'humanLeadId', 'missingReason', 'maxTokens', 'maxSeconds'])
  return {
    stage,
    returnedTextLength: text.length,
    ...(finishReason && /^[a-z_-]{1,64}$/.test(finishReason) ? { finishReason } : {}),
    category: error instanceof z.ZodError ? 'schema' : error instanceof SyntaxError ? 'json' : stage === 'persistence' ? 'persistence' : 'validation',
    ...(error instanceof z.ZodError ? { issues: error.issues.slice(0, 6).map(issue => ({ code: issue.code, path: issue.path.slice(0, 8).map(part => typeof part === 'number' ? part : fields.has(String(part)) ? String(part) : '<field>') })) } : {}),
  }
}
