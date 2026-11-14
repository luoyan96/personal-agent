import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,expect,it} from 'vitest'
import {routes,GroupAssistantOutput} from '@research-agent-platform/contracts'
import type {RouteName,Conversation,Contact} from '@research-agent-platform/contracts'
import {readConfig} from '../src/config.js'
import {openDatabase,migrate,seed,transaction,checkDatabase} from '../src/database.js'
import {provisionTestAccounts} from '../src/auth.js'
import {createServer} from '../src/server.js'
import {ChatService} from '../src/chat.js'
import {serviceFor} from '../src/execution-worker.js'
import {FeedbackWorker} from '../src/feedback-worker.js'
import { currentHabit } from '../src/feedback-queue.js'
import {ChatWorker} from '../src/chat-worker.js'
import {GroupNoticeWorker,queueGroupNotice} from '../src/group-notices.js'
import {OpenImBridge} from '../src/openim-bridge.js'
import {conversationRulesContext} from '../src/constitution-context.js'

const clean:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const f of clean.splice(0).reverse())await f()})
async function setup(legacy=false){
  const dir=mkdtempSync(join(tmpdir(),'rap-group35-'));clean.push(()=>rmSync(dir,{recursive:true,force:true}))
  const key=join(dir,'synthetic.key');writeFileSync(key,randomBytes(32).toString('hex'),{mode:0o600})
  const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'db.sqlite'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'http://127.0.0.1:4173',B3_AI_ENABLED:'1',LAB_CREDENTIAL_KEY_FILE:key})
  mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);clean.push(()=>db.close())
  if(legacy){
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL) STRICT')
    const base=new URL('../migrations/',import.meta.url)
    for(const file of readdirSync(base).filter(f=>/^\d{3}-/.test(f)&&f<'035').sort()){
      const sql=readFileSync(new URL(file,base),'utf8');transaction(db,()=>{db.exec(sql);db.prepare('INSERT INTO schema_migrations VALUES (?,?,?)').run(Number(file.slice(0,3)),createHash('sha256').update(sql).digest('hex'),'2026-11-01T00:00:00Z')})
    }
  }else migrate(db)
  seed(db,'test');await provisionTestAccounts(db,'test',['A','B','C'].map(x=>({memberId:`member_${x}`,username:`synthetic_${x}`,password:'synthetic-only-password-123'})))
  if(legacy)return {db,config} as never
  db.prepare("INSERT INTO lab_managers(lab_id,member_id,granted_at) VALUES ('lab_synthetic','member_A',?)").run(new Date().toISOString())
  const app=createServer(config);clean.push(()=>app.close())
  const clients: {cookie:string;csrf:string}[]=[]
  for(const x of ['A','B','C']){
    const login=await app.inject({method:'POST',url:routes.login.path,headers:{origin:config.origin},payload:{username:`synthetic_${x}`,password:'synthetic-only-password-123'}})
    expect(login.statusCode,login.body).toBe(200)
    const cookie=String(login.headers['set-cookie']).split(';')[0]!,session=await app.inject({url:routes.session.path,headers:{cookie}})
    clients.push({cookie,csrf:session.json().data.csrfToken})
  }
  async function call(name:RouteName,body:unknown=null,id?:string,actor=0,extra:Record<string,string>={},key=randomUUID()){
    const route=routes[name],c=clients[actor]!,params={id,...extra};const url=route.path.replace(/\{(\w+)\}/g,(_,n:string)=>params[n as keyof typeof params]!)
    const r=await app.inject({method:route.method,url,headers:{origin:config.origin,cookie:c.cookie,'x-csrf-token':c.csrf,'idempotency-key':key},...(route.method!=='GET'?{payload:body as object}:{})})
    return {status:r.statusCode,data:r.json().data,error:r.json().error,raw:r.body}
  }
  const chat=(actor=0)=>{const s=new ChatService(serviceFor(db,`member_${['A','B','C'][actor]}`,config).c,config);s.ensureContacts();return s}
  const contacts=(await call('chatContacts')).data as Contact[],human=(x:string)=>contacts.find(c=>c.identity.kind==='human'&&c.identity.memberId===`member_${x}`)!
  const create=async(labId?:string|null)=>{const r=await call('imCreateGroup',{title:'合成群',contactIds:[human('B').id,human('C').id],plan:null,sharedContext:{selectedText:null,artifactRefs:[]},...(labId!==undefined?{labId}:{})});expect(r.status,r.raw).toBe(200);return r.data as Conversation}
  return {db,config,call,chat,human,create}
}

it('creates one fixed assistant atomically; rejects inviting/removing agents and preserves direct human chat',async()=>{
  const s=await setup(),g=await s.create(null),agent=s.chat().contact(`group_assistant_${g.id}`)
  expect(g.labId).toBeNull();expect(agent.identity).toMatchObject({kind:'public_agent',capability:null});expect(agent.labId).toBeNull()
  expect(g.members.filter(m=>m.status==='joined')).toHaveLength(4)
  expect((await s.call('chatConversation',null,g.id,1)).status).toBe(200)
  expect((await s.call('chatContacts')).data.some((c:Contact)=>c.id===agent.id)).toBe(false)
  expect((await s.call('updateContactProfile',{expectedVersion:agent.profile.version,displayName:'冒名',introduction:'',capabilityDescription:'',personality:''},agent.id)).error.code).toBe('GROUP_AGENT_NOT_ALLOWED')
  const personal=(await s.call('personalConversation',{})).data.agent as Contact
  expect((await s.call('imInviteContact',{expectedConversationVersion:g.version,contactId:personal.id},g.id)).error.code).toBe('GROUP_AGENT_NOT_ALLOWED')
  expect((await s.call('revokeChatMember',{expectedConversationVersion:g.version,expectedVersion:1,reason:'synthetic'},g.id,0,{contactId:agent.id})).error.code).toBe('GROUP_AGENT_NOT_ALLOWED')
  const forbidden=await s.call('imCreateGroup',{title:'拒绝群',contactIds:[personal.id],plan:null,sharedContext:{selectedText:null,artifactRefs:[]}})
  expect(forbidden.error.code).toBe('GROUP_AGENT_NOT_ALLOWED');expect(s.db.prepare("SELECT count(*) n FROM chat_conversations WHERE kind='group'").get()!.n).toBe(1)
})

it('uses real membership choices and primary lab, never selected space; switches column/document without changing IM IDs',async()=>{
  const s=await setup();s.db.prepare("INSERT INTO labs VALUES ('lab_second','合成第二组')").run();s.db.prepare("INSERT INTO lab_memberships VALUES ('lab_second','member_A','active',?,1)").run(new Date().toISOString())
  const choices=await s.call('groupLabChoices');expect(choices.data.primaryLabId).toBe('lab_synthetic');expect(choices.data.labs).toHaveLength(2)
  expect((await s.call('imCreateGroup',{title:'须选择',contactIds:[s.human('B').id],plan:null,sharedContext:{selectedText:null,artifactRefs:[]}})).error.code).toBe('GROUP_LAB_REQUIRED')
  const g=await s.create(null),bridge=new OpenImBridge(s.db,s.config),before=bridge.mapping(s.chat(),g.id),contact=bridge.identity(s.chat(),`group_assistant_${g.id}`)
  expect((await s.call('updateGroupLab',{expectedVersion:g.version,labId:'lab_second'},g.id,1)).status).toBe(403)
  const changed=await s.call('updateGroupLab',{expectedVersion:g.version,labId:'lab_second'},g.id)
  expect(changed.status,changed.raw).toBe(200);expect(changed.data.labId).toBe('lab_second')
  expect(s.db.prepare('SELECT lab_id FROM chat_conversations WHERE id=?').get(g.id)!.lab_id).toBe('lab_second')
  expect(bridge.mapping(s.chat(),g.id).imConversationID).toBe(before.imConversationID);expect(bridge.identity(s.chat(),contact.contact.id).userID).toBe(contact.userID)
  expect(s.db.prepare('SELECT count(*) n FROM group_governance_events').get()!.n).toBe(1)
})

it('requires a human successor before owner leaves, replays leave, keeps remaining members and lab unchanged',async()=>{
  const s=await setup(),g=await s.create(null)
  expect((await s.call('leaveChatGroup',{expectedVersion:g.version},g.id)).error.code).toBe('GROUP_OWNER_TRANSFER_REQUIRED')
  const key=randomUUID(),body={expectedVersion:g.version,successorMemberId:'member_B'}
  expect((await s.call('leaveChatGroup',body,g.id,0,{},key)).status).toBe(200)
  expect((await s.call('leaveChatGroup',body,g.id,0,{},key)).status).toBe(200)
  expect((await s.call('chatConversation',null,g.id)).status).toBe(404)
  const left=await s.call('chatConversation',null,g.id,2);expect(left.status,left.raw).toBe(200);expect(left.data.ownerMemberId).toBe('member_B');expect(left.data.labId).toBeNull()
})

it('allows a bound-lab manager to replace an owner who left the lab without granting group history',async()=>{
  const s=await setup(),r=await s.call('imCreateGroup',{title:'待交接合成群',contactIds:[s.human('B').id],plan:null,sharedContext:{selectedText:null,artifactRefs:[]}})
  expect(r.status,r.raw).toBe(200);const g=r.data as Conversation
  s.db.prepare("UPDATE lab_managers SET member_id='member_C' WHERE lab_id='lab_synthetic'").run()
  const body={expectedVersion:g.version,memberId:'member_B'}
  expect((await s.call('transferGroupOwner',body,g.id,2)).status).toBe(403)
  s.db.prepare("INSERT INTO lab_memberships VALUES ('lab_synthetic','member_A','removed',?,1)").run(new Date().toISOString())
  expect((await s.call('chatConversation',null,g.id,2)).status).toBe(404)
  const result=await s.call('transferGroupOwner',body,g.id,2);expect(result.status,result.raw).toBe(200)
  expect(Object.keys(result.data).sort()).toEqual(['ownerMemberId','version']);expect(result.data.ownerMemberId).toBe('member_B')
  expect((await s.call('chatMessages',null,g.id,2)).status).toBe(404)
})

it('validates notices against the actual speaker; dedups 24h, enforces quota, delivers and acknowledges only explicit replies',async()=>{
  const s=await setup(),g=await s.create(null),a=`group_assistant_${g.id}`,chat=s.chat()
  const source=transaction(s.db,()=>chat.message(g.id,{senderContactId:s.human('A').id,origin:'human',text:'合成转达请求',mentions:[],resources:[],actionIds:[],turnId:null}))
  const request={kind:'ask',to:'member_B',text:'合成材料齐了吗',dueAt:null,requiresAck:false}
  const queue=(raw:unknown)=>transaction(s.db,()=>queueGroupNotice(chat,g.id,source.id,a,raw))
  expect(()=>queue({...request,from:'member_C'})).toThrow();expect(()=>queue({...request,to:'not-in-group'})).toThrow();expect(()=>queue({...request,kind:'assign'})).toThrow()
  const n=queue(request).notice;expect(n.status).toBe('pending');expect(queue(request).duplicate).toBe(true)
  expect(s.db.prepare('SELECT count(*) n FROM group_notices').get()!.n).toBe(1)
  expect(new GroupNoticeWorker(s.db,s.config).tick()).toBe(true)
  const delivered=(await s.call('groupNotices',null,g.id)).data[0];expect(delivered.status).toBe('delivered');expect(delivered.fromMemberId).toBe('member_A')
  const personal=(await s.call('personalConversation',{},undefined,1)).data.conversation
  const reply=await s.call('sendChatMessage',{text:'合成回应，不回传私聊正文',intent:'chat',replyToMessageId:delivered.messageId},personal.id,1)
  expect(reply.status,reply.raw).toBe(201)
  expect((await s.call('groupNotices',null,g.id)).data[0].status).toBe('responded')
  for(let i=1;i<20;i++)queue({...request,text:`synthetic-${i}`})
  expect(()=>queue({...request,text:'over quota'})).toThrow()
  const list=(await s.call('groupNotices',null,g.id)).data,second=list.find((n:{status:string})=>n.status==='pending')
  expect((await s.call('withdrawGroupNotice',{},g.id,1,{noticeId:second.id})).status).toBe(403)
  expect((await s.call('withdrawGroupNotice',{},g.id,0,{noticeId:second.id})).data.status).toBe('withdrawn')
  expect(GroupAssistantOutput.safeParse({answer:'ok',requests:[{...request,from:'member_C'}]}).success).toBe(false)
})

it('injects only platform/group lab rules, same-group memory and title/status; model has no personal or write authority',async()=>{
  const s=await setup();expect((await s.call('updateLabAiSettings',{expectedVersion:0,enabled:true,model:'deepseek-flash',apiKey:'sk-synthetic-group-only-no-live-key'},'lab_synthetic')).status).toBe(200)
  const g=await s.create(null),a=`group_assistant_${g.id}`
  const sent=await s.call('sendChatMessage',{text:'@群助理 你好',intent:'ask_agent',agentContactId:a,mentions:[{contactId:a,start:0,end:4}],budget:{maxTokens:25000,maxSeconds:30}},g.id)
  expect(sent.status,sent.raw).toBe(201)
  expect(sent.data.turn.status,JSON.stringify(sent.data.turn)).toBe('queued');s.chat().checkTurnInput(sent.data.turn.id)
  let prompt='',system='';const worker=new ChatWorker(s.db,s.config,async input=>{prompt=input.prompt;system=input.system;return {text:JSON.stringify({answer:'合成群回复',requests:[{kind:'ask',to:'member_B',text:'合成询问',dueAt:null,requiresAck:false}]}),failure:null,inputTokens:100,outputTokens:20,elapsedMs:1}})
  expect(await worker.tick()).toBe(true)
  expect(system).toContain('strict JSON');expect(system).toContain('平台');expect(prompt).not.toContain('personalMemories')
  expect((await s.call('groupNotices',null,g.id)).data[0]).toMatchObject({status:'pending',fromMemberId:'member_A',toMemberId:'member_B'})
  expect(JSON.parse(prompt).groupContext.permissions).toEqual({approve:'deny',write:'request'})
  expect((await s.call('chatTurn',null,sent.data.turn.id)).data.status).toBe('succeeded')
  expect(conversationRulesContext(s.db,{id:g.id,kind:'group',labId:null},'member_A').rules.map(r=>r.layer)).toEqual(['system'])
})

it('learns group feedback only for its speaker and group', async () => {
  const s = await setup()
  await s.call('updateLabAiSettings',{expectedVersion:0,enabled:true,model:'deepseek-flash',apiKey:'sk-synthetic-only'},'lab_synthetic')
  const group = await s.create(null), other = await s.create(null)
  const agent = 'group_assistant_' + group.id
  const send = (text:string, actor:number) => s.call('sendChatMessage',{text:'@群助理 '+text,intent:'ask_agent',agentContactId:agent,mentions:[{contactId:agent,start:0,end:4}],budget:{maxTokens:25000,maxSeconds:30}},group.id,actor)
  let prompt = ''
  const reply = new ChatWorker(s.db,s.config,async input => {
    prompt = input.prompt
    return {text:JSON.stringify({answer:'收到',requests:[]}),failure:null,inputTokens:50,outputTokens:10,elapsedMs:1}
  })
  const evidence = '以后对照方案时给我列出取舍依据'
  const summary = '对照方案时列出取舍依据'
  expect((await send(evidence,0)).status).toBe(201)
  await reply.tick()
  await new FeedbackWorker(s.db,s.config,async () => ({text:JSON.stringify({evidence,summary}),failure:null,inputTokens:50,outputTokens:10,elapsedMs:1})).tick()
  expect(currentHabit(s.db,'member_A',group.id).content).toBe(summary)
  for (const [member,scope] of [['member_A',''],['member_A',other.id],['member_B',group.id]] as const)
    expect(currentHabit(s.db,member,scope).content).toBe('')
  for (const actor of [0,1]) {
    expect((await send('对比这两个方案',actor)).status).toBe(201)
    await reply.tick()
    expect(JSON.parse(prompt).senderWorkPreferences).toBe(actor===0 ? summary : undefined)
  }
})

it('upgrades a populated 034 copy twice: retires group agents, preserves message bytes, task commitments, IM IDs and FK enforcement',async()=>{
  const {db,config}=await setup(true),at='2026-11-01T00:00:00Z'
  db.prepare("INSERT INTO personal_spaces VALUES ('lab_synthetic','member_A')").run()
  db.prepare("INSERT INTO chat_contacts VALUES ('old_human','lab_synthetic','human','member_A','member_A')").run()
  db.prepare("INSERT INTO chat_contacts VALUES ('old_agent','lab_synthetic','personal_agent','member_A','old_specialist')").run()
  const group={id:'old_group',labId:'lab_synthetic',kind:'group',title:'旧合成群',ownerMemberId:'member_A',version:2,members:[],taskIds:[],lastSequence:2,createdAt:at,updatedAt:at,allowedActions:[]}
  db.prepare('INSERT INTO chat_conversations VALUES (?,?,?,?,?,?)').run(group.id,group.labId,group.ownerMemberId,group.kind,null,JSON.stringify(group))
  db.prepare("INSERT INTO chat_members VALUES ('old_group','old_human','joined',1,'owner'),('old_group','old_agent','joined',1,'member')").run()
  const text=JSON.stringify({id:'old_message',conversationId:group.id,sequence:1,senderContactId:'old_human',origin:'human',text:'原始合成消息',mentions:[],resources:[],actionIds:[],turnId:null,createdAt:at})
  db.prepare('INSERT INTO chat_messages VALUES (?,?,?,?)').run('old_message',group.id,1,text)
  const turn={id:'old_turn',conversationId:group.id,inputMessageId:'old_message',agentContactId:'old_agent',status:'succeeded',failure:null,availability:{status:'available',reason:null},outputMessageId:'old_answer',usage:null,budget:{maxTokens:1000,maxSeconds:10},remainingBudget:null,allowedActions:[],version:1,createdAt:at,updatedAt:at}
  const answer=JSON.stringify({...JSON.parse(text),id:'old_answer',sequence:2,senderContactId:'old_agent',origin:'model',text:'旧助手的合成回答',turnId:turn.id})
  db.prepare('INSERT INTO chat_messages VALUES (?,?,?,?)').run('old_answer',group.id,2,answer)
  db.prepare('INSERT INTO chat_turns(id,conversation_id,owner_id,root_id,status,request_json,document) VALUES (?,?,?,?,?,?,?)').run(turn.id,group.id,'member_A',turn.id,'succeeded',JSON.stringify({budget:turn.budget,context:[],conversationVersion:2,inputSequence:1}),JSON.stringify(turn))
  db.prepare('INSERT INTO personal_work_tasks VALUES (?,?,?,?,?,?,?,?,?)').run('old_work','member_A','active',null,group.id,1,at,at,'{"synthetic":"unchanged"}')
  db.prepare("INSERT INTO personal_work_participants VALUES ('old_work','old_agent','accepted')").run()
  db.prepare('INSERT INTO im_conversations(conversation_id,lab_id,im_conversation_id,group_id,updated_at) VALUES (?,?,?,?,?)').run(group.id,'lab_synthetic','sg_stable','g_stable',at)
  const count=Number(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get()!.n)
  migrate(db);migrate(db);checkDatabase(db)
  expect(db.prepare('PRAGMA foreign_keys').get()!.foreign_keys).toBe(1);expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  expect(db.prepare('SELECT count(*) n FROM schema_migrations').get()!.n).toBe(39)
  expect(Number(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get()!.n)).toBe(count+8)
  expect(db.prepare("SELECT lab_id,document FROM chat_conversations WHERE id='old_group'").get()).toMatchObject({lab_id:null})
  expect(db.prepare("SELECT status FROM chat_members WHERE contact_id='old_agent'").get()!.status).toBe('revoked')
  expect(db.prepare("SELECT status FROM personal_work_participants WHERE task_id='old_work'").get()!.status).toBe('accepted')
  expect(db.prepare("SELECT document FROM personal_work_tasks WHERE id='old_work'").get()!.document).toBe('{"synthetic":"unchanged"}')
  expect(db.prepare("SELECT document FROM chat_messages WHERE id='old_answer'").get()!.document).toBe(answer)
  const chat=new ChatService(serviceFor(db,'member_A',config).c,config)
  expect(chat.projectedMessage('old_answer').text).toBe('旧助手的合成回答')
  expect(new OpenImBridge(db,config).mapping(chat,group.id).imConversationID).toBe('sg_stable')
  db.prepare("UPDATE schema_migrations SET checksum='synthetic-invalid' WHERE version=35").run()
  expect(()=>migrate(db)).toThrow('checksum');expect(db.prepare('PRAGMA foreign_keys').get()!.foreign_keys).toBe(1)
  expect(db.prepare("SELECT document FROM chat_messages WHERE id='old_answer'").get()!.document).toBe(answer)
})

it('rolls a failed parent-table rebuild back atomically and restores foreign key enforcement',async()=>{
  const {db}=await setup(true)
  db.exec("PRAGMA foreign_keys=OFF; INSERT INTO chat_members VALUES ('missing_group','missing_contact','joined',1,'member'); PRAGMA foreign_keys=ON")
  expect(()=>migrate(db)).toThrow('foreign key check failed')
  expect(db.prepare('PRAGMA foreign_keys').get()!.foreign_keys).toBe(1)
  expect(db.prepare('SELECT max(version) v FROM schema_migrations').get()!.v).toBe(34)
  expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name='group_notices'").get()).toBeUndefined()
  expect(db.prepare('SELECT count(*) n FROM chat_members').get()!.n).toBe(1)
})

it('backs off delivery failures, leaves no partial recipient message, and stops after three attempts',async()=>{
  const s=await setup(),g=await s.create(null),chat=s.chat()
  const source=transaction(s.db,()=>chat.message(g.id,{senderContactId:s.human('A').id,origin:'human',text:'合成转达',mentions:[],resources:[],actionIds:[],turnId:null}))
  const notice=transaction(s.db,()=>queueGroupNotice(chat,g.id,source.id,`group_assistant_${g.id}`,{kind:'notify',to:'member_B',text:'合成通知',dueAt:null,requiresAck:false})).notice
  const personal=(await s.call('personalConversation',{},undefined,1)).data.conversation.id
  // Fail the recipient insert, after personalConversation has already been read.
  s.db.exec(`CREATE TRIGGER synthetic_delivery_failure BEFORE INSERT ON chat_messages WHEN NEW.conversation_id='${personal}' BEGIN SELECT RAISE(ABORT,'synthetic delivery failure'); END`)
  const worker=new GroupNoticeWorker(s.db,s.config)
  for(let attempt=1;attempt<=3;attempt++){
    s.db.prepare("UPDATE group_notices SET next_attempt_at=NULL WHERE id=?").run(notice.id)
    expect(worker.tick()).toBe(true)
    const row=s.db.prepare('SELECT status,delivery_attempts,message_id FROM group_notices WHERE id=?').get(notice.id)!
    expect(row.delivery_attempts).toBe(attempt);expect(row.message_id).toBeNull();expect(row.status).toBe(attempt===3?'cancelled':'pending')
  }
  expect(worker.tick()).toBe(false)
  expect(s.db.prepare('SELECT count(*) n FROM chat_messages WHERE conversation_id=?').get(personal)!.n).toBe(0)
})
