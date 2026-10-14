import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { CommunityEntry, CommunityCandidate, GithubMetadata, GithubRepository, communityRoutes } from '@research-agent-platform/contracts'
import { communityCatalogSeed } from './community-catalog-seed.js'
import { transaction } from './database.js'
import { fail } from './errors.js'
import type { Config } from './config.js'

const KEY='community_catalog_v1'
const privateRepository=GithubMetadata.extend({repositoryEtag:z.string().max(512).nullable(),commitEtag:z.string().max(512).nullable()})
const stored=z.strictObject({version:z.number().int().positive(),entries:z.array(CommunityEntry).max(100),repositories:z.record(GithubRepository,privateRepository),candidates:z.array(CommunityCandidate).max(30),sync:z.strictObject({state:z.enum(['never','running','ok','partial','failed']),lastStartedAt:z.string().nullable(),lastFinishedAt:z.string().nullable(),nextCheckAt:z.string().nullable(),discoveryState:z.enum(['never','ok','failed']),discoveryCheckedAt:z.string().nullable(),leaseOwner:z.string().nullable(),leaseUntil:z.string().nullable()})})
type Stored=z.infer<typeof stored>
type CachedRepository=z.infer<typeof privateRepository>
function initial():Stored { return {version:1,entries:communityCatalogSeed.map(e=>CommunityEntry.parse(e)),repositories:{},candidates:[],sync:{state:'never',lastStartedAt:null,lastFinishedAt:null,nextCheckAt:null,discoveryState:'never',discoveryCheckedAt:null,leaseOwner:null,leaseUntil:null}} }
function load(db:DatabaseSync):Stored { const row=db.prepare('SELECT value FROM runtime_meta WHERE key=?').get(KEY);return row?stored.parse(JSON.parse(String(row.value))):initial() }
// All mutations re-read the latest document inside one short SQLite transaction.
// No transaction survives a network await; fencing preserves operator edits.
function mutate(db:DatabaseSync,change:(state:Stored)=>void|boolean) { return transaction(db,()=>{const state=load(db);if(change(state)===false)return state;state.version++;const value=JSON.stringify(stored.parse(state));db.prepare('INSERT INTO runtime_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(KEY,value);return state}) }
export function ensureCommunityCatalog(db:DatabaseSync) { if(!db.prepare('SELECT key FROM runtime_meta WHERE key=?').get(KEY))mutate(db,()=>{}) }
export function readCommunityCatalog(db:DatabaseSync,config:Config) {
  ensureCommunityCatalog(db);const state=load(db)
  const entries=state.entries.map(entry=>{const cached=state.repositories[entry.repository];if(!cached)return {...entry,github:null};const {repositoryEtag:_r,commitEtag:_c,...metadata}=cached;return {...entry,github:GithubMetadata.parse(metadata)}})
  return communityRoutes.communityCatalog.response.parse({data:{version:state.version,entries,candidates:state.candidates,sync:{enabled:config.communitySync.enabled,state:config.communitySync.enabled?state.sync.state:'disabled',lastStartedAt:state.sync.lastStartedAt,lastFinishedAt:state.sync.lastFinishedAt,nextCheckAt:config.communitySync.enabled?state.sync.nextCheckAt:null,discoveryState:state.sync.discoveryState,discoveryCheckedAt:state.sync.discoveryCheckedAt}}})
}
export function readCommunityEntry(db:DatabaseSync,config:Config,id:string) {const entry=readCommunityCatalog(db,config).data.entries.find(e=>e.id===id);if(!entry)fail('NOT_FOUND');return {data:entry} }
export function replaceReviewedCommunityCatalog(db:DatabaseSync,input:unknown) {
  const entries=z.array(CommunityEntry).min(1).max(100).parse(input)
  if(new Set(entries.map(e=>e.id)).size!==entries.length||new Set(entries.map(e=>e.repository)).size>20)throw new Error('Invalid reviewed catalog size or duplicate ids')
  if(entries.some(e=>(e.installable&&e.status!=='offline_reviewed')||(e.localMetadataAdapter&&e.id!=='zotero-mcp')))throw new Error('Reviewed status does not support this installation or adapter')
  return mutate(db,state=>{state.entries=entries;state.candidates=state.candidates.filter(c=>!entries.some(e=>e.repository.toLowerCase()===c.repository.toLowerCase()));state.sync.nextCheckAt=null})
}

const blank=():CachedRepository=>({stars:null,forks:null,pushedAt:null,repositoryUpdatedAt:null,archived:null,defaultBranch:null,latestRevision:null,syncedAt:null,attemptedAt:null,error:null,repositoryEtag:null,commitEtag:null})
class GithubFailure extends Error { constructor(readonly kind:NonNullable<z.infer<typeof GithubMetadata>['error']>,readonly retryAt:number|null=null){super(kind)} }
type GithubFetch=typeof fetch
function midnightAfter(now:number){return new Date((Math.floor((now+8*3600000)/86400000)+1)*86400000-8*3600000).toISOString()}
const repositoryBody=z.object({full_name:z.string().max(200),private:z.literal(false),stargazers_count:z.number().int().nonnegative(),forks_count:z.number().int().nonnegative(),pushed_at:z.iso.datetime().nullable(),updated_at:z.iso.datetime(),archived:z.boolean(),default_branch:z.string().min(1).max(200),size:z.number().nonnegative().optional()})
const candidateBody=repositoryBody.extend({description:z.string().max(2000).nullable(),fork:z.boolean(),license:z.object({spdx_id:z.string().max(200)}).nullable().optional()})
const etag=(response:Response)=>{const value=response.headers.get('etag');return value&&value.length<=512&&!/[\r\n]/.test(value)?value:null}

export class CommunityCatalogWorker {
  private readonly fetcher:GithubFetch
  private readonly now:()=>number
  private readonly stop=new AbortController()
  constructor(private db:DatabaseSync,private config:Config,options:{fetch?:GithubFetch;now?:()=>number}={}) {
    if((options.fetch||options.now)&&config.mode!=='test')throw new Error('Injected GitHub transport/clock is test-only')
    this.fetcher=options.fetch??fetch;this.now=options.now??Date.now
  }
  close(){this.stop.abort()}
  private token(){if(!this.config.communitySync.tokenFile)return null;try{const text=readFileSync(this.config.communitySync.tokenFile,'utf8').trim();if(!/^[A-Za-z0-9_]{1,250}$/.test(text))throw Error();return text}catch{throw new GithubFailure('credentials_unavailable')}}
  private async request(path:string,token:string|null,previousEtag:string|null=null){
    const controller=new AbortController(),abort=()=>controller.abort();this.stop.signal.addEventListener('abort',abort,{once:true});if(this.stop.signal.aborted)abort()
    const timer=setTimeout(abort,8000)
    try {
      const response=await this.fetcher('https://api.github.com'+path,{redirect:'manual',signal:controller.signal,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'AcceptCat-Research-Catalog',...(token?{Authorization:'Bearer '+token}:{}),...(previousEtag?{'If-None-Match':previousEtag}:{})}})
      if(response.status===304)return {unchanged:true as const,body:null,etag:previousEtag}
      if(response.status>=300&&response.status<400)throw new GithubFailure('redirect')
      if(response.status===429||(response.status===403&&(response.headers.get('x-ratelimit-remaining')==='0'||response.headers.has('retry-after')))){
        const reset=Number(response.headers.get('x-ratelimit-reset'))*1000,retry=Number(response.headers.get('retry-after'))*1000
        throw new GithubFailure('rate_limited',Math.max(this.now()+60000,Math.min(this.now()+86400000,reset>this.now()?reset:this.now()+(retry>0?retry:3600000))))
      }
      if(response.status===404)throw new GithubFailure('not_found')
      if(response.status===401)throw new GithubFailure('credentials_unavailable')
      if(!response.ok)throw new GithubFailure('network')
      const reader=response.body?.getReader();if(!reader)throw new GithubFailure('invalid_response')
      const chunks:Uint8Array[]=[];let size=0
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576){await reader.cancel();throw new GithubFailure('invalid_response')}chunks.push(value)}
      let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new GithubFailure('invalid_response')}
      return {unchanged:false as const,body,etag:etag(response)}
    }catch(error){if(error instanceof GithubFailure)throw error;throw new GithubFailure('network')}
    finally{clearTimeout(timer);this.stop.signal.removeEventListener('abort',abort)}
  }
  private async repository(repository:string,old:CachedRepository,token:string|null,at:string):Promise<CachedRepository>{
    const repoPath=new URL(repository).pathname
    const response=await this.request('/repos'+repoPath,token,old.repositoryEtag)
    let current={...old}
    if(!response.unchanged){const parsed=repositoryBody.safeParse(response.body);if(!parsed.success||parsed.data.full_name.toLowerCase()!==repoPath.slice(1).toLowerCase())throw new GithubFailure('invalid_response');const data=parsed.data
      current={...current,stars:data.stargazers_count,forks:data.forks_count,pushedAt:data.pushed_at,repositoryUpdatedAt:data.updated_at,archived:data.archived,defaultBranch:data.default_branch,repositoryEtag:response.etag}
      if(data.size===0)return {...current,latestRevision:null,commitEtag:null,syncedAt:at,attemptedAt:at,error:null}
    }else if(!old.syncedAt||!old.defaultBranch)throw new GithubFailure('invalid_response')
    const latest=await this.request('/repos'+repoPath+'/commits/'+encodeURIComponent(current.defaultBranch!),token,current.defaultBranch===old.defaultBranch?old.commitEtag:null)
    if(!latest.unchanged){const parsed=z.object({sha:z.string().regex(/^[a-f0-9]{40}$/)}).safeParse(latest.body);if(!parsed.success)throw new GithubFailure('invalid_response');current.latestRevision=parsed.data.sha;current.commitEtag=latest.etag}
    else if(!old.latestRevision)throw new GithubFailure('invalid_response')
    return {...current,syncedAt:at,attemptedAt:at,error:null}
  }
  async tick(){
    if(!this.config.communitySync.enabled||this.stop.signal.aborted)return false
    ensureCommunityCatalog(this.db);const owner=randomUUID(),now=this.now(),at=new Date(now).toISOString();let claimed=false
    mutate(this.db,state=>{if((state.sync.leaseUntil&&Date.parse(state.sync.leaseUntil)>now)||(state.sync.nextCheckAt&&Date.parse(state.sync.nextCheckAt)>now))return false;claimed=true;state.sync={...state.sync,state:'running',lastStartedAt:at,leaseOwner:owner,leaseUntil:new Date(now+600000).toISOString()}})
    if(!claimed)return false
    const starting=load(this.db),repositories=[...new Set(starting.entries.map(e=>e.repository))].slice(0,20)
    let successes=0,failures=0,retryAt:number|null=null
    const write=(fn:(state:Stored)=>void)=>mutate(this.db,state=>{if(state.sync.leaseOwner!==owner)return false;fn(state)})
    try{
      let token:string|null
      try{token=this.token()}catch(error){for(const repository of repositories)write(state=>{state.repositories[repository]={...(state.repositories[repository]??blank()),attemptedAt:at,error:'credentials_unavailable'}});throw error}
      for(const repository of repositories){
        if(this.stop.signal.aborted)break
        try{const updated=await this.repository(repository,load(this.db).repositories[repository]??blank(),token,at);write(state=>{state.repositories[repository]=updated});successes++}
        catch(error){const failure=error instanceof GithubFailure?error:new GithubFailure('invalid_response');failures++;write(state=>{state.repositories[repository]={...(state.repositories[repository]??blank()),attemptedAt:at,error:failure.kind}});if(failure.retryAt){retryAt=failure.retryAt;break}}
      }
      if(!retryAt&&!this.stop.signal.aborted){
        try{
          const candidates=new Map<string,z.infer<typeof CommunityCandidate>>()
          const cutoff=new Date(now-183*86400000).toISOString().slice(0,10)
          for(const query of ['scientific skill in:name,description,readme','research agent in:name,description']){
            const result=await this.request('/search/repositories?'+new URLSearchParams({q:`${query} archived:false fork:false pushed:>=${cutoff}`,sort:'updated',order:'desc',per_page:'10'}),token)
            const body=z.object({incomplete_results:z.boolean(),items:z.array(z.unknown()).max(10)}).safeParse(result.body)
            if(!body.success||body.data.incomplete_results)throw new GithubFailure('invalid_response')
            for(const value of body.data.items){const item=candidateBody.safeParse(value);if(!item.success||item.data.archived||item.data.fork)continue;const d=item.data,repo='https://github.com/'+d.full_name;if(!GithubRepository.safeParse(repo).success||starting.entries.some(e=>e.repository.toLowerCase()===repo.toLowerCase()))continue
              const previous=starting.candidates.find(c=>c.repository.toLowerCase()===repo.toLowerCase());candidates.set(repo.toLowerCase(),CommunityCandidate.parse({repository:repo,name:d.full_name,description:d.description,stars:d.stargazers_count,forks:d.forks_count,pushedAt:d.pushed_at,license:d.license?.spdx_id??null,foundAt:previous?.foundAt??at,checkedAt:at,status:'needs_review'}))
            }
          }
          write(state=>{state.candidates=[...candidates.values()].filter(c=>!state.entries.some(e=>e.repository.toLowerCase()===c.repository.toLowerCase())).sort((a,b)=>(b.pushedAt??'').localeCompare(a.pushedAt??'')).slice(0,30);state.sync.discoveryState='ok';state.sync.discoveryCheckedAt=at})
        }catch(error){write(state=>{state.sync.discoveryState='failed'});if(error instanceof GithubFailure&&error.retryAt)retryAt=error.retryAt;failures++}
      }
    }catch{failures++}
    finally{write(state=>{state.sync.state=failures?(successes?'partial':'failed'):'ok';if(this.stop.signal.aborted)state.sync.state='partial';state.sync.lastFinishedAt=new Date(this.now()).toISOString();state.sync.nextCheckAt=retryAt?new Date(retryAt).toISOString():failures||this.stop.signal.aborted?new Date(this.now()+900000).toISOString():state.entries.some(e=>!repositories.includes(e.repository))?null:midnightAfter(this.now());state.sync.leaseOwner=null;state.sync.leaseUntil=null})}
    return true
  }
}
