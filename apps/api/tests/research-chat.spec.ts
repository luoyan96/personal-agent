import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { routes, type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { openDatabase, migrate } from '../src/database.js'
import { createServer } from '../src/server.js'
import { ChatWorker } from '../src/chat-worker.js'
import { chatInputTokenBound } from '../src/chat-model-input.js'
import type { ModelCall, ModelResult } from '../src/execution-worker.js'

const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
const result=(text:string):ModelResult=>({text,failure:null,inputTokens:81,outputTokens:23,elapsedMs:10})
async function setup(){
  const dir=mkdtempSync(join(tmpdir(),'acceptcat-library-chat-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
  const key=join(dir,'synthetic.key');writeFileSync(key,randomBytes(32).toString('hex'))
  const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'db.sqlite'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'http://127.0.0.1:4496',B3_AI_ENABLED:'1',LAB_CREDENTIAL_KEY_FILE:key})
  mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);migrate(db);cleanup.push(()=>db.close())
  const app=createServer(config),url=await app.listen({host:'127.0.0.1',port:0});cleanup.push(()=>app.close())
  let cookie='',csrf=''
  async function call(name:RouteName,body:unknown=null,id?:string,query:Record<string,string|number>={}){
    const route=routes[name],r=await fetch(url+route.path.replace('{id}',id??'')+'?'+new URLSearchParams(Object.entries(query).map(([k,v])=>[k,String(v)])),{method:route.method,headers:{origin:config.origin,'content-type':'application/json','idempotency-key':randomUUID(),cookie,'x-csrf-token':csrf},...(route.method==='GET'?{}:{body:JSON.stringify(body)})})
    return {status:r.status,value:await r.json() as any,cookie:r.headers.get('set-cookie')?.split(';')[0]??''}
  }
  const ok=async(name:RouteName,body:unknown=null,id?:string,query:Record<string,string|number>={})=>{const r=await call(name,body,id,query);expect(r.status,JSON.stringify(r.value)).toBe(routes[name].status);return r.value.data}
  const username='library_chat_'+randomUUID().slice(0,8),password='synthetic-only-123'
  await ok('register',{username,password,displayName:'合成科研用户'})
  cookie=(await call('login',{username,password})).cookie;csrf=(await ok('session')).csrfToken
  await ok('createPersonalModel',{name:'合成模型',provider:'deepseek',model:'deepseek-flash',apiKey:'synthetic-not-a-live-key',enabled:true})
  const own=await ok('personalConversation',{}),agent=await ok('createPersonalAgent',{displayName:'资料研究员',introduction:'合成试验',capabilityDescription:'依据资料回答',personality:'简洁'})
  const direct=await ok('createDirectConversation',{contactId:agent.id})
  const collection=await ok('createResearchCollection',{name:'合成方法资料',scope:'owner_private',taskIds:[],description:''})
  const collectionNow=async()=>(await ok('researchCollections',null,undefined,{scope:'mine'})).find((v:any)=>v.id===collection.id)
  const upload=async(text='LX-713 synthetic experiment uses 8 samples. SOURCE_SECRET_713 is a source marker.',extra:Record<string,unknown>={})=>ok('importResearchFile',{expectedCollectionVersion:(await collectionNow()).version,filename:'method.txt',mediaType:'text/plain',contentBase64:Buffer.from(text).toString('base64'),...extra},collection.id)
  const file=await upload(),bind=async(ids:string[],expectedVersion?:number)=>ok('bindAgentResearchCollections',{expectedVersion:expectedVersion??(await ok('agentResearchCollections',null,agent.id)).version,collectionIds:ids},agent.id)
  await bind([collection.id])
  const send=(text='What is LX-713?',continuous=false)=>ok('agentChatMessage',{text,continuous},direct.id)
  const tick=(model:ModelCall)=>new ChatWorker(db,config,model,undefined,()=>Date.now()+10000).tick()
  const turn=(id:string)=>ok('chatTurn',null,id)
  const input=(id:string)=>JSON.parse(String(db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(id)!.request_json))
  return {db,config,own,agent,direct,collection,file,call,ok,send,tick,turn,input,bind,collectionNow,upload}
}

describe('bound research context: real HTTP/SQLite worker; injected synthetic model only',{timeout:30000},()=>{
  it('supplies actual bounded source bytes with citation labels and a precise original excerpt receipt',async()=>{
    const s=await setup(),sent=await s.send()
    await s.tick(async input=>{
      const p=JSON.parse(input.prompt);expect(p.researchLibrary.excerpts[0]).toMatchObject({label:'R1',filename:'method.txt',citation:{sourceId:s.file.id,version:1,pageNumber:1,sha256:s.file.sha256}})
      expect(input.system).toContain('untrusted source data');expect(p.researchLibrary.excerpts[0].text).toContain('8 samples')
      expect(chatInputTokenBound(input.system,input.prompt)+input.maxTokens).toBeLessThanOrEqual(sent.turn.budget.maxTokens)
      return result('LX-713 使用 8 个样本。[R1]')
    })
    const turn=await s.turn(sent.turn.id);expect(turn.status).toBe('succeeded');expect(turn.libraryRead).toMatchObject({status:'excerpts',retrieval:'keyword',sources:[{label:'R1',citation:{sourceId:s.file.id}}]})
    const citation=turn.libraryRead.sources[0].citation
    const original=await s.ok('researchFileExcerpt',null,citation.sourceId,{version:citation.version,pageNumber:citation.pageNumber,start:citation.start,end:citation.end})
    expect(original.text).toContain('8 samples');expect(original.citation.sha256).toBe(s.file.sha256)
    expect(JSON.parse(String(s.db.prepare('SELECT document FROM chat_turns WHERE id=?').get(turn.id)!.document))).not.toHaveProperty('libraryRead')
  })
  it('fences revoked context before provider dispatch and clears the old source receipt',async()=>{
    const s=await setup(),sent=await s.send()
    await s.ok('withdrawResearchCollection',{expectedVersion:(await s.collectionNow()).version},s.collection.id)
    expect(await s.tick(async()=>{throw Error('revoked source must not dispatch')})).toBe(false)
    const turn=await s.turn(sent.turn.id);expect(turn.status).toBe('cancelled');expect(turn.outputMessageId).toBeNull();expect(turn.libraryRead).toBeUndefined()
  })
  it('withdrawal during streaming blocks deltas and late output while retaining real returned usage',async()=>{
    const s=await setup(),sent=await s.send('What is LX-713?',true)
    let release!:(value:ModelResult)=>void,delta!:NonNullable<Parameters<ModelCall>[3]>,enter!:()=>void
    const ready=new Promise<void>(resolve=>{enter=resolve})
    const pending=s.tick(async(_input,_signal,_credential,onDelta)=>{delta=onDelta!;delta('资料显示');enter();return new Promise(resolve=>{release=resolve})})
    await ready
    expect((await s.ok('chatTurnProgress',null,sent.turn.id)).text).toBe('资料显示')
    await s.ok('withdrawResearchCollection',{expectedVersion:(await s.collectionNow()).version},s.collection.id)
    delta(' SOURCE_SECRET_713');release(result('SOURCE_SECRET_713 [R1]'));await pending
    const turn=await s.turn(sent.turn.id);expect(turn.status).toBe('cancelled');expect(turn.outputMessageId).toBeNull();expect(turn.usage).toMatchObject({inputTokens:81,outputTokens:23})
    expect((await s.ok('chatTurnProgress',null,turn.id)).text).toBe('')
    expect(s.db.prepare("SELECT count(*) n FROM chat_messages WHERE json_extract(document,'$.origin')='model'").get()!.n).toBe(0)
  })
  it('does not reuse withdrawn material through old answer history after unbinding',async()=>{
    const s=await setup(),first=await s.send();await s.tick(async()=>result('SOURCE_SECRET_713 [R1]'))
    await s.bind([]);await s.ok('withdrawResearchCollection',{expectedVersion:(await s.collectionNow()).version},s.collection.id)
    const next=await s.send('现在聊一个新问题。')
    await s.tick(async input=>{expect(input.prompt).not.toContain('SOURCE_SECRET_713');expect(JSON.parse(input.prompt)).not.toHaveProperty('researchLibrary');return result('可以，继续说。')})
    expect((await s.turn(next.turn.id)).status).toBe('succeeded');expect((await s.turn(first.turn.id)).libraryRead).toBeUndefined()
  })
  it('selects only whole excerpts within the saved budget, and rejects invented citation labels',async()=>{
    const s=await setup();for(let i=0;i<8;i++)await s.upload('LX-713 '+('合成实验科研证据。'.repeat(800)))
    const sent=await s.send()
    await s.tick(async input=>{
      const p=JSON.parse(input.prompt);expect(p.researchLibrary.excerpts.length).toBeGreaterThan(0);expect(p.researchLibrary.excerpts.length).toBeLessThan(9)
      expect(chatInputTokenBound(input.system,input.prompt)+input.maxTokens).toBeLessThanOrEqual(sent.turn.budget.maxTokens)
      for(const source of p.researchLibrary.excerpts)expect(source.text.length).toBe(source.citation.end-source.citation.start)
      return result('This fabricated source label must not become a canonical reply. [R99]')
    })
    expect((await s.turn(sent.turn.id)).status).toBe('failed');expect((await s.turn(sent.turn.id)).failure).toBe('INVALID_MODEL_OUTPUT');expect((await s.turn(sent.turn.id)).outputMessageId).toBeNull()
  })
  it('keeps no-match honest, allows explicitly requested partial overview and fences file replacements',async()=>{
    const s=await setup(),none=await s.send('What is ZZ-NOMATCH-999?')
    await s.tick(async input=>{expect(JSON.parse(input.prompt).researchLibrary.excerpts).toHaveLength(0);return result('资料中暂未找到对应内容。')})
    expect((await s.turn(none.turn.id)).libraryRead.status).toBe('no_match')
    const overview=await s.send('请概括这些资料。')
    await s.tick(async input=>{expect(JSON.parse(input.prompt).researchLibrary.retrieval).toBe('overview');return result('所提供的开头片段介绍了样本量。[R1]')})
    expect((await s.turn(overview.turn.id)).libraryRead.retrieval).toBe('overview')
    const outdated=await s.send();await s.upload('LX-713 now uses 12 synthetic samples.',{fileId:s.file.id,expectedVersion:1})
    expect(await s.tick(async()=>{throw Error('replacement must fence old queued context')})).toBe(false)
    expect((await s.turn(outdated.turn.id)).status).toBe('cancelled')
  })
})
