import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { routes, type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { openDatabase, migrate, seed, transaction } from '../src/database.js'
import { provisionTestAccounts } from '../src/auth.js'
import { ChatService } from '../src/chat.js'
import { serviceFor, type ModelCall, type ModelResult } from '../src/execution-worker.js'
import { runPersonalModel } from '../src/personal-models.js'
import { MemoryCompressionWorker } from '../src/memory-compression-worker.js'
import { backup, restore } from '../src/recovery.js'

const cleanup: (() => void)[] = []
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn() })
const result = (groups: {topic:string;ids:string[]}[]): ModelResult => ({ text: JSON.stringify({groups}), failure: null, inputTokens: 1, outputTokens: 1, elapsedMs: 1 })
async function fixture(enabled = true) {
  const root = mkdtempSync(join(tmpdir(), 'acceptcat-compression-fence-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const master = join(root, 'synthetic.key'); writeFileSync(master, randomBytes(32).toString('hex'), { mode: 0o600 })
  const config = readConfig({NODE_ENV:'test', DATABASE_PATH:join(root,'db.sqlite'), BLOB_ROOT:join(root,'blobs'), APP_ORIGIN:'http://127.0.0.1:4173', B3_AI_ENABLED:'1', LAB_CREDENTIAL_KEY_FILE:master})
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true); cleanup.push(() => db.close()); migrate(db); seed(db, 'test')
  await provisionTestAccounts(db,'test',[{memberId:'member_A',username:'synthetic-a',password:'SyntheticPassword123!'}, {memberId:'member_B',username:'synthetic-b',password:'SyntheticPassword123!'}])
  const service = new ChatService(serviceFor(db,'member_A',config).c, config)
  const call = (name: RouteName, body: unknown = null, id?: string, key=randomUUID()) => transaction(db, () => service.run(name as never, routes[name].request.parse({body,params:id?{id}:{},query:{},headers:routes[name].method==='GET'?{}:{'Idempotency-Key':key}}) as never)) as {data:any}
  if (enabled) transaction(db, () => runPersonalModel(db,service.c.actor,'createPersonalModel',{body:{name:'Synthetic model',provider:'deepseek',model:'synthetic-model',enabled:true,apiKey:'SYNTHETIC_API_KEY'},params:{},query:{},headers:{'Idempotency-Key':randomUUID()}} as never,config))
  const agent=call('createPersonalAgent',{displayName:'合成助手',introduction:'读取合成资料',capabilityDescription:'整理合成笔记',personality:'简洁'}).data
  const note=(topic:string,text:string,detail:string|null=text)=>call('createAssistantMemory',{scope:'agent',subjectId:agent.id,topic,type:'note',summary:text.slice(0,200),detail,payload:{type:'note',text:text.slice(0,2000)},source:{kind:'manual',id:null,version:null,label:null}}).data
  const queue=(key=randomUUID())=>call('compressAssistantMemories',{subjectId:agent.id},undefined,key).data
  const notes=()=>db.prepare('SELECT id,topic,summary,detail,payload_json,status,version,conflict FROM assistant_memories WHERE subject_id=? ORDER BY id').all(agent.id)
  return {db,config,service,call,agent,note,queue,notes}
}
function suspendedModel() {
  let resume!: (value:ModelResult)=>void, started!:()=>void
  const ready=new Promise<void>(resolve=>{started=resolve})
  const call:ModelCall=async()=>{started();return new Promise<ModelResult>(resolve=>{resume=resolve})}
  return {call,ready,resume:(groups:{topic:string;ids:string[]}[])=>resume(result(groups))}
}

it('recovers an expired running job and fences the old worker topic updates and completion',async()=>{
  const f=await fixture(), a=f.note('旧主题一','保留 RGB'), b=f.note('旧主题二','保留 RGB'), job=f.queue()
  let clock=Date.now();const model=suspendedModel()
  const old=new MemoryCompressionWorker(f.db,f.config,()=>clock,model.call)
  const flight=old.tick();await model.ready;clock+=60_001
  await new MemoryCompressionWorker(f.db,f.config,()=>clock,async()=>result([{topic:'新主题',ids:[a.id,b.id]}])).tick()
  const accepted=JSON.stringify(f.notes()), receipt=f.db.prepare('SELECT * FROM assistant_memory_compression_jobs WHERE id=?').get(job.id)!
  expect(receipt.status).toBe('succeeded');expect(receipt.attempts).toBe(2)
  model.resume([{topic:'迟到旧主题',ids:[a.id,b.id]}]);await flight
  expect(JSON.stringify(f.notes())).toBe(accepted)
  expect(f.db.prepare('SELECT * FROM assistant_memory_compression_jobs WHERE id=?').get(job.id)).toEqual(receipt)
})
it('a concurrent owner edit invalidates the grouping and requeues the same job without consuming the edit',async()=>{
  const f=await fixture(), a=f.note('一','原内容'), b=f.note('二','原内容'), job=f.queue(), model=suspendedModel()
  const flight=new MemoryCompressionWorker(f.db,f.config,Date.now,model.call).tick();await model.ready
  f.call('updateAssistantMemory',{expectedVersion:a.version,topic:'用户改过的主题',type:'note',summary:'新内容',detail:'新内容',payload:{type:'note',text:'新内容'},source:{kind:'manual',id:null,version:null,label:null}},a.id)
  model.resume([{topic:'旧分组',ids:[a.id,b.id]}]);await flight
  expect(f.db.prepare('SELECT status FROM assistant_memory_compression_jobs WHERE id=?').get(job.id)?.status).toBe('queued')
  expect(f.notes().find(row=>row.id===a.id)).toMatchObject({topic:'用户改过的主题',detail:'新内容',version:2,status:'confirmed'})
  await new MemoryCompressionWorker(f.db,f.config,Date.now,async()=>result([])).tick()
  expect(f.db.prepare('SELECT status FROM assistant_memory_compression_jobs WHERE id=?').get(job.id)?.status).toBe('succeeded')
  expect(f.notes().find(row=>row.id===a.id)?.detail).toBe('新内容')
})
it('model grouping increments topic versions and history, and rejects repeated or unknown ids',async()=>{
  const f=await fixture(), a=f.note('一','RGB 原文',null), b=f.note('二','RGB 原文',null)
  f.queue();await new MemoryCompressionWorker(f.db,f.config,Date.now,async()=>result([{topic:'重复无效',ids:[a.id,a.id]},{topic:'越界无效',ids:[b.id,'not_supplied']}])).tick()
  expect(f.notes().every(row=>row.version===1)).toBe(true)
  f.queue();await new MemoryCompressionWorker(f.db,f.config,Date.now,async()=>result([{topic:'有效主题',ids:[a.id,b.id]}])).tick()
  for(const id of [a.id,b.id]){
    const history=f.call('assistantMemoryHistory',null,id).data.revisions
    expect(history.some((row:any)=>row.topic==='有效主题'&&row.version===2)).toBe(true)
    expect(history[history.length-1].version).toBe(3)
  }
  expect(f.notes().find(row=>row.status==='confirmed')?.payload_json).toContain('RGB 原文')
})
it('an unresponsive model has a real deadline and falls back without keeping the worker flight alive',async()=>{
  const f=await fixture();f.note('同主题','保留 RGB');f.note('同主题','保留 RGB');const job=f.queue()
  let signal:AbortSignal|undefined
  const worker=new MemoryCompressionWorker(f.db,f.config,Date.now,async(_input,current)=>{signal=current;return new Promise<ModelResult>(()=>{})},15)
  expect(await worker.tick()).toBe(true)
  expect(signal?.aborted).toBe(true)
  const receipt=f.call('assistantMemoryCompressionJob',null,job.id).data
  expect(receipt.status).toBe('succeeded');expect(receipt.result.merged).toBe(1)
})
it('manual retries read the same job receipt and automatic threshold compression uses the same queue',async()=>{
  const f=await fixture(false)
  for(let i=0;i<21;i++)f.note('主题'+i,'内容'+i)
  const existing=f.db.prepare("SELECT id FROM assistant_memory_compression_jobs WHERE status='queued'").get()!
  const key=randomUUID(), job=f.queue(key)
  expect(job.id).toBe(existing.id);expect(f.queue(key).id).toBe(existing.id)
  await new MemoryCompressionWorker(f.db,f.config).tick()
  expect(f.queue(key).status).toBe('succeeded')
  expect(f.notes().filter(row=>row.status==='confirmed')).toHaveLength(20)
})
it('only compatible notes merge, preserving null-detail payloads, case, long details and other typed records',async()=>{
  const f=await fixture(false)
  f.note('大小写','RGB',null);f.note('大小写','rgb',null)
  f.note('长原文','x'.repeat(2000),'x'.repeat(3000));f.note('长原文','x'.repeat(2000),'x'.repeat(3000))
  const decision=f.call('createAssistantMemory',{scope:'agent',subjectId:f.agent.id,topic:'大小写',type:'decision',summary:'保留决策',detail:null,payload:{type:'decision',decision:'Keep RGB',rationale:null,alternatives:[]},source:{kind:'manual',id:null,version:null,label:null}}).data
  f.queue();await new MemoryCompressionWorker(f.db,f.config).tick()
  const rows=f.notes();expect(rows.every(row=>row.status==='confirmed')).toBe(true)
  expect(rows.filter(row=>row.topic==='长原文').every(row=>String(row.detail).length===3000)).toBe(true)
  expect(rows.find(row=>row.id===decision.id)).toMatchObject({version:1,payload_json:JSON.stringify({type:'decision',decision:'Keep RGB',rationale:null,alternatives:[]})})
  expect(rows.filter(row=>row.topic==='大小写'&&row.id!==decision.id).every(row=>row.conflict===1)).toBe(true)
})
it('topic changes, deterministic merging and the success receipt roll back together on a final write failure',async()=>{
  const f=await fixture(), a=f.note('一','原文'), b=f.note('二','原文'), job=f.queue(), before=JSON.stringify(f.notes())
  f.db.exec("CREATE TRIGGER synthetic_compression_failure BEFORE UPDATE ON assistant_memory_compression_jobs WHEN NEW.status='succeeded' BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END")
  await new MemoryCompressionWorker(f.db,f.config,Date.now,async()=>result([{topic:'不应保留',ids:[a.id,b.id]}])).tick()
  expect(JSON.stringify(f.notes())).toBe(before)
  expect(f.call('assistantMemoryCompressionJob',null,job.id).data.status).toBe('failed')
})
it('new and existing settings routes share one versioned setting and history returns the latest 100 revisions',async()=>{
  const f=await fixture(false), original=f.call('personalMemorySettings').data
  expect(f.call('assistantMemorySettings').data).toEqual(original)
  const changed=f.call('updateAssistantMemorySettings',{expectedVersion:original.version,candidateLearning:true,timeZone:'UTC',quietHours:null}).data
  expect(f.call('personalMemorySettings').data).toEqual(changed)
  const a=f.note('历史','原文')
  for(let version=1;version<=105;version++)f.call('updateAssistantMemory',{expectedVersion:version,topic:'历史',type:'note',summary:'内容'+version,detail:'内容'+version,payload:{type:'note',text:'内容'+version},source:{kind:'manual',id:null,version:null,label:null}},a.id)
  const history=f.call('assistantMemoryHistory',null,a.id).data
  expect(history.memory.version).toBe(106);expect(history.revisions).toHaveLength(100)
  expect(history.revisions[0].version).toBe(7);expect(history.revisions.at(-1).version).toBe(106)
})

it('renews the current attempt while a model is pending, preventing another worker from recovering its live lease',async()=>{
  const f=await fixture(), a=f.note('一','原文'), b=f.note('二','原文'), job=f.queue(), model=suspendedModel()
  let clock=Date.now();vi.useFakeTimers()
  const worker=new MemoryCompressionWorker(f.db,f.config,()=>clock,model.call), flight=worker.tick()
  try{
    await model.ready
    const original=Number(f.db.prepare('SELECT lease_until FROM assistant_memory_compression_jobs WHERE id=?').get(job.id)?.lease_until)
    clock+=50_000;await vi.advanceTimersByTimeAsync(10_001)
    const renewed=Number(f.db.prepare('SELECT lease_until FROM assistant_memory_compression_jobs WHERE id=?').get(job.id)?.lease_until)
    expect(renewed).toBeGreaterThan(original)
    clock+=20_000
    expect(await new MemoryCompressionWorker(f.db,f.config,()=>clock,async()=>result([])).tick()).toBe(false)
    model.resume([{topic:'有效分组',ids:[a.id,b.id]}]);await flight
    expect(f.call('assistantMemoryCompressionJob',null,job.id).data.status).toBe('succeeded')
  }finally{model.resume([]);await flight;vi.useRealTimers()}
})
it('a model configuration change requeues the old proposal and revocation of the owner fails without modifying notes',async()=>{
  const f=await fixture(), a=f.note('一','原文'), b=f.note('二','原文'), job=f.queue(), model=suspendedModel(), before=JSON.stringify(f.notes())
  const flight=new MemoryCompressionWorker(f.db,f.config,Date.now,model.call).tick();await model.ready
  f.db.prepare('UPDATE personal_model_settings SET version=version+1 WHERE member_id=?').run('member_A')
  model.resume([{topic:'过期配置分组',ids:[a.id,b.id]}]);await flight
  expect(f.call('assistantMemoryCompressionJob',null,job.id).data.status).toBe('queued')
  expect(JSON.stringify(f.notes())).toBe(before)
  f.db.prepare('UPDATE auth_accounts SET disabled=1 WHERE member_id=?').run('member_A')
  await new MemoryCompressionWorker(f.db,f.config,Date.now,async()=>result([])).tick()
  expect(f.db.prepare('SELECT status FROM assistant_memory_compression_jobs WHERE id=?').get(job.id)?.status).toBe('failed')
  expect(JSON.stringify(f.notes())).toBe(before)
})
it('a restored backup fences queued and running compression so it cannot resume model work',async()=>{
  const f=await fixture(false), queued=f.queue(), base=dirname(f.config.databasePath)
  f.db.prepare("UPDATE assistant_memory_compression_jobs SET status='running',attempts=2,lease_until=? WHERE id=?").run(Date.now()+60_000,queued.id)
  backup(f.config,join(base,'backup'),'synthetic','a'.repeat(40),'synthetic-config')
  restore(join(base,'backup'),join(base,'restored'),'synthetic')
  const copied=openDatabase(join(base,'restored','platform.sqlite'));cleanup.push(()=>copied.close())
  expect(copied.prepare('SELECT status,attempts,lease_until,failure FROM assistant_memory_compression_jobs WHERE id=?').get(queued.id)).toMatchObject({status:'failed',attempts:3,lease_until:null,failure:'RESTORED_REQUIRES_REVIEW'})
  let calls=0
  expect(await new MemoryCompressionWorker(copied,f.config,Date.now,async()=>{calls++;return result([])}).tick()).toBe(false)
  expect(calls).toBe(0)
})

it('automatic writes arriving during an active manual pass remain queued until their new snapshot is processed',async()=>{
  const f=await fixture();f.note('一','原文');f.note('二','原文');const job=f.queue(), model=suspendedModel()
  const flight=new MemoryCompressionWorker(f.db,f.config,Date.now,model.call).tick();await model.ready
  for(let i=0;i<21;i++)f.note('新增'+i,'新增内容'+i)
  expect(f.db.prepare("SELECT count(*) n FROM assistant_memory_compression_jobs WHERE status IN ('queued','running')").get()?.n).toBe(1)
  model.resume([]);await flight
  expect(f.call('assistantMemoryCompressionJob',null,job.id).data.status).toBe('queued')
  await new MemoryCompressionWorker(f.db,f.config,Date.now,async()=>result([])).tick()
  expect(f.call('assistantMemoryCompressionJob',null,job.id).data.status).toBe('succeeded')
  expect(f.notes().filter(row=>row.status==='confirmed')).toHaveLength(20)
})
it('manual and worker compression both enforce current agent ownership and expired exhausted jobs stop retrying',async()=>{
  const f=await fixture(false);f.note('一','原文');f.note('二','原文')
  const before=JSON.stringify(f.notes()), other=new ChatService(serviceFor(f.db,'member_B',f.config).c,f.config)
  expect(()=>transaction(f.db,()=>other.run('compressAssistantMemories',routes.compressAssistantMemories.request.parse({body:{subjectId:f.agent.id},params:{},query:{},headers:{'Idempotency-Key':randomUUID()}})))).toThrow()
  const at=new Date().toISOString(), rogue=randomUUID()
  f.db.prepare("INSERT INTO assistant_memory_compression_jobs(id,owner_id,subject_id,status,created_at,updated_at) VALUES(?,?,?,'queued',?,?)").run(rogue,'member_B',f.agent.id,at,at)
  await new MemoryCompressionWorker(f.db,f.config).tick()
  expect(f.db.prepare('SELECT status FROM assistant_memory_compression_jobs WHERE id=?').get(rogue)?.status).toBe('failed')
  expect(JSON.stringify(f.notes())).toBe(before)
  const job=f.queue();f.db.prepare("UPDATE assistant_memory_compression_jobs SET status='running',attempts=3,lease_until=0 WHERE id=?").run(job.id)
  expect(await new MemoryCompressionWorker(f.db,f.config).tick()).toBe(false)
  expect(f.db.prepare('SELECT status,failure FROM assistant_memory_compression_jobs WHERE id=?').get(job.id)).toMatchObject({status:'failed',failure:'LEASE_EXPIRED'})
  expect(JSON.stringify(f.notes())).toBe(before)
})

it('scientific Unicode and instruction ordering remain distinct during deterministic compression',async()=>{
  const f=await fixture(false)
  f.note('公式','x²');f.note('公式','x2')
  f.note('步骤','open\nclose');f.note('步骤','close\nopen')
  f.queue();await new MemoryCompressionWorker(f.db,f.config).tick()
  expect(f.notes()).toHaveLength(4)
  expect(f.notes().every(row=>row.status==='confirmed'&&row.conflict===1)).toBe(true)
})
