import {randomBytes,randomUUID} from 'node:crypto'
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,describe,it,expect} from 'vitest'
import {routes,type RouteName} from '@research-agent-platform/contracts'
import {readConfig} from '../src/config.js'
import {migrate,openDatabase,seed} from '../src/database.js'
import {provisionTestAccounts} from '../src/auth.js'
import {createServer} from '../src/server.js'
import {ExecutionWorker,type ModelCall,type ModelResult} from '../src/execution-worker.js'

const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
const budget={maxTokens:100000,maxSeconds:30},schedule={suggested:null,hardDeadline:null,committed:null,estimatedHumanHours:null,checkpoint:null}
const output=(labId='lab_synthetic'):ModelResult=>({text:JSON.stringify({intent:'draft',plan:{labId,goal:'Synthetic owned draft',proposedItems:[],unresolvedQuestions:[]}}),failure:null,inputTokens:100,outputTokens:100,elapsedMs:10})
async function setup(){
  const dir=mkdtempSync(join(tmpdir(),'planning-personal-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
  const master=join(dir,'synthetic-master.key');writeFileSync(master,randomBytes(32).toString('hex'),{mode:0o600})
  const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'db.sqlite'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'http://127.0.0.1:4498',B3_AI_ENABLED:'1',LAB_CREDENTIAL_KEY_FILE:master})
  mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);cleanup.push(()=>db.close());migrate(db);seed(db,'test')
  const accounts=['A','B'].map(letter=>({memberId:`member_${letter}`,username:`synthetic_planning_${letter}`,password:randomBytes(24).toString('hex')}));await provisionTestAccounts(db,'test',accounts)
  db.prepare('INSERT INTO lab_managers(lab_id,member_id,granted_at) VALUES (?,?,?)').run('lab_synthetic','member_A',new Date().toISOString())
  let app=createServer(config),url=await app.listen({host:'127.0.0.1',port:0});cleanup.push(()=>app.close())
  const people:{cookie:string;csrf:string}[]=[]
  const call=async(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,key=randomUUID())=>{
    const route=routes[name],response=await fetch(url+route.path.replace(/\{(\w+)\}/g,(_,name:string)=>params[name]!),{method:route.method,headers:{origin:config.origin,'content-type':'application/json','Idempotency-Key':key,...(people[actor]?{cookie:people[actor].cookie,'x-csrf-token':people[actor].csrf}:{})},...(route.method==='GET'?{}:{body:JSON.stringify(body)})})
    const text=await response.text(),value=JSON.parse(text);if(response.ok)route.response.parse(value)
    return {status:response.status,value,text,cookie:response.headers.get('set-cookie')?.split(';')[0]??''}
  }
  const ok=async(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,key=randomUUID())=>{const r=await call(name,body,params,actor,key);expect(r.status,r.text).toBeLessThan(300);return r.value.data}
  for(let actor=0;actor<accounts.length;actor++){const a=accounts[actor]!,login=await call('login',{username:a.username,password:a.password},{},actor);expect(login.status).toBe(200);people[actor]={cookie:login.cookie,csrf:''};people[actor]!.csrf=(await ok('session',null,{},actor)).csrfToken}
  const personal=(actor=0,provider='qwen',model='qwen-test')=>ok('createPersonalModel',{name:'Synthetic owned model',provider,model,enabled:true,apiKey:`synthetic-owned-key-${actor}`},{},actor)
  const lab=()=>ok('updateLabAiSettings',{expectedVersion:0,enabled:true,model:'deepseek-flash',apiKey:'sk-synthetic-legacy-manager-key'},{id:'lab_synthetic'})
  const planBody={labId:'lab_synthetic',prompt:'Organize the synthetic task',intent:'draft',inputArtifactIds:[],budget}
  const planning=(actor=0,key=randomUUID())=>ok('planRequest',planBody,{},actor,key)
  const detail=(id:string,actor=0)=>ok('getPlanRequest',null,{id},actor)
  const worker=(fn:ModelCall)=>new ExecutionWorker(db,config,fn)
  return {db,config,call,ok,personal,lab,planBody,planning,detail,worker,restart:async()=>{await app.close();app=createServer(config);url=await app.listen({host:'127.0.0.1',port:0})}}
}
describe('owned personal planning with real HTTP and isolated synthetic credentials',{timeout:30000},()=>{
  it('uses each requester default provider and key with lab AI disabled, persists binding through restart and keeps receipts secret-free',async()=>{
    const s=await setup();await s.personal();await s.personal(1,'doubao','doubao-test')
    const key=randomUUID(),a=await s.planning(0,key),b=await s.planning(1)
    expect((await s.planning(0,key)).id).toBe(a.id)
    const binding=JSON.parse(String(s.db.prepare('SELECT request_json FROM execution_jobs WHERE id=?').get(a.id)!.request_json)).modelBinding
    expect(binding).toMatchObject({source:'personal',provider:'qwen',model:'qwen-test'})
    await s.restart();const called:string[]=[]
    const w=s.worker(async(input,_signal,credential)=>{called.push(input.provider!);expect(credential.apiKey).toBe(input.provider==='qwen'?'synthetic-owned-key-0':'synthetic-owned-key-1');expect(input.model).toBe(input.provider==='qwen'?'qwen-test':'doubao-test');return output()})
    await w.tick();await w.tick();expect(called.sort()).toEqual(['doubao','qwen'])
    expect(await s.detail(a.id)).toMatchObject({status:'draft',usage:{inputTokens:100,outputTokens:100}});expect(await s.detail(b.id,1)).toMatchObject({status:'draft'})
    expect((await s.call('getPlanRequest',null,{id:a.id},1)).status).toBe(404)
    const stored=s.db.prepare('SELECT request_json,document FROM execution_jobs').all().concat(s.db.prepare('SELECT request_json,result_json FROM execution_attempts').all())
    expect(JSON.stringify(stored)).not.toContain('synthetic-owned-key-');expect((await s.call('getPlanRequest',null,{id:a.id})).text).not.toContain('modelBinding')
  })
  it('allows explicit manager legacy compatibility but requires ordinary members own model and never falls back after clearing it',async()=>{
    const s=await setup();await s.lab()
    expect((await s.call('planRequest',s.planBody,{},1)).value.error.code).toBe('MODEL_UNAVAILABLE')
    const old=await s.planning();expect(JSON.parse(String(s.db.prepare('SELECT request_json FROM execution_jobs WHERE id=?').get(old.id)!.request_json)).modelBinding.source).toBe('legacy_lab')
    await s.worker(async(input,_signal,credential)=>{expect(input.provider).toBe('deepseek');expect(credential.apiKey).toBe('sk-synthetic-legacy-manager-key');return output()}).tick()
    expect((await s.detail(old.id)).status).toBe('draft')
    await s.personal(1);const settings=await s.ok('personalModels',null,{},1)
    await s.ok('defaultPersonalModel',{expectedVersion:settings.version,configurationId:null},{},1)
    expect((await s.call('planRequest',s.planBody,{},1)).value.error.code).toBe('MODEL_UNAVAILABLE')
    // Facts never require a model and do not call a supplier.
    expect(await s.ok('planRequest',{...s.planBody,intent:'progress'},{},1)).toMatchObject({status:'ready',reply:{origin:'service_facts'}})
  })
  it('fences queued default changes and disabled configurations before any supplier call',async()=>{
    const s=await setup();const model=await s.personal(),queued=await s.planning()
    const changed=await s.ok('updatePersonalModel',{name:model.name,provider:model.provider,model:'qwen-next',enabled:true,expectedVersion:model.version},{id:model.id})
    let calls=0;expect(await s.worker(async()=>{calls++;return output()}).tick()).toBe(false);expect(calls).toBe(0)
    expect(await s.detail(queued.id)).toMatchObject({status:'cancelled',failure:'MODEL_CONFIGURATION_CHANGED'})
    const next=await s.planning()
    await s.ok('updatePersonalModel',{name:changed.name,provider:changed.provider,model:changed.model,enabled:false,expectedVersion:changed.version},{id:changed.id})
    expect(await s.worker(async()=>{calls++;return output()}).tick()).toBe(false);expect(calls).toBe(0)
    expect(await s.detail(next.id)).toMatchObject({status:'cancelled',failure:'MODEL_UNAVAILABLE'})
  })
  it('aborts running planning when its model changes, retains accounting and discards late content',async()=>{
    const s=await setup(),model=await s.personal(),job=await s.planning()
    let observedAbort=false
    await s.worker(async(_input,signal)=>{
      await s.ok('updatePersonalModel',{name:model.name,provider:model.provider,model:'qwen-next',enabled:true,expectedVersion:model.version},{id:model.id})
      await new Promise<void>(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',()=>resolve(),{once:true})});observedAbort=signal.aborted
      return output()
    }).tick()
    expect(observedAbort).toBe(true);expect(await s.detail(job.id)).toMatchObject({status:'cancelled',failure:'MODEL_CONFIGURATION_CHANGED',planId:null,usage:{inputTokens:100,outputTokens:100}})
    expect(s.db.prepare('SELECT count(*) n FROM plans').get()!.n).toBe(0)
    expect(s.db.prepare('SELECT count(*) n FROM execution_attempts WHERE job_id=?').get(job.id)!.n).toBe(1)
  })
  it('retains the lab path for historical unbound queued jobs while current public task execution stays on lab credentials',async()=>{
    const s=await setup();await s.lab();const historical=await s.planning()
    const row=s.db.prepare('SELECT request_json FROM execution_jobs WHERE id=?').get(historical.id)!,request=JSON.parse(String(row.request_json));delete request.modelBinding;s.db.prepare('UPDATE execution_jobs SET request_json=? WHERE id=?').run(JSON.stringify(request),historical.id)
    await s.personal()
    await s.worker(async(input,_signal,credential)=>{expect(input.model).toBe('deepseek-flash');expect(credential.apiKey).toBe('sk-synthetic-legacy-manager-key');return output()}).tick()
    expect((await s.detail(historical.id)).status).toBe('draft')
    s.db.prepare("INSERT INTO public_capabilities VALUES (?,?,1,1,'member_A')").run('lab_synthetic','text-evidence-checklist')
    const draft=await s.ok('createPlan',{labId:'lab_synthetic',goal:'Synthetic execution goal',proposedItems:[{id:'one',title:'Synthetic checklist',goal:'Check Metric A',deliverable:'Checked checklist',acceptanceCriteria:'Quote supplied metric',allocation:{kind:'self'},dependencies:[],schedule,inputArtifactIds:[],budget:null}],unresolvedQuestions:[]})
    const confirmed=await s.ok('confirmPlan',{expectedVersion:1},{id:draft.id}),id=confirmed.taskIds[0]
    const artifact=await s.ok('upload',{taskId:id,expectedVersion:1,filename:'synthetic.txt',mediaType:'text/plain',contentBase64:Buffer.from('Metric A: 12 samples.').toString('base64')})
    const task=(await s.ok('task',null,{id})).task,run=await s.ok('run',{expectedVersion:task.version,capability:{id:'text-evidence-checklist',version:1,visibility:'lab_public'},budget,inputArtifactIds:[artifact.id]},{id})
    await s.worker(async(input,_signal,credential)=>{expect(input.provider).toBeUndefined();expect(input.model).toBe('deepseek-flash');expect(credential.apiKey).toBe('sk-synthetic-legacy-manager-key');return {text:JSON.stringify({title:'Synthetic checklist',items:[{requirement:'Metric A count',assessment:'supported_by_input',citations:[{artifactId:artifact.id,quote:'Metric A: 12 samples.'}],gap:null}],limitations:['Only supplied text checked.']}),failure:null,inputTokens:100,outputTokens:100,elapsedMs:10}}).tick()
    expect(await s.ok('getRun',null,{id:run.id})).toMatchObject({status:'succeeded'})
  })
  it('enforces the existing remaining budget before personal model dispatch',async()=>{
    const s=await setup();await s.personal();const job=await s.ok('planRequest',{...s.planBody,budget:{maxTokens:1,maxSeconds:30}})
    let calls=0;expect(await s.worker(async()=>{calls++;return output()}).tick()).toBe(false);expect(calls).toBe(0)
    expect(await s.detail(job.id)).toMatchObject({status:'failed',failure:'BUDGET_EXCEEDED'})
  })
})
