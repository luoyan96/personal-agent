import { z } from 'zod'
import { Id, Instant, Version, ErrorResponse, errorStatus, data } from './models.js'
import { ResearchFile } from './research-library.js'

const empty = z.strictObject({})
export const FeishuStatus = z.strictObject({
  configured: z.boolean(),
  state: z.enum(['unconfigured', 'disconnected', 'connected', 'expired']),
  displayName: z.string().nullable(),
  expiresAt: Instant.nullable()
})
export const FeishuPreview = z.strictObject({
  id: Id,
  title: z.string().max(500),
  sourceUrl: z.string().url(),
  documentId: z.string(),
  revision: z.number().int().nonnegative(),
  readAt: Instant,
  expiresAt: Instant,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  content: z.string().min(1).max(100000),
  limitation: z.string()
})
export type FeishuPreview = z.infer<typeof FeishuPreview>
function route<B extends z.ZodType, R extends z.ZodType>(
  method: 'GET' | 'POST',
  path: string,
  body: B,
  response: R,
  keyed = false
) {
  return {
    method,
    path: `/api/v1/feishu${path}`,
    stage: 'FEISHU1' as const,
    implemented: true,
    access: 'session',
    status: 200,
    idempotent: keyed,
    rule: 'User identity only. Explicit selected document; private snapshot confirmation, current authorization and revision rechecked. No background sync or writeback.',
    request: z.strictObject({
      params: empty,
      query: empty,
      body,
      headers: keyed
        ? z.strictObject({ 'Idempotency-Key': z.string().regex(/^[A-Za-z0-9_-]{16,128}$/) })
        : empty
    }),
    response,
    errors: ErrorResponse,
    errorStatuses: errorStatus
  }
}
export const feishuRoutes = {
  feishuStatus: route('GET', '/status', z.null(), data(FeishuStatus)),
  connectFeishu: route(
    'POST',
    '/connect',
    empty,
    data(z.strictObject({ authorizationUrl: z.string().url(), expiresAt: Instant }))
  ),
  disconnectFeishu: route(
    'POST',
    '/disconnect',
    empty,
    data(z.strictObject({ disconnected: z.literal(true) }))
  ),
  previewFeishuDocument: route(
    'POST',
    '/preview',
    z.strictObject({ url: z.string().min(1).max(2048) }),
    data(FeishuPreview)
  ),
  importFeishuSnapshot: route(
    'POST',
    '/import',
    z.strictObject({
      previewId: Id,
      collectionId: Id,
      expectedCollectionVersion: Version,
      confirmPrivateSnapshot: z.literal(true)
    }),
    data(ResearchFile),
    true
  )
}
