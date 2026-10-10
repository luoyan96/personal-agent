import {randomBytes,randomUUID} from 'node:crypto'
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,describe,it,expect} from 'vitest'
import {routes,type RouteName,type PlanModel,type ScheduleModel} from '@research-agent-platform/contracts'
import {readConfig} from '../src/config.js'
import {migrate,openDatabase,seed} from '../src/database.js'
import {provisionTestAccounts} from '../src/auth.js'
import {createServer} from '../src/server.js'
import {scheduleOverdue} from '../src/research-team.js'

const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
const schedule:ScheduleModel={suggested:null,hardDeadline:null,committed:null,estimatedHumanHours:null,checkpoint:null}
function item(id:string,kind:'self'|'invitation'|'claim'='self'):PlanModel['proposedItems'][number]{return {id,title:'Identical synthetic step title',goal:'TASK_PRIVATE_GOAL',deliverable:'Synthetic checked result',acceptanceCriteria:'Explain evidence and gaps',allocation:kind==='invitation'?{kind,memberId:'member_B'}:kind==='claim'?{kind,audience:'lab_members',summary:'Safe public offer'}:{kind},dependencies:[],schedule,inputArtifactIds:[],budget:null}}
async function setup(){
  const dir=mkdtempSync(join(tmpdir(),'research-team-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
  const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'db.sqlite'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'http://127.0.0.1:4497'})
  mkdirSync(config.blobRoot)
  const db=openDatabase(config.databasePath,true);cleanup.push(()=>db.close());migrate(db);seed(db,'test')
  const accounts=['A','B','C'].map(letter=>({memberId:`member_${letter}`,username:`synthetic_team_${letter}`,password:randomBytes(24).toString('hex')}))
  await provisionTestAccounts(db,'test',accounts)
  let app=createServer(config),url=await app.listen({host:'127.0.0.1',port:0});cleanup.push(()=>app.close())
  const people:{cookie:string;csrf:string}[]=[]
  const call=async(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,query='',key=randomUUID())=>{
    const route=routes[name],response=await fetch(url+route.path.replace(/\{(\w+)\}/g,(_,name:string)=>params[name]!)+query,{method:route.method,headers:{origin:config.origin,'content-type':'application/json','Idempotency-Key':key,...(people[actor]?{cookie:people[actor].cookie,'x-csrf-token':people[actor].csrf}:{})},...(route.method==='GET'?{}:{body:JSON.stringify(body)})})
    const text=await response.text(),value=JSON.parse(text)
    if(response.ok)route.response.parse(value)
    return {status:response.status,value,text,cookie:response.headers.get('set-cookie')?.split(';')[0]??''}
  }
  const ok=async(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,query='',key=randomUUID())=>{const result=await call(name,body,params,actor,query,key);expect(result.status,result.text).toBeLessThan(300);return result.value.data}
  for(let actor=0;actor<accounts.length;actor++){
    const account=accounts[actor]!,login=await call('login',{username:account.username,password:account.password},{},actor);expect(login.status).toBe(200)
    people[actor]={cookie:login.cookie,csrf:''};people[actor]!.csrf=(await ok('session',null,{},actor)).csrfToken
  }
  const draft=(items=[item('one')])=>ok('createPlan',{labId:'lab_synthetic',goal:'OWNER_PRIVATE_PLAN_NOTES',proposedItems:items,unresolvedQuestions:[]})
  const confirmed=async(items=[item('one')])=>{const p=await draft(items);return ok('confirmPlan',{expectedVersion:p.version},{id:p.id})}
  const detail=async(id:string,actor=0)=>ok('task',null,{id},actor)
  const workspace=(actor=0,query='')=>call('researchWorkspace',null,{id:'lab_synthetic'},actor,query)
  return {db,call,ok,draft,confirmed,detail,workspace,restart:async()=>{await app.close();app=createServer(config);url=await app.listen({host:'127.0.0.1',port:0})}}
}

describe('research team real HTTP, synthetic accounts and isolated SQLite',{timeout:30000},()=>{
  it('maps repeated titles by persisted item ID across draft edits, idempotent confirmation and server restart',async()=>{
    const s=await setup(),p=await s.draft([item('one'),item('two')])
    expect((await s.ok('planTasks',null,{id:p.id})).steps).toEqual([{itemId:'one',taskId:null,task:null},{itemId:'two',taskId:null,task:null}])
    const edited=await s.ok('editPlan',{labId:p.labId,goal:p.goal,proposedItems:[item('two'),item('one')],unresolvedQuestions:[],expectedVersion:p.version},{id:p.id})
    const key=randomUUID(),confirmed=await s.ok('confirmPlan',{expectedVersion:edited.version},{id:p.id},0,'',key)
    const linked=await s.ok('planTasks',null,{id:p.id})
    expect(linked.steps.map((x:{itemId:string;taskId:string})=>[x.itemId,x.taskId])).toEqual([['two',confirmed.taskIds[0]],['one',confirmed.taskIds[1]]])
    expect((await s.call('planTasks',null,{id:p.id},1)).status).toBe(404)
    await s.restart()
    expect(await s.ok('planTasks',null,{id:p.id})).toEqual(linked)
    expect((await s.ok('confirmPlan',{expectedVersion:edited.version},{id:p.id},0,'',key)).taskIds).toEqual(confirmed.taskIds)
    expect(s.db.prepare('SELECT count(*) n FROM tasks WHERE plan_id=?').get(p.id)!.n).toBe(2)
    s.db.prepare("UPDATE task_access SET access='revoked' WHERE task_id=? AND member_id='member_A'").run(confirmed.taskIds[0])
    expect((await s.ok('planTasks',null,{id:p.id})).steps[0]).toEqual({itemId:'two',taskId:null,task:null})
  })
  it('aggregates all authorized rows with current commitments and preserves pending invitation and private plan boundaries',async()=>{
    const s=await setup(),p=await s.confirmed([item('self'),item('invite','invitation'),item('open','claim')])
    const owner=await s.workspace(0,'?limit=1');expect(owner.value.data).toHaveLength(1);expect(owner.value.summary).toMatchObject({total:3,active:1,awaitingAcceptance:2,accepted:0,pendingMyInvitation:0})
    const next=await s.workspace(0,'?limit=1&cursor='+encodeURIComponent(owner.value.nextCursor));expect(next.value.summary).toEqual(owner.value.summary);expect(next.value.data[0].task.id).not.toBe(owner.value.data[0].task.id)
    const invited=await s.workspace(1);expect(invited.value.summary).toMatchObject({total:2,pendingMyInvitation:1,accepted:0})
    expect(invited.text).not.toContain('TASK_PRIVATE_GOAL');expect(invited.text).not.toContain('OWNER_PRIVATE_PLAN_NOTES');expect(invited.text).not.toContain('planId')
    expect(invited.value.data.every((row:{acceptedAssignment:unknown;pendingInvitation:unknown;latestDeliverable:unknown})=>row.acceptedAssignment===null&&row.pendingInvitation===null&&row.latestDeliverable===null)).toBe(true)
    const offer=(await s.detail(p.taskIds[1],1)).pendingInvitation
    await s.ok('invitationDecision',{expectedVersion:offer.version,expectedTaskVersion:1,decision:'accepted',comment:null},{id:offer.id},1)
    const accepted=(await s.workspace(1)).value.data.find((row:{task:{id:string}})=>row.task.id===p.taskIds[1])
    expect(accepted.acceptedAssignment).toMatchObject({status:'accepted',memberId:'member_B'});expect(accepted.pendingInvitation).toBeNull();expect(accepted.planGoal).toBeNull();expect(accepted.task.goal).toBe('TASK_PRIVATE_GOAL')
    const oldCursor=(await s.workspace(1,'?limit=1')).value.nextCursor,t=(await s.detail(p.taskIds[1])).task
    await s.ok('revokeAccess',{expectedVersion:t.version,memberId:'member_B',reason:'Synthetic revoked grant'},{id:t.id})
    expect((await s.workspace(1)).value.summary.total).toBe(1)
    expect((await s.workspace(1,'?limit=1&cursor='+encodeURIComponent(oldCursor))).value.error.code).toBe('CURSOR_EXPIRED')
    s.db.prepare('INSERT INTO labs VALUES (?,?)').run('other_lab','Synthetic other lab')
    expect((await s.call('researchWorkspace',null,{id:'other_lab'})).status).toBe(404)
    expect((await s.workspace(2)).value.summary.total).toBe(1)
  })
  it('counts only the latest accepted delivery after revision feedback and never counts historical acceptance as current completion',async()=>{
    const s=await setup(),p=await s.confirmed(),id=p.taskIds[0]
    await s.ok('start',{expectedVersion:1},{id})
    const first=await s.ok('submit',{expectedVersion:2,summary:'Synthetic first result',artifactRefs:[],sources:[]},{id})
    expect((await s.workspace()).value.summary).toMatchObject({accepted:0,awaitingReview:1,pendingMyReview:1})
    expect((await s.workspace()).value.data[0].latestDeliverable.review).toBeNull()
    await s.ok('review',{expectedVersion:1,expectedTaskVersion:3,revision:1,decision:'changes_requested',comment:'Explain one gap'},{id:first.id})
    const second=await s.ok('submit',{expectedVersion:4,summary:'Synthetic revised result',artifactRefs:[],sources:[]},{id})
    await s.ok('review',{expectedVersion:1,expectedTaskVersion:5,revision:2,decision:'accepted',comment:'Evidence checked'},{id:second.id})
    const accepted=(await s.workspace()).value;expect(accepted.summary).toMatchObject({accepted:1,awaitingReview:0,pendingMyReview:0});expect(accepted.data[0].latestDeliverable).toMatchObject({revision:2,review:{decision:'accepted'}})
    await s.restart();expect((await s.workspace()).value.summary.accepted).toBe(1)
    const t=(await s.detail(id)).task
    await s.ok('proposeChange',{expectedVersion:t.version,scope:'Updated checked result',goal:t.goal,acceptanceCriteria:t.acceptanceCriteria,schedule:t.schedule,dependencies:t.dependencies,proposedLeadId:t.leadId,reason:'Synthetic new goal'},{id})
    expect((await s.workspace()).value.summary).toMatchObject({accepted:0,active:1})
    const latest=(await s.detail(id)).task
    await s.ok('submit',{expectedVersion:latest.version,summary:'New current revision awaiting actual review',artifactRefs:[],sources:[]},{id})
    expect((await s.workspace()).value.summary).toMatchObject({accepted:0,awaitingReview:1})
    expect((await s.workspace()).value.data[0].latestDeliverable.review).toBeNull()
  })
  it('keeps blocked actions and confirmed deadline counts consistent across scope and pagination',async()=>{
    const s=await setup(),due:ScheduleModel={...schedule,hardDeadline:{value:{kind:'date',date:'2000-01-01',timezone:'UTC'},source:'user',confirmed:true}}
    const p=await s.confirmed([{...item('blocked'),schedule:due},{...item('suggested'),schedule:{...schedule,suggested:{value:{kind:'date',date:'2000-01-01',timezone:'UTC'},source:'suggestion',confirmed:false}}},{...item('cancelled'),schedule:due},item('open','claim')])
    await s.ok('block',{expectedVersion:1,reason:'Waiting for approved synthetic input',requestedMemberId:'member_A',requestedAction:'Provide approved input'},{id:p.taskIds[0]})
    await s.ok('cancelTask',{expectedVersion:1,reason:'Synthetic cancellation'},{id:p.taskIds[2]})
    const all=(await s.workspace()).value;expect(all.summary).toMatchObject({total:4,blocked:1,overdue:1,active:1,cancelled:1,awaitingAcceptance:1})
    expect(all.data.find((row:{task:{id:string}})=>row.task.id===p.taskIds[0])).toMatchObject({overdue:true,nextActions:expect.arrayContaining(['resume']),task:{blocker:{requestedAction:'Provide approved input'}}})
    expect(all.data.find((row:{task:{id:string}})=>row.task.id===p.taskIds[2]).overdue).toBe(false)
    const mine=(await s.workspace(1,'?scope=mine&limit=1')).value;expect(mine.data).toEqual([]);expect(mine.summary.total).toBe(0)
    const publicOnly=(await s.workspace(1,'?scope=lab&limit=1')).value;expect(publicOnly.summary).toMatchObject({total:1,blocked:0,overdue:0,accepted:0})
    expect(publicOnly.data[0].task.projection).toBe('claim_summary')
  })
})

describe('confirmed deadline timezone semantics',()=>{
  it('keeps date deadlines due through their own local day and checks instants strictly',()=>{
    const dated=(timezone:string):ScheduleModel=>({...schedule,hardDeadline:{value:{kind:'date',date:'2026-10-10',timezone},source:'user',confirmed:true}})
    expect(scheduleOverdue(dated('Asia/Shanghai'),'2026-10-10T15:59:59Z')).toBe(false)
    expect(scheduleOverdue(dated('Asia/Shanghai'),'2026-10-10T16:00:00Z')).toBe(true)
    expect(scheduleOverdue(dated('America/Los_Angeles'),'2026-10-11T06:59:59Z')).toBe(false)
    expect(scheduleOverdue(dated('America/Los_Angeles'),'2026-10-11T07:00:00Z')).toBe(true)
    const instant:ScheduleModel={...schedule,committed:{value:{kind:'instant',at:'2026-10-10T10:00:00Z'},source:'member',confirmed:true}}
    expect(scheduleOverdue(instant,'2026-10-10T10:00:00Z')).toBe(false)
    expect(scheduleOverdue(instant,'2026-10-10T10:00:01Z')).toBe(true)
  })
  it('does not turn suggested or unconfirmed time into an overdue commitment',()=>{
    const due={value:{kind:'date' as const,date:'2000-01-01',timezone:'UTC'},source:'suggestion' as const,confirmed:false}
    expect(scheduleOverdue({...schedule,suggested:{...due,confirmed:true}},'2026-10-10T00:00:00Z')).toBe(false)
    expect(scheduleOverdue({...schedule,committed:due},'2026-10-10T00:00:00Z')).toBe(false)
    expect(scheduleOverdue({...schedule,committed:{...due,confirmed:true}},'2026-10-10T00:00:00Z')).toBe(false)
  })
})
