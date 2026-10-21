import { z } from 'zod'
import { Id, Instant, Version, ErrorResponse, errorStatus, data } from './models.js'

export const FeishuLibraryField = z.strictObject({ id: z.string().max(100), name: z.string().max(300), type: z.number().int() })
export type FeishuLibraryField = z.infer<typeof FeishuLibraryField>
export const FeishuLibraryMapping = z.strictObject({
  title: z.string(), year: z.string().nullable(), date: z.string().nullable(),
  grade: z.string().nullable(), venue: z.string().nullable(), abstract: z.string().nullable(), authors: z.string().nullable()
})
export type FeishuLibraryMapping = z.infer<typeof FeishuLibraryMapping>
export const FeishuLibrary = z.strictObject({
  collectionId: Id, name: z.string().max(200), sourceUrl: z.string().url(), tableId: z.string(), tableName: z.string(),
  fields: z.array(FeishuLibraryField).max(200), mapping: FeishuLibraryMapping, version: Version
})
export type FeishuLibrary = z.infer<typeof FeishuLibrary>
export const FeishuLibraryQuery = z.strictObject({
  collectionId: Id, question: z.string().min(1).max(8000), previousQuestion: z.string().max(8000).optional()
})
export const FeishuLibraryResult = z.strictObject({
  library: FeishuLibrary, readAt: Instant, question: z.string(), contextQuestion: z.string().max(8000), conditions: z.array(z.string()).max(20),
  state: z.enum(['results', 'clarification']), clarification: z.string().nullable(),
  scanned: z.number().int().nonnegative(), matched: z.number().int().nonnegative(), complete: z.boolean(),
  records: z.array(z.strictObject({ id: z.string(), title: z.string().max(1000), year: z.string().max(100), date: z.string().max(100),
    grade: z.string().max(300), venue: z.string().max(1000), abstract: z.string().max(2000), authors: z.string().max(1000), url: z.string().url() })).max(50),
  limitations: z.array(z.string()).max(20)
})
export type FeishuLibraryResult = z.infer<typeof FeishuLibraryResult>
const empty = z.strictObject({})
function route<B extends z.ZodType, R extends z.ZodType>(method: 'GET'|'POST', path: string, body: B, response: R, keyed = false) {
  return { method, path: `/api/v1/feishu/library${path}`, stage: 'FEISHU1' as const, implemented: true, access: 'session', status: 200,
    idempotent: keyed, rule: 'Named private external source. Current user identity only; bounded live record reads, no Feishu writes, source and completeness receipt.',
    request: z.strictObject({ params: empty, query: empty, body, headers: keyed ? z.strictObject({'Idempotency-Key':z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)}) : empty }),
    response, errors: ErrorResponse, errorStatuses: errorStatus }
}
export const feishuLibraryRoutes = {
  feishuLibraries: route('GET', '', z.null(), data(z.array(FeishuLibrary).max(100))),
  bindFeishuLibrary: route('POST', '/bind', z.strictObject({ url: z.string().min(1).max(2048), instruction: z.string().max(8000), tableId: z.string().regex(/^tbl[A-Za-z0-9]{4,100}$/).optional() }), data(z.discriminatedUnion('state', [
    z.strictObject({state:z.literal('bound'), library:FeishuLibrary}),
    z.strictObject({state:z.literal('choose_table'), tables:z.array(z.strictObject({id:z.string(),name:z.string()})).min(1).max(100)})
  ])), true),
  queryFeishuLibrary: route('POST', '/query', FeishuLibraryQuery, data(FeishuLibraryResult))
}
