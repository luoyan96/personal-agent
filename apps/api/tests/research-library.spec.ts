import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routes, type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase, seed } from '../src/database.js'
import { provisionTestAccounts } from '../src/auth.js'
import { createServer } from '../src/server.js'
import { syntheticPdf } from '../src/agent-file-smoke.js'
import { backup, restore } from '../src/recovery.js'
import * as agentFiles from '../src/agent-files.js'

const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{vi.restoreAllMocks();for(const fn of cleanup.splice(0).reverse())await fn()})
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex')
async function setup(){
  const dir=mkdtempSync(join(tmpdir(),'research-library-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
  const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'db.sqlite'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'http://127.0.0.1:4497'})
  mkdirSync(config.blobRoot)
  const db=openDatabase(config.databasePath,true);cleanup.push(()=>db.close());migrate(db);seed(db,'test')
  const accounts=['A','B','C'].map(letter=>({memberId:`member_${letter}`,username:`library_${letter}`,password:randomBytes(24).toString('hex')}))
  await provisionTestAccounts(db,'test',accounts)
  let app=createServer(config),url=await app.listen({host:'127.0.0.1',port:0});cleanup.push(()=>app.close())
  const clients:{cookie:string;csrf:string}[]=[]
  const call=async(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,query='',key=randomUUID())=>{
    const route=routes[name],response=await fetch(url+route.path.replace(/\{(\w+)\}/g,(_,k:string)=>params[k]!)+query,{method:route.method,headers:{origin:config.origin,'content-type':'application/json','idempotency-key':key,...(clients[actor]?{cookie:clients[actor].cookie,'x-csrf-token':clients[actor].csrf}:{})},...(route.method==='GET'?{}:{body:JSON.stringify(body)})})
    const bytes=Buffer.from(await response.arrayBuffer()),text=bytes.toString(),value=name==='researchFileContent'&&response.ok?null:JSON.parse(text)
    if(response.ok&&value)route.response.parse(value)
    return {status:response.status,value,text,bytes,cookie:response.headers.get('set-cookie')?.split(';')[0]??'',headers:response.headers}
  }
  const ok=async(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,query='',key=randomUUID())=>{const result=await call(name,body,params,actor,query,key);expect(result.status,result.text).toBeLessThan(300);return result.value.data}
  for(let actor=0;actor<accounts.length;actor++){
    const account=accounts[actor]!,login=await call('login',{username:account.username,password:account.password},{},actor);expect(login.status).toBe(200)
    clients[actor]={cookie:login.cookie,csrf:''};clients[actor]!.csrf=(await ok('session',null,{},actor)).csrfToken
  }
  const create=(name='Synthetic collection',scope='owner_private',taskIds:string[]=[],actor=0)=>ok('createResearchCollection',{name,description:'Synthetic metadata only',scope,taskIds},{},actor)
  const collection=async(id:string,actor=0)=>(await ok('researchCollections',null,{},actor)).find((c:{id:string})=>c.id===id)
  const upload=async(id:string,text='Synthetic SECRET_MARKER source evidence',filename='source.txt',mediaType='text/plain',actor=0,extra:Record<string,unknown>={})=>{
    const c=await collection(id,actor);return ok('importResearchFile',{expectedCollectionVersion:c.version,filename,mediaType,contentBase64:Buffer.from(text).toString('base64'),...extra},{id},actor)
  }
  const own=async(actor=0)=>(await ok('personalConversation',{}, {},actor)).agent.id
  return {dir,db,config,clients,call,ok,create,collection,upload,own,restart:async()=>{await app.close();app=createServer(config);url=await app.listen({host:'127.0.0.1',port:0})}}
}

describe('research library actual HTTP, SQLite and original storage',{timeout:30000},()=>{
  it('keeps private collections and originals invisible before search/page and across accounts, restart and idempotent replay',async()=>{
    const s=await setup(),c=await s.create(),f=await s.upload(c.id),key=randomUUID()
    expect((await s.ok('researchCollections',null,{},1)).length).toBe(0)
    expect(await s.ok('researchLibrarySearch',null,{},1,'?q=SECRET_MARKER&limit=1')).toEqual([])
    for(const name of ['researchFile','researchFileContent','researchFiles'] as const)expect((await s.call(name,null,{id:name==='researchFiles'?c.id:f.id},1)).status).toBe(404)
    expect((await s.call('researchLibrarySearch',null,{},1,`?q=SECRET_MARKER&collectionId=${c.id}`)).status).toBe(404)
    const created=await s.ok('createResearchCollection',{name:'Replay only once'},{},0,'',key)
    expect((await s.ok('createResearchCollection',{name:'Replay only once'},{},0,'',key)).id).toBe(created.id)
    await s.restart()
    expect((await s.ok('researchFile',null,{id:f.id})).preview[0].text).toContain('SECRET_MARKER')
    const original=await s.call('researchFileContent',null,{id:f.id});expect(original.status).toBe(200);expect(sha(original.bytes)).toBe(f.sha256)
    expect(original.headers.get('content-disposition')).toContain('attachment;');expect(original.headers.get('cache-control')).toBe('no-store')
    expect((await s.call('createResearchCollection',{name:'Changed input'},{},0,'',key)).status).toBe(409)
    expect(s.db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('saves immutable revisions, fences older citations and verifies SHA on original download',async()=>{
    const s=await setup(),c=await s.create(),f=await s.upload(c.id),agent=await s.own()
    await s.ok('bindAgentResearchCollections',{expectedVersion:1,collectionIds:[c.id]},{id:agent})
    const context=await s.ok('agentResearchContext',{query:'SECRET_MARKER'},{id:agent})
    expect(context.excerpts[0].citation).toMatchObject({sourceId:f.id,version:1,sha256:f.sha256,pageNumber:1,start:0})
    expect((await s.ok('validateResearchCitations',context.snapshot,{id:agent})).valid).toBe(true)
    const citation=context.excerpts[0].citation,excerptQuery=`?version=1&pageNumber=1&start=${citation.start}&end=${citation.end}`
    expect((await s.ok('researchFileExcerpt',null,{id:f.id},0,excerptQuery)).text).toBe(context.excerpts[0].text)
    expect((await s.call('researchFileExcerpt',null,{id:f.id},1,excerptQuery)).status).toBe(404)
    expect((await s.call('researchFileExcerpt',null,{id:f.id},0,'?version=1&pageNumber=1&start=0&end=2001')).status).toBe(400)
    expect((await s.call('researchFileExcerpt',null,{id:f.id},0,'?version=1&pageNumber=200&start=0&end=1')).status).toBe(422)
    const revised=await s.upload(c.id,'REVISED_MARKER current text','v2.md','text/markdown',0,{fileId:f.id,expectedVersion:1})
    expect(revised.version).toBe(2);expect((await s.ok('researchFile',null,{id:f.id})).versions.map((v:{version:number})=>v.version)).toEqual([2,1])
    expect((await s.call('validateResearchCitations',context.snapshot,{id:agent})).status).toBe(409)
    expect((await s.call('researchFileExcerpt',null,{id:f.id},0,excerptQuery)).status).toBe(409)
    expect((await s.call('researchFileContent',null,{id:f.id},0,'?version=1')).bytes.toString()).toContain('SECRET_MARKER')
    expect(()=>s.db.prepare("UPDATE research_file_versions SET document='{}' WHERE file_id=?").run(f.id)).toThrow('Immutable research source version')
    expect(()=>s.db.prepare("DELETE FROM research_file_pages WHERE file_id=?").run(f.id)).toThrow('Immutable research source text')
    const key=String(s.db.prepare('SELECT blob_key FROM research_file_versions WHERE file_id=? AND version=2').get(f.id)!.blob_key)
    writeFileSync(join(s.config.blobRoot,key),'TAMPERED_SYNTHETIC_CONTENT')
    expect((await s.call('researchFileContent',null,{id:f.id})).status).toBe(503)
  })
  it('extracts PDF/txt/md/csv using existing parser and preserves image/code/unsupported originals without invented text',async()=>{
    const s=await setup(),c=await s.create()
    const pdf=syntheticPdf(),file=await s.ok('importResearchFile',{expectedCollectionVersion:c.version,filename:'synthetic.pdf',mediaType:'application/pdf',contentBase64:pdf.toString('base64')},{id:c.id})
    expect(file.extraction).toBe('text_extracted');expect(file.pageCount).toBe(2)
    expect((await s.call('researchFileContent',null,{id:file.id})).bytes).toEqual(pdf)
    for(const [name,type] of [['table.csv','text/csv'],['notes.md','text/markdown'],['notes.txt','text/plain']])expect((await s.upload(c.id,'CSV_MARKER,value\nsynthetic,1',name,type)).extraction).toBe('text_extracted')
    for(const [name,type] of [['image.png','image/png'],['script.py','text/x-python'],['assets.zip','application/zip']]){
      const f=await s.upload(c.id,'SYNTHETIC_ORIGINAL_ONLY',name,type);expect(f.extraction).toBe('original_only');expect(f.pageCount).toBe(0)
      expect((await s.ok('researchFile',null,{id:f.id})).preview).toEqual([])
      expect((await s.call('researchFileContent',null,{id:f.id})).bytes.toString()).toBe('SYNTHETIC_ORIGINAL_ONLY')
    }
    const bad=await s.upload(c.id,'%PDF-1.4\nbroken','broken.pdf','application/pdf');expect(bad.extraction).toBe('extraction_failed');expect(bad.extractionReason).toBe('FILE_PARSE_FAILED')
    expect(await s.ok('researchLibrarySearch',null,{},0,'?q=SYNTHETIC_ORIGINAL_ONLY')).toEqual([])
  })
  it('bounds keyword snippets, preserves exact char coordinates and rejects changes to agent bindings',async()=>{
    const s=await setup(),c=await s.create(),agent=await s.own()
    for(let i=0;i<12;i++)await s.upload(c.id,'🙂 '+(' synthetic_keyword evidence '.repeat(120))+'尾部')
    await s.ok('bindAgentResearchCollections',{expectedVersion:1,collectionIds:[c.id]},{id:agent})
    const context=await s.ok('agentResearchContext',{query:'synthetic_keyword',limit:20},{id:agent})
    expect(context.characterCount).toBeLessThanOrEqual(10000);expect(context.characterCount).toBe(context.excerpts.reduce((n:number,e:{text:string})=>n+e.text.length,0))
    for(const e of context.excerpts){const p=s.db.prepare('SELECT text FROM research_file_pages WHERE file_id=? AND version=? AND page_number=?').get(e.citation.sourceId,e.citation.version,e.citation.pageNumber)!;expect(String(p.text).slice(e.citation.start,e.citation.end)).toBe(e.text);expect(e.pageCharacterCount).toBe(String(p.text).length)}
    expect((await s.ok('agentResearchContext',{query:'absent_keyword'},{id:agent})).excerpts).toEqual([])
    expect((await s.call('agentResearchContext',{query:'synthetic_keyword'},{id:agent},1)).status).toBe(404)
    const foreign=await s.own(1);expect((await s.call('bindAgentResearchCollections',{expectedVersion:1,collectionIds:[c.id]},{id:foreign},1)).status).toBe(404)
    await s.ok('bindAgentResearchCollections',{expectedVersion:2,collectionIds:[]},{id:agent})
    expect((await s.call('validateResearchCitations',context.snapshot,{id:agent})).status).toBe(409)
  })
  it('applies existing full task ACL before retrieval and blocks late citations and cached contexts on withdrawal',async()=>{
    const s=await setup(),schedule={suggested:null,hardDeadline:null,committed:null,estimatedHumanHours:null,checkpoint:null}
    const p=await s.ok('createPlan',{labId:'lab_synthetic',goal:'Synthetic goal',proposedItems:[{id:'one',title:'Synthetic task',goal:'Synthetic goal',deliverable:'Result',acceptanceCriteria:'Evidence',allocation:{kind:'invitation',memberId:'member_B'},dependencies:[],schedule,inputArtifactIds:[],budget:null}],unresolvedQuestions:[]})
    const confirmed=await s.ok('confirmPlan',{expectedVersion:1},{id:p.id}),task=confirmed.taskIds[0]
    const c=await s.create('Scoped sources','task_scoped',[task]),f=await s.upload(c.id)
    expect((await s.ok('researchCollections',null,{},1)).length).toBe(0)
    const invitation=(await s.ok('task',null,{id:task},1)).pendingInvitation
    await s.ok('invitationDecision',{expectedVersion:invitation.version,expectedTaskVersion:1,decision:'accepted',comment:null},{id:invitation.id},1)
    expect((await s.ok('researchCollections',null,{},1))[0].id).toBe(c.id)
    const agent=await s.own(1);await s.ok('bindAgentResearchCollections',{expectedVersion:1,collectionIds:[c.id]},{id:agent},1)
    const key=randomUUID(),context=await s.ok('agentResearchContext',{query:'SECRET_MARKER'},{id:agent},1,'',key)
    const current=(await s.ok('task',null,{id:task})).task
    await s.ok('revokeAccess',{expectedVersion:current.version,memberId:'member_B',reason:'Synthetic revocation'},{id:task})
    expect((await s.call('validateResearchCitations',context.snapshot,{id:agent},1)).status).toBe(404)
    expect((await s.call('agentResearchContext',{query:'SECRET_MARKER'},{id:agent},1,'',key)).status).toBe(404)
    expect(await s.ok('researchLibrarySearch',null,{},1,'?q=SECRET_MARKER')).toEqual([])
    expect((await s.call('researchFileContent',null,{id:f.id},1)).status).toBe(404)
    const ref=context.excerpts[0].citation
    expect((await s.call('researchFileExcerpt',null,{id:f.id},1,`?version=${ref.version}&pageNumber=${ref.pageNumber}&start=${ref.start}&end=${ref.end}`)).status).toBe(404)
    const owner=await s.own();await s.ok('bindAgentResearchCollections',{expectedVersion:1,collectionIds:[c.id]},{id:owner})
    const ownContext=await s.ok('agentResearchContext',{query:'SECRET_MARKER'},{id:owner})
    await s.ok('withdrawResearchFile',{expectedVersion:f.version},{id:f.id})
    expect((await s.call('validateResearchCitations',ownContext.snapshot,{id:owner})).status).toBe(409)
    expect((await s.call('researchFileContent',null,{id:f.id},0,'?version=1')).status).toBe(404)
  })
  it('makes lab/public sharing explicit, does not grant other actors write rights and fences scope changes',async()=>{
    const s=await setup(),c=await s.create('Lab shared','lab_shared'),f=await s.upload(c.id),agent=await s.own(1)
    const username=`outside_library_${randomUUID().slice(0,8)}`,password=randomBytes(24).toString('hex')
    await s.ok('register',{username,password,displayName:'Synthetic outside personal space'},{},3)
    const outside=await s.call('login',{username,password},{},3);expect(outside.status).toBe(200)
    s.clients[3]={cookie:outside.cookie,csrf:''};s.clients[3]!.csrf=(await s.ok('session',null,{},3)).csrfToken
    expect(await s.ok('researchCollections',null,{},3)).toEqual([])
    expect((await s.call('researchFileContent',null,{id:f.id},3)).status).toBe(404)
    expect((await s.ok('researchFiles',null,{id:c.id},1))[0].id).toBe(f.id)
    expect((await s.call('updateResearchCollection',{expectedVersion:2,settings:{name:'Attempted change',scope:'public'}},{id:c.id},1)).status).toBe(404)
    expect((await s.call('importResearchFile',{expectedCollectionVersion:2,filename:'unauthorized.txt',mediaType:'text/plain',contentBase64:Buffer.from('Synthetic forbidden import').toString('base64')},{id:c.id},1)).status).toBe(404)
    await s.ok('bindAgentResearchCollections',{expectedVersion:1,collectionIds:[c.id]},{id:agent},1)
    const context=await s.ok('agentResearchContext',{query:'SECRET_MARKER'},{id:agent},1)
    await s.ok('updateResearchCollection',{expectedVersion:2,settings:{name:c.name,description:c.description,scope:'owner_private',taskIds:[]}},{id:c.id})
    expect((await s.call('validateResearchCitations',context.snapshot,{id:agent},1)).status).toBe(404)
    expect((await s.call('researchFile',null,{id:f.id},1)).status).toBe(404)
    const publicCollection=await s.ok('updateResearchCollection',{expectedVersion:3,settings:{name:c.name,scope:'public'}},{id:c.id})
    expect((await s.ok('researchCollections',null,{},2))[0].id).toBe(c.id)
    expect((await s.ok('researchCollections',null,{},3))[0].id).toBe(c.id)
    expect((await s.call('researchFileContent',null,{id:f.id},3)).status).toBe(200)
    await s.ok('withdrawResearchCollection',{expectedVersion:publicCollection.version},{id:c.id})
    expect(await s.ok('researchCollections',null,{},2)).toEqual([])
    expect(await s.ok('researchLibrarySearch',null,{},3,'?q=SECRET_MARKER')).toEqual([])
    expect((await s.call('researchFileContent',null,{id:f.id},2)).status).toBe(404)
  })
  it('includes all original source versions in backup and restores their verified bytes without reviving sessions',async()=>{
    const s=await setup(),c=await s.create(),f=await s.upload(c.id)
    await s.upload(c.id,'Version two synthetic bytes','v2.txt','text/plain',0,{fileId:f.id,expectedVersion:1})
    const destination=join(s.dir,'backup'),restored=join(s.dir,'restored')
    expect(backup(s.config,destination,'synthetic-operator','a'.repeat(40),'synthetic-config').artifacts).toBe(2)
    const manifest=JSON.parse(readFileSync(join(destination,'manifest.json'),'utf8'));expect(manifest.files).toHaveLength(2)
    expect(restore(destination,restored,'synthetic-operator').artifacts).toBe(2)
    const db=openDatabase(join(restored,'platform.sqlite'));try{
      expect(db.prepare('SELECT count(*) n FROM research_file_versions').get()!.n).toBe(2)
      expect(db.prepare('SELECT count(*) n FROM sessions WHERE revoked_at IS NULL').get()!.n).toBe(0)
      for(const v of db.prepare('SELECT blob_key,document FROM research_file_versions').all()){const doc=JSON.parse(String(v.document));expect(sha(readFileSync(join(restored,'blobs',String(v.blob_key))))).toBe(doc.sha256)}
    }finally{db.close()}
  })
  it('retrieves reproducible Chinese keywords and reads bounded overview only for an explicit materials request',async()=>{
    const s=await setup(),c=await s.create(),agent=await s.own(),f=await s.upload(c.id,'实验设计与数据分析：这是合成科研文本。\n'+('公开合成证据。'.repeat(800)))
    await s.ok('bindAgentResearchCollections',{expectedVersion:1,collectionIds:[c.id]},{id:agent})
    const matched=await s.ok('agentResearchContext',{query:'请解释这个实验设计的注意事项'},{id:agent})
    expect(matched.retrieval).toBe('keyword');expect(matched.excerpts[0].citation.sourceId).toBe(f.id)
    const ordinary=await s.ok('agentResearchContext',{query:'明天当地天气怎么样'},{id:agent});expect(ordinary.excerpts).toEqual([])
    const overview=await s.ok('agentResearchContext',{query:'请概括这些资料'},{id:agent})
    expect(overview.retrieval).toBe('overview');expect(overview.excerpts[0].citation.start).toBe(0);expect(overview.excerpts[0].partial).toBe(true);expect(overview.characterCount).toBeLessThanOrEqual(10000)
    expect(overview.limitation).toContain('not full-document reading')
    expect((await s.ok('researchLibrarySearch',null,{},1,'?q='+encodeURIComponent('实验设计')))).toEqual([])
  })
  it('reauthorizes after asynchronous parsing and leaves no stored source or blob when collection was withdrawn',async()=>{
    const s=await setup(),c=await s.create(),original=agentFiles.extractAgentFile
    let release!:()=>void,started!:()=>void
    const ready=new Promise<void>(resolve=>{started=resolve}),gate=new Promise<void>(resolve=>{release=resolve})
    vi.spyOn(agentFiles,'extractAgentFile').mockImplementation(async(...args)=>{const parsed=await original(...args);started();await gate;return parsed})
    const pending=s.call('importResearchFile',{expectedCollectionVersion:c.version,filename:'pending.txt',mediaType:'text/plain',contentBase64:Buffer.from('Synthetic pending input').toString('base64')},{id:c.id})
    await ready
    await s.ok('withdrawResearchCollection',{expectedVersion:c.version},{id:c.id})
    release();expect((await pending).status).toBe(404)
    expect(s.db.prepare('SELECT count(*) n FROM research_files').get()!.n).toBe(0)
    expect(readdirSync(s.config.blobRoot)).toEqual([])
  })
  it('ignores question boilerplate, keeps complete experiment IDs and ranks relevant authorized pages before limit',async()=>{
    const s=await setup(),c=await s.create(),agent=await s.own()
    await s.upload(c.id,'This is an unrelated page. The experiment value is 713. LX-7139 is a different identifier.')
    const weak=await s.upload(c.id,'Some experiment information is in this generic source.')
    const relevant=await s.upload(c.id,'General experiment background. '.repeat(120)+'LX-713 uses eight synthetic samples in the experiment.')
    const privateCollection=await s.create('Other owner private', 'owner_private',[],1)
    await s.upload(privateCollection.id,'LX-713 experiment experiment experiment hidden high relevance source','secret.txt','text/plain',1)
    await s.ok('bindAgentResearchCollections',{expectedVersion:1,collectionIds:[c.id]},{id:agent})
    expect((await s.ok('agentResearchContext',{query:'What is ZZ-NOMATCH-999?'},{id:agent})).excerpts).toEqual([])
    expect((await s.ok('agentResearchContext',{query:'请问这些资料中的 ZZ-NOMATCH-999 是什么'},{id:agent})).excerpts).toEqual([])
    const exact=await s.ok('agentResearchContext',{query:'What is LX-713?',limit:1},{id:agent})
    expect(exact.excerpts).toHaveLength(1);expect(exact.excerpts[0].citation.sourceId).toBe(relevant.id)
    const ranked=await s.ok('researchLibrarySearch',null,{},0,'?q='+encodeURIComponent('LX-713 experiment')+'&limit=1')
    expect(ranked[0].citation.sourceId).toBe(relevant.id);expect(ranked[0].citation.sourceId).not.toBe(weak.id)
    expect(ranked[0].text).toContain('LX-713 uses eight')
    expect(ranked[0].text).not.toContain('hidden high relevance')
  })
})
