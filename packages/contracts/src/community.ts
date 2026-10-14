import { z } from 'zod'
import { Id, Instant, ErrorResponse, errorStatus, data } from './models.js'

export const ResearchCategory = z.enum(['全部','文献与阅读','写作与表达','研究设计','图表与可视化','数据与代码','课题协作'])
export const GithubRepository = z.string().regex(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).max(220).refine(v=>!v.slice('https://github.com/'.length).split('/').some(p=>p==='.'||p==='..'))
export const CommunityEntry = z.strictObject({
  id:Id, name:z.string().min(1).max(200), category:ResearchCategory,
  author:z.string().min(1).max(200), summary:z.string().min(1).max(2000), input:z.string().min(1).max(4000),
  deliverables:z.string().min(1).max(4000), prerequisites:z.string().min(1).max(4000), costs:z.string().min(1).max(4000),
  materials:z.string().min(1).max(4000), limitations:z.string().min(1).max(8000), validation:z.string().min(1).max(8000),
  status:z.enum(['offline_reviewed','needs_connector']), version:z.string().min(1).max(200), reviewedAt:z.iso.date(),
  license:z.string().min(1).max(300), repository:GithubRepository, revision:z.string().regex(/^[a-f0-9]{40}$/),
  sourcePath:z.string().min(1).max(300).regex(/^[A-Za-z0-9_.\/-]+$/).refine(v=>!v.split('/').some(p=>!p||p==='.'||p==='..')),
  installable:z.boolean(), localMetadataAdapter:z.boolean().optional(), discussions:z.array(z.strictObject({label:z.string().min(1).max(200),url:z.string().url().max(1000).refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password})})).max(20),
})
export const GithubMetadata = z.strictObject({
  stars:z.number().int().nonnegative().nullable(), forks:z.number().int().nonnegative().nullable(),
  pushedAt:Instant.nullable(), repositoryUpdatedAt:Instant.nullable(), archived:z.boolean().nullable(), defaultBranch:z.string().max(200).nullable(),
  latestRevision:z.string().regex(/^[a-f0-9]{40}$/).nullable(), syncedAt:Instant.nullable(), attemptedAt:Instant.nullable(),
  error:z.enum(['network','rate_limited','not_found','redirect','invalid_response','credentials_unavailable']).nullable(),
})
export const CommunityCatalogItem = CommunityEntry.extend({github:GithubMetadata.nullable()})
export const CommunityCandidate = z.strictObject({
  repository:GithubRepository, name:z.string().min(1).max(200), description:z.string().max(2000).nullable(),
  stars:z.number().int().nonnegative(), forks:z.number().int().nonnegative(), pushedAt:Instant.nullable(), license:z.string().max(200).nullable(),
  foundAt:Instant, checkedAt:Instant, status:z.literal('needs_review'),
})
export const CommunitySync = z.strictObject({
  enabled:z.boolean(), state:z.enum(['never','running','ok','partial','failed','disabled']),
  lastStartedAt:Instant.nullable(), lastFinishedAt:Instant.nullable(), nextCheckAt:Instant.nullable(),
  discoveryState:z.enum(['never','ok','failed']), discoveryCheckedAt:Instant.nullable(),
})
const empty=z.strictObject({})
const route=<P extends z.ZodType,R extends z.ZodType>(path:string,params:P,response:R,rule:string)=>({method:'GET' as const,path:'/api/v1'+path,stage:'B5b' as const,status:200,access:'session',rule,implemented:true,idempotent:false,request:z.strictObject({params,query:empty,headers:empty,body:z.null()}),response,errors:ErrorResponse,errorStatuses:errorStatus})
export const communityRoutes={
  communityCatalog:route('/community-catalog',empty,data(z.strictObject({version:z.number().int().positive(),entries:z.array(CommunityCatalogItem).max(100),candidates:z.array(CommunityCandidate).max(30),sync:CommunitySync})), 'Authenticated read of operator-reviewed catalog, cached public GitHub facts and explicitly unreviewed discoveries. No upstream code, private data, model keys or implicit installation. Reads perform no GitHub I/O.'),
  communityCatalogEntry:route('/community-catalog/{id}',z.strictObject({id:Id}),data(CommunityCatalogItem),'Current reviewed catalog entry only; a candidate is not installable. Return exact reviewed commit independent from latest upstream revision.'),
} as const
export type CommunityEntry=z.infer<typeof CommunityEntry>
export type GithubMetadata=z.infer<typeof GithubMetadata>
export type CommunityCandidate=z.infer<typeof CommunityCandidate>
