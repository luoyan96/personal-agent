import { z } from 'zod'
import { Id, Version, Instant, Title, ErrorResponse, errorStatus, data } from './models.js'

export const ResearchCollectionSettings = z.strictObject({
  name: Title, description: z.string().max(4000).default(''),
  scope: z.enum(['owner_private', 'task_scoped', 'lab_shared', 'public']).default('owner_private'),
  taskIds: z.array(Id).max(20).default([]),
}).refine(v => v.scope === 'task_scoped' ? v.taskIds.length > 0 : v.taskIds.length === 0, 'Only task_scoped collections have taskIds')
export const ResearchCollection = z.strictObject({
  id: Id, ownerId: Id, labId: Id, name: Title, description: z.string(),
  scope: z.enum(['owner_private', 'task_scoped', 'lab_shared', 'public']), taskIds: z.array(Id),
  version: Version, status: z.enum(['available', 'withdrawn']), owned: z.boolean(),
  fileCount: z.number().int().nonnegative(), createdAt: Instant, updatedAt: Instant,
})
export type ResearchCollection = z.infer<typeof ResearchCollection>
export const ResearchFileMetadata = z.strictObject({ title: z.string().max(500).default(''), authors: z.array(z.string().max(200)).max(30).default([]), year: z.number().int().min(1000).max(9999).nullable().default(null), doi: z.string().max(300).nullable().default(null), tags: z.array(z.string().max(100)).max(30).default([]), note: z.string().max(4000).default('') })
export const ResearchFileVersion = z.strictObject({ version: Version, filename: Title, mediaType: z.string().max(200), byteLength: z.number().int().positive().max(10485760), sha256: z.string().regex(/^[a-f0-9]{64}$/), metadata: ResearchFileMetadata, extraction: z.enum(['text_extracted', 'original_only', 'extraction_failed']), extractionReason: z.string().nullable(), pageCount: z.number().int().nonnegative(), characterCount: z.number().int().nonnegative(), createdAt: Instant })
export const ResearchFile = ResearchFileVersion.extend({ id: Id, collectionId: Id, status: z.enum(['available', 'withdrawn']), owned: z.boolean() })
export type ResearchFile = z.infer<typeof ResearchFile>
export const ResearchCitation = z.strictObject({ collectionId: Id, collectionVersion: Version, sourceId: Id, version: Version, sha256: z.string().regex(/^[a-f0-9]{64}$/), pageNumber: z.number().int().min(1).max(200), start: z.number().int().nonnegative(), end: z.number().int().positive() }).refine(v => v.end > v.start)
export type ResearchCitation = z.infer<typeof ResearchCitation>
export const ResearchExcerpt = z.strictObject({ citation: ResearchCitation, filename: Title, text: z.string().min(1).max(2000), pageCharacterCount: z.number().int().positive(), partial: z.boolean() })
export type ResearchExcerpt = z.infer<typeof ResearchExcerpt>
export const AgentResearchBindings = z.strictObject({ agentId: Id, version: Version, collectionIds: z.array(Id).max(20), collections: z.array(ResearchCollection).max(20) })
export const ResearchContextSnapshot = z.strictObject({ agentId: Id, bindingVersion: Version, collections: z.array(z.strictObject({ id: Id, version: Version })).max(20), citations: z.array(ResearchCitation).max(20) })
export type ResearchContextSnapshot = z.infer<typeof ResearchContextSnapshot>
export const AgentResearchContext = z.strictObject({ snapshot: ResearchContextSnapshot, excerpts: z.array(ResearchExcerpt).max(20), retrieval: z.enum(['keyword','overview']), characterCount: z.number().int().nonnegative().max(10000), limitation: z.string() })
export type AgentResearchContext = z.infer<typeof AgentResearchContext>
export const ResearchFileImport = z.strictObject({ filename: Title, mediaType: z.string().min(1).max(200).regex(/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/), contentBase64: z.string().min(4).max(13981016).regex(/^[A-Za-z0-9+/]+={0,2}$/).refine(v => v.length % 4 === 0), metadata: ResearchFileMetadata.default({title:'',authors:[],year:null,doi:null,tags:[],note:''}), expectedCollectionVersion: Version, fileId: Id.optional(), expectedVersion: Version.optional() }).refine(v => !!v.fileId === !!v.expectedVersion)
const empty = z.strictObject({}), id = z.strictObject({id:Id}), limit = z.number().int().min(1).max(100).default(50)
function route<P extends z.ZodType,Q extends z.ZodType,B extends z.ZodType,R extends z.ZodType>(method:'GET'|'POST', path:string, params:P, query:Q, body:B, response:R, status=200) {
  return {method,path:`/api/v1/research-library${path}`,stage:'LIBRARY1' as const,implemented:true,access:'session',status,rule:'Current actor authorization before retrieval. Explicit collection scope; Agent publication never shares source material or credentials. Immutable source versions and precise excerpts; revalidate bindings, permissions and versions before using late output.',idempotent:method!=='GET',request:z.strictObject({params,query,body,headers:method==='GET'?empty:z.strictObject({'Idempotency-Key':z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)})}),response,errors:ErrorResponse,errorStatuses:errorStatus}
}
export const researchLibraryRoutes = {
 researchCollections:route('GET','/collections',empty,z.strictObject({scope:z.enum(['mine','visible']).default('visible'),q:z.string().max(300).optional(),limit}),z.null(),data(z.array(ResearchCollection).max(100))),
 createResearchCollection:route('POST','/collections',empty,empty,ResearchCollectionSettings,data(ResearchCollection),201),
 updateResearchCollection:route('POST','/collections/{id}/settings',id,empty,z.strictObject({expectedVersion:Version,settings:ResearchCollectionSettings}),data(ResearchCollection)),
 withdrawResearchCollection:route('POST','/collections/{id}/withdraw',id,empty,z.strictObject({expectedVersion:Version}),data(ResearchCollection)),
 importResearchFile:route('POST','/collections/{id}/files',id,empty,ResearchFileImport,data(ResearchFile),201),
 researchFiles:route('GET','/collections/{id}/files',id,z.strictObject({limit}),z.null(),data(z.array(ResearchFile).max(100))),
 researchFile:route('GET','/files/{id}',id,empty,z.null(),data(z.strictObject({file:ResearchFile,versions:z.array(ResearchFileVersion).max(100),pages:z.array(z.strictObject({pageNumber:z.number().int().positive(),characterCount:z.number().int().nonnegative()})).max(200),preview:z.array(ResearchExcerpt).max(3)}))),
 researchFileContent:route('GET','/files/{id}/content',id,z.strictObject({version:Version.optional()}),z.null(),z.instanceof(Uint8Array)),
 researchFileExcerpt:route('GET','/files/{id}/excerpt',id,z.strictObject({version:Version,pageNumber:z.number().int().min(1).max(200),start:z.number().int().nonnegative(),end:z.number().int().positive()}),z.null(),data(ResearchExcerpt)),
 withdrawResearchFile:route('POST','/files/{id}/withdraw',id,empty,z.strictObject({expectedVersion:Version}),data(ResearchFile)),
 researchLibrarySearch:route('GET','/search',empty,z.strictObject({q:z.string().min(1).max(300),collectionId:Id.optional(),limit:z.number().int().min(1).max(20).default(10)}),z.null(),data(z.array(ResearchExcerpt).max(20))),
 bindAgentResearchCollections:route('POST','/agents/{id}/collections',id,empty,z.strictObject({expectedVersion:Version,collectionIds:z.array(Id).max(20)}),data(AgentResearchBindings)),
 agentResearchCollections:route('GET','/agents/{id}/collections',id,empty,z.null(),data(AgentResearchBindings)),
 agentResearchContext:route('POST','/agents/{id}/context',id,empty,z.strictObject({query:z.string().min(1).max(300),collectionIds:z.array(Id).max(20).optional(),limit:z.number().int().min(1).max(20).default(10)}),data(AgentResearchContext)),
 validateResearchCitations:route('POST','/agents/{id}/validate-citations',id,empty,ResearchContextSnapshot,data(z.strictObject({valid:z.literal(true)}))),
}
