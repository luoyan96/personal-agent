import { z } from 'zod'
import { Id, Instant, Version, ErrorResponse, errorStatus, data } from './models.js'

export const ResearchDirection = z.string().trim().min(1).max(120).regex(/^[^\u0000-\u001f\u007f]+$/)
export const ResearchDirections = z.array(ResearchDirection).max(10)
export const ResearchDirectionSettings = z.strictObject({
  directions: ResearchDirections,
  version: Version,
  canEdit: z.boolean(),
})
export const ArxivPaperId = z.string().regex(/^(?:\d{4}\.\d{4,5}|[a-z][a-z.-]*\/\d{7})(?:v[1-9]\d{0,3})?$/)
export const LiteratureRecommendationItem = z.strictObject({
  id: ArxivPaperId,
  title: z.string().trim().min(1).max(3000),
  authors: z.array(z.string().trim().min(1).max(300)).min(1).max(100),
  summary: z.string().trim().min(1).max(24000).optional(),
  published: Instant.optional(),
  reason: z.string().trim().min(1).max(1000).optional(),
})
export const LiteratureRecommendationFeed = z.strictObject({
  source: z.enum(['personal', 'team', 'none']),
  directions: ResearchDirections,
  items: z.array(LiteratureRecommendationItem.extend({ batchId: Id, messageId: Id })).max(50),
  updatedAt: Instant.optional(),
  batchId: Id.optional(),
  messageId: Id.optional(),
})
export type ResearchDirectionSettings = z.infer<typeof ResearchDirectionSettings>
export type LiteratureRecommendationItem = z.infer<typeof LiteratureRecommendationItem>
export type LiteratureRecommendationFeed = z.infer<typeof LiteratureRecommendationFeed>

const empty = z.strictObject({})
const lab = z.strictObject({ id: Id })
const headers = z.strictObject({ 'Idempotency-Key': z.string().regex(/^[A-Za-z0-9_-]{16,128}$/) })
const change = z.strictObject({ directions: ResearchDirections, expectedVersion: Version })

function route<P extends z.ZodType, B extends z.ZodType, R extends z.ZodType>(
  method: 'GET' | 'POST', path: string, params: P, body: B, response: R, rule: string,
) {
  return {
    method, path: '/api/v1' + path, stage: 'CHAT1' as const, implemented: true,
    access: 'session', status: 200, rule, idempotent: method === 'POST',
    request: z.strictObject({ params, query: empty, headers: method === 'GET' ? empty : headers, body }),
    response: data(response), errors: ErrorResponse, errorStatuses: errorStatus,
  }
}

export const assistantLiteratureRoutes = {
  assistantLiteratureRecommendations: route('GET', '/me/literature/recommendations', empty, z.null(), LiteratureRecommendationFeed,
    'Current account only. Read recorded arXiv recommendations from the current personal direction or, if unset, the selected authorized research group. No generation on read.'),
  myResearchDirections: route('GET', '/me/research-directions', empty, z.null(), ResearchDirectionSettings,
    'Read the current account paper recommendation directions. Unset settings may project explicitly labeled legacy profile directions.'),
  updateMyResearchDirections: route('POST', '/me/research-directions', empty, change, ResearchDirectionSettings,
    'Update current account directions with version and idempotency checks. An empty list clears the personal override and enables group fallback.'),
  labResearchDirections: route('GET', '/labs/{id}/research-directions', lab, z.null(), ResearchDirectionSettings,
    'Read direction labels of a research group the current account belongs to.'),
  updateLabResearchDirections: route('POST', '/labs/{id}/research-directions', lab, change, ResearchDirectionSettings,
    'Current research group manager only. Update group direction labels with version and idempotency checks.'),
} as const
