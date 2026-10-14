import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readConfig } from '../src/config.js'
import { openDatabase, migrate } from '../src/database.js'
import { CommunityCatalogWorker, readCommunityCatalog, replaceReviewedCommunityCatalog } from '../src/community-catalog.js'
import { communityCatalogSeed } from '../src/community-catalog-seed.js'
import { createServer } from '../src/server.js'
import { CommunityEntry, GithubRepository } from '@research-agent-platform/contracts'

const clean:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const f of clean.splice(0).reverse())await f()})
function setup(){const dir=mkdtempSync(join(tmpdir(),'community-catalog-'));clean.push(()=>rmSync(dir,{recursive:true,force:true}));const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'db.sqlite'),BLOB_ROOT:join(dir,'blobs'),GITHUB_CATALOG_SYNC:'1'});const db=openDatabase(config.databasePath,true);migrate(db);clean.push(()=>db.close());return {db,config}}
const json=(body:unknown,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{headers})
let moment=Date.parse('2026-10-14T16:02:00Z')
function transport(options:{etagOnly?:boolean;fault?:string;stars?:number;candidate?:string}={}) {
 const calls:{url:string;headers:Headers}[]=[]
 const fetcher=(async(input:unknown,init?:RequestInit)=>{const url=String(input),headers=new Headers(init?.headers);calls.push({url,headers})
  if(options.fault==='rate')return new Response('secret upstream failure text',{status:403,headers:{'x-ratelimit-remaining':'0','x-ratelimit-reset':String(Math.floor((moment+3600000)/1000))}})
  if(url.includes('/search/')){if(options.fault==='search')return json({incomplete_results:true,items:[]});return json({incomplete_results:false,items:[{full_name:options.candidate||'synthetic-lab/research-skill',private:false,stargazers_count:37,forks_count:5,pushed_at:'2026-10-13T09:00:00Z',updated_at:'2026-10-13T10:00:00Z',archived:false,fork:false,default_branch:'main',description:'Public synthetic research workflow',license:{spdx_id:'MIT'}}]})}
  if(options.fault==='redirect')return new Response('',{status:302,headers:{location:'http://127.0.0.1/private'}})
  if(options.fault==='private')return json({full_name:'private/secret',private:true})
  if(options.fault==='large')return new Response('x'.repeat(1048577))
  if(options.etagOnly&&headers.get('if-none-match'))return new Response(null,{status:304})
  if(url.includes('/commits/'))return json({sha:'b'.repeat(40)},{etag:'"commit-v1"'})
  const full_name=new URL(url).pathname.replace('/repos/','');return json({full_name,private:false,stargazers_count:options.stars??1234,forks_count:56,pushed_at:'2026-10-13T09:00:00Z',updated_at:'2026-10-14T09:00:00Z',archived:false,default_branch:'main',size:123},{etag:'"repo-v1"'})
 }) as typeof fetch
 return {calls,fetch:fetcher}
}
const clock=()=>moment

describe('Community catalog / daily public GitHub synchronization',{timeout:15000},()=>{
 it('serves reviewed entries via authenticated real HTTP; GET does no GitHub I/O and exposes no private cache fields',async()=>{
  const s=setup(),app=createServer(s.config);clean.push(()=>app.close());await app.ready()
  expect((await app.inject({url:'/api/v1/community-catalog'})).statusCode).toBe(401)
  await app.inject({method:'POST',url:'/api/v1/auth/register',headers:{origin:s.config.origin,'idempotency-key':'community_register_001'},payload:{username:'catalog_http',password:'12345678',displayName:'合成科研目录用户'}})
  const login=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:s.config.origin},payload:{username:'catalog_http',password:'12345678'}});expect(login.statusCode).toBe(200)
  const cookie=String(login.headers['set-cookie']).split(';')[0]!
  const response=await app.inject({url:'/api/v1/community-catalog',headers:{cookie}});expect(response.statusCode).toBe(200)
  expect(response.json().data.entries).toHaveLength(4);expect(response.json().data.entries.every((e:{github:unknown})=>e.github===null)).toBe(true)
  expect(response.json().data.sync.state).toBe('never');expect(response.body).not.toMatch(/tokenFile|leaseOwner|repositoryEtag|Bearer|12345678/)
  expect((await app.inject({url:'/api/v1/community-catalog/peer-review',headers:{cookie}})).json().data.revision).toBe(communityCatalogSeed[1]!.revision)
  expect((await app.inject({url:'/api/v1/community-catalog/unknown',headers:{cookie}})).statusCode).toBe(404)
  expect((await app.inject({method:'POST',url:'/api/v1/community-catalog',headers:{cookie,origin:s.config.origin},payload:{installable:true}})).statusCode).toBe(404)
 })
 it('deduplicates shared repositories, persists live facts/candidates and schedules next Beijing midnight without moving reviewed commits',async()=>{
  moment=Date.parse('2026-10-14T16:02:00Z');const s=setup(),upstream=transport();const worker=new CommunityCatalogWorker(s.db,s.config,{fetch:upstream.fetch,now:clock})
  expect(await worker.tick()).toBe(true);expect(upstream.calls).toHaveLength(8)
  const result=readCommunityCatalog(s.db,s.config).data
  expect(result.sync).toMatchObject({state:'ok',discoveryState:'ok',nextCheckAt:'2026-10-15T16:00:00.000Z'})
  expect(result.entries[0]!.github).toMatchObject({stars:1234,forks:56,latestRevision:'b'.repeat(40),error:null})
  expect(result.entries.map(e=>e.revision)).toEqual(communityCatalogSeed.map(e=>e.revision))
  expect(result.candidates).toHaveLength(1);expect(result.candidates[0]!.status).toBe('needs_review')
  const version=result.version;expect(await worker.tick()).toBe(false);expect(readCommunityCatalog(s.db,s.config).data.version).toBe(version);expect(upstream.calls).toHaveLength(8)
  const another=openDatabase(s.config.databasePath);try{expect(readCommunityCatalog(another,s.config).data).toEqual(result)}finally{another.close()}
  expect(JSON.stringify(result)).not.toMatch(/repositoryEtag|commitEtag|leaseOwner/)
 })
 it('uses independent ETags and retains validated metadata on 304 with another successful check timestamp',async()=>{
  const s=setup();moment=Date.parse('2026-10-14T16:02:00Z');await new CommunityCatalogWorker(s.db,s.config,{fetch:transport().fetch,now:clock}).tick()
  moment+=86400000;const upstream=transport({etagOnly:true});await new CommunityCatalogWorker(s.db,s.config,{fetch:upstream.fetch,now:clock}).tick()
  expect(upstream.calls.filter(c=>c.headers.has('if-none-match'))).toHaveLength(6)
  expect(readCommunityCatalog(s.db,s.config).data.entries[0]!.github).toMatchObject({stars:1234,latestRevision:'b'.repeat(40),syncedAt:new Date(moment).toISOString(),error:null})
 })
 it('backs off rate limits globally and preserves last good stars/candidates instead of inventing zeros',async()=>{
  const s=setup();moment=Date.parse('2026-10-14T16:02:00Z');await new CommunityCatalogWorker(s.db,s.config,{fetch:transport().fetch,now:clock}).tick()
  moment+=86400000;const upstream=transport({fault:'rate'});const worker=new CommunityCatalogWorker(s.db,s.config,{fetch:upstream.fetch,now:clock});await worker.tick()
  const result=readCommunityCatalog(s.db,s.config).data;expect(upstream.calls).toHaveLength(1);expect(result.entries[0]!.github).toMatchObject({stars:1234,error:'rate_limited'});expect(result.candidates).toHaveLength(1)
  expect(Date.parse(result.sync.nextCheckAt!)).toBe(moment+3600000);expect(await worker.tick()).toBe(false)
  expect(JSON.stringify(result)).not.toContain('secret upstream failure text')
 })
 for(const fault of ['redirect','private','large'])it(`rejects ${fault} responses and does not follow URLs or promote unsafe metadata`,async()=>{
  moment=Date.parse('2026-10-14T16:02:00Z');const s=setup(),upstream=transport({fault});await new CommunityCatalogWorker(s.db,s.config,{fetch:upstream.fetch,now:clock}).tick()
  const result=readCommunityCatalog(s.db,s.config).data;expect(result.entries[0]!.github!.stars).toBe(null);expect(result.entries[0]!.github!.error).not.toBeNull();expect(upstream.calls.every(c=>c.url.startsWith('https://api.github.com/'))).toBe(true);expect(JSON.stringify(result)).not.toContain('127.0.0.1/private')
 })
 it('incomplete discovery keeps the last candidate list; failures retry in fifteen minutes',async()=>{
  const s=setup();moment=Date.parse('2026-10-14T16:02:00Z');await new CommunityCatalogWorker(s.db,s.config,{fetch:transport().fetch,now:clock}).tick();moment+=86400000
  await new CommunityCatalogWorker(s.db,s.config,{fetch:transport({fault:'search',stars:2000}).fetch,now:clock}).tick()
  const result=readCommunityCatalog(s.db,s.config).data;expect(result.candidates).toHaveLength(1);expect(result.sync).toMatchObject({state:'partial',discoveryState:'failed',nextCheckAt:new Date(moment+900000).toISOString()});expect(result.entries[0]!.github!.stars).toBe(2000)
 })
 it('concurrent lease skips network work and late sync merges metadata without overwriting reviewed catalog edits',async()=>{
  const s=setup();moment=Date.parse('2026-10-14T16:02:00Z');const upstream=transport();let release!:()=>void;const hold=new Promise<void>(r=>{release=r});let started!:()=>void;const ready=new Promise<void>(r=>{started=r});let first=true
  const fetcher=(async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{if(first){first=false;started();await hold}return upstream.fetch(input,init)}) as typeof fetch
  const flight=new CommunityCatalogWorker(s.db,s.config,{fetch:fetcher,now:clock}).tick();await ready
  const version=readCommunityCatalog(s.db,s.config).data.version;expect(await new CommunityCatalogWorker(s.db,s.config,{fetch:transport().fetch,now:clock}).tick()).toBe(false);expect(readCommunityCatalog(s.db,s.config).data.version).toBe(version)
  const edited=communityCatalogSeed.map(e=>({...e}));edited[0]={...edited[0]!,revision:'c'.repeat(40),name:'操作者重新审阅后的名称'};replaceReviewedCommunityCatalog(s.db,edited)
  release();await flight;const result=readCommunityCatalog(s.db,s.config).data;expect(result.entries[0]).toMatchObject({name:'操作者重新审阅后的名称',revision:'c'.repeat(40),github:{latestRevision:'b'.repeat(40)}})
 })
 it('operator reviewed catalog can add an entry without a new client; candidates cannot install or change the reviewed list over HTTP',async()=>{
  const s=setup(),original=readCommunityCatalog(s.db,s.config).data.entries
  replaceReviewedCommunityCatalog(s.db,[...original.map(({github:_g,...entry})=>entry),{...communityCatalogSeed[0]!,id:'new-public-workflow',name:'合成新增科研流程',installable:false}])
  expect(readCommunityCatalog(s.db,s.config).data.entries).toHaveLength(5)
  expect(()=>replaceReviewedCommunityCatalog(s.db,[{...communityCatalogSeed[0]!,repository:'http://127.0.0.1/private'}])).toThrow()
  expect(()=>replaceReviewedCommunityCatalog(s.db,[{...communityCatalogSeed[0]!,status:'needs_connector',installable:true}])).toThrow()
  expect(()=>replaceReviewedCommunityCatalog(s.db,[{...communityCatalogSeed[0]!,localMetadataAdapter:true}])).toThrow()
  expect(GithubRepository.safeParse('https://github.com/../secret').success).toBe(false)
  expect(CommunityEntry.safeParse({...communityCatalogSeed[0]!,sourcePath:'../private'}).success).toBe(false)
  expect(CommunityEntry.safeParse({...communityCatalogSeed[0]!,discussions:[{label:'bad',url:'javascript:alert(1)'}]}).success).toBe(false)
 })
 it('disabling the service performs no network work; custom production transports are forbidden',async()=>{
  const s=setup(),upstream=transport(),config={...s.config,communitySync:{...s.config.communitySync,enabled:false}}
  expect(await new CommunityCatalogWorker(s.db,config,{fetch:upstream.fetch,now:clock}).tick()).toBe(false);expect(upstream.calls).toHaveLength(0);expect(readCommunityCatalog(s.db,config).data.sync.state).toBe('disabled')
  expect(()=>new CommunityCatalogWorker(s.db,{...s.config,mode:'production'},{fetch:upstream.fetch})).toThrow(/test-only/)
 })
})
