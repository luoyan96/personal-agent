import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { AssistantStickerExtension, OpenImResearchPointer, personalStickerInputPrefix, routes } from '@research-agent-platform/contracts'
import type { Contact, Conversation, RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { openDatabase, migrate, seed, transaction, checkDatabase } from '../src/database.js'
import { provisionTestAccounts, authenticate } from '../src/auth.js'
import { createServer } from '../src/server.js'
import { OpenImClient, ImUnavailable } from '../src/openim-client.js'
import type { ImCall } from '../src/openim-client.js'
import { OpenImBridge } from '../src/openim-bridge.js'
import { OpenImWorker } from '../src/openim-worker.js'
import { AssistantGreetingWorker } from '../src/assistant-greetings.js'
import { ChatWorker } from '../src/chat-worker.js'
import { PersonalFollowupWorker } from '../src/personal-followups.js'
import { backup,restore } from '../src/recovery.js'

const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
const context={selectedText:null,artifactRefs:[]}

async function setup(configured=true){
  const dir=mkdtempSync(join(tmpdir(),'rap-im-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
  const secret=join(dir,'synthetic-im.secret'),key=join(dir,'synthetic-callback.key'),credential=join(dir,'synthetic-model.key'),callbackKey=randomBytes(32).toString('hex')
  writeFileSync(secret,'synthetic-management-secret-not-real',{mode:0o600});writeFileSync(key,callbackKey,{mode:0o600});writeFileSync(credential,randomBytes(32).toString('hex'),{mode:0o600})
  const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'im.sqlite'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'http://127.0.0.1:4317',B3_AI_ENABLED:'1',LAB_CREDENTIAL_KEY_FILE:credential,
    ...(configured?{OPENIM_API_URL:'http://127.0.0.1:15002',OPENIM_PUBLIC_API_URL:'http://127.0.0.1:15002',OPENIM_PUBLIC_WS_URL:'ws://127.0.0.1:15001',OPENIM_SECRET_FILE:secret,OPENIM_CALLBACK_KEY_FILE:key,OPENIM_POLICY_ENFORCED:'1'}:{})})
  mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);cleanup.push(()=>db.close());migrate(db);seed(db,'test')
  const accounts=['A','B','C'].map(letter=>({memberId:`member_${letter}`,username:`im_${letter}`,password:randomBytes(12).toString('hex')}))
  await provisionTestAccounts(db,'test',accounts)
  db.prepare("INSERT INTO lab_managers(lab_id,member_id,granted_at) VALUES ('lab_synthetic','member_A',?)").run(new Date().toISOString())
  db.prepare("INSERT INTO public_capabilities VALUES ('lab_synthetic','text-evidence-checklist',1,1,'member_A')").run()
  type B=Record<string,any>
  const calls:{path:string;body:B;operationID?:string}[]=[],users=new Map<string,B>(),groups=new Map<string,B[]>(),friends=new Map<string,string[]>(),sent:B[]=[]
  let failSend=false,afterSend=true,failManagement=false,skipProfileHook=false,onToken:(()=>Promise<void>)|null=null,onFriendList:(()=>Promise<void>)|null=null,friendListResult:Record<string,unknown>|null=null
  let app:ReturnType<typeof createServer>
  async function callback(command:string,body:B,keyValue=callbackKey,operator=body.msgFrom===100?{userID:String(body.sendID),platform:body.senderPlatformID===3?'Windows':'Web'}:{userID:'imAdmin',platform:'Admin'},operationID=String(body.operationID??'')){const response=await app.inject({method:'POST',url:`/api/v1/im/callback/${keyValue}/${command}`,headers:{'x-rap-openim-operator':operator.userID,'x-rap-openim-platform':operator.platform,'x-rap-openim-policy':'rap-auth-v1',operationID},payload:{...body,callbackCommand:command}});return {status:response.statusCode,value:response.json()}}
  async function before(command:string,body:B,operationID?:string){const response=await callback(command,body,callbackKey,undefined,operationID);if(response.status!==200||response.value.nextCode!==0)throw new ImUnavailable('provisioning_failed')}
  const call:ImCall=async(path,raw,_token,operationID)=>{
    const body=raw as B;calls.push({path,body,operationID})
    if(failManagement)throw new ImUnavailable('backend_unreachable')
    if(path==='/auth/get_admin_token')return {token:'synthetic-admin-token',expireTimeSeconds:3600}
    if(path==='/auth/force_logout')return {}
    if(path==='/auth/get_user_token'){if(onToken)await onToken();return {token:`synthetic-user-token-${randomUUID()}`,expireTimeSeconds:3600}}
    if(path==='/user/get_users_info')return {usersInfo:body.userIDs.flatMap((id:string)=>users.has(id)?[users.get(id)]:[])}
    if(path==='/user/user_register'){await before('callbackBeforeUserRegisterCommand',body);for(const u of body.users)users.set(u.userID,u);return {}}
    // Fixed Go v3.8.3-patch.15 callback.go takes nickname/faceURL pointers but leaves Ex nil.
    if(path==='/user/update_user_info'){if(!skipProfileHook)await before('callbackBeforeUpdateUserInfoCommand',{userID:body.userInfo.userID,nickName:body.userInfo.nickname,faceURL:body.userInfo.faceURL,ex:null},operationID);return {}}
    if(path==='/friend/import_friend'){await before('callbackBeforeImportFriendsCommand',body);friends.set(body.ownerUserID,[...new Set([...(friends.get(body.ownerUserID)??[]),...body.friendUserIDs])]);return {}}
    // Fixed Go FriendsDB2Pb returns nil for an empty list; Gin JSON retains total:0.
    if(path==='/friend/get_friend_list'){const ids=friends.get(body.userID)??[],result=friendListResult??{friendsInfo:ids.length?ids.map(userID=>({friendUser:{userID}})):null,total:ids.length};if(onFriendList)await onFriendList();return result}
    if(path==='/friend/delete_friend'){friends.set(body.ownerUserID,(friends.get(body.ownerUserID)??[]).filter(id=>id!==body.friendUserID));return {}}
    if(path==='/conversation/set_conversations')return {}
    if(path==='/group/get_groups_info')return {groupInfos:body.groupIDs.flatMap((groupID:string)=>groups.has(groupID)?[{groupID}]:[])}
    if(path==='/group/create_group'){
      const members=[{userID:body.ownerUserID,roleLevel:100},...body.memberUserIDs.map((userID:string)=>({userID,roleLevel:20}))]
      await before('callbackBeforeCreateGroupCommand',{...body.groupInfo,initMemberList:members})
      await before('callbackBeforeMembersJoinGroupCommand',{groupID:body.groupInfo.groupID,memberList:members})
      groups.set(body.groupInfo.groupID,members);return {}
    }
    if(path==='/group/get_group_member_list'){const members=groups.get(body.groupID)??[];return {members,total:members.length}}
    if(path==='/group/kick_group'){groups.set(body.groupID,groups.get(body.groupID)!.filter(m=>!body.kickedUserIDs.includes(m.userID)));await callback('callbackAfterKickGroupCommand',body);return {}}
    if(path==='/group/invite_user_to_group'){await before('callbackBeforeInviteJoinGroupCommand',body);await before('callbackBeforeMembersJoinGroupCommand',{groupID:body.groupID,memberList:body.invitedUserIDs.map((userID:string)=>({userID}))});groups.get(body.groupID)!.push(...body.invitedUserIDs.map((userID:string)=>({userID,roleLevel:20})));return {}}
    if(path==='/msg/send_msg'){
      const msg={...body,content:JSON.stringify(body.content),msgFrom:200,operationID,clientMsgID:randomUUID(),serverMsgID:randomUUID()};sent.push(msg)
      await before(body.groupID?'callbackBeforeSendGroupMsgCommand':'callbackBeforeSendSingleMsgCommand',msg)
      if(failSend)throw new ImUnavailable('backend_unreachable')
      if(afterSend)await callback(body.groupID?'callbackAfterSendGroupMsgCommand':'callbackAfterSendSingleMsgCommand',msg)
      return {serverMsgID:msg.serverMsgID}
    }
    throw new Error(`Unexpected synthetic management route ${path}`)
  }
  const client=new OpenImClient(config,call);app=createServer(config,{imClient:client});cleanup.push(()=>app.close())
  const clients:{cookie:string;csrf:string;token:string}[]=[]
  async function login(index:number){
    const account=accounts[index]!
    const response=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:config.origin},payload:{username:account.username,password:account.password}})
    expect(response.statusCode).toBe(200)
    const cookie=String(response.headers['set-cookie']).split(';')[0]!,session=await app.inject({url:'/api/v1/auth/session',headers:{cookie}})
    clients[index]={cookie,csrf:session.json().data.csrfToken,token:cookie.slice('rap_session='.length)}
  }
  for(let index=0;index<accounts.length;index++)await login(index)
  async function request(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,keyValue=randomUUID(),headers:Record<string,string>={}){
    const route=routes[name],response=await app.inject({method:route.method,url:route.path.replace(/\{(\w+)\}/g,(_,k:string)=>params[k]!),headers:{origin:config.origin,cookie:clients[actor]!.cookie,'x-csrf-token':clients[actor]!.csrf,'idempotency-key':keyValue,...headers},...(route.method==='GET'?{}:{payload:body as B})})
    return {status:response.statusCode,value:response.json(),raw:response.body}
  }
  const contacts=(await request('chatContacts')).value.data as Contact[]
  const human=(member:string)=>contacts.find(c=>c.identity.kind==='human'&&c.identity.memberId===member)!,agent=(member:string)=>contacts.find(c=>c.identity.kind==='personal_agent'&&c.identity.ownerMemberId===member)!,publicAgent=contacts.find(c=>c.identity.kind==='public_agent')!
  const bridge=new OpenImBridge(db,config,client),actor=(index=0)=>authenticate(db,clients[index]!.token)
  const identity=(id:string,index=0)=>transaction(db,()=>bridge.identity(bridge.chat(actor(index)),id).userID)
  async function connect(id:string,index=0){const relation=(await request('requestContact',{}, {id},index)).value.data.relationship;if(relation.status==='pending_outbound'){const contact=contacts.find(c=>c.id===id)!,owner=contact.identity.kind==='human'?contact.identity.memberId:contact.identity.ownerMemberId;expect((await request('decideContactRequest',{expectedVersion:relation.version,decision:'accept'},{id:relation.requestId},['member_A','member_B','member_C'].indexOf(owner))).status).toBe(200)}}
  return {dir,db,config,app,clients,accounts,login,request,callback,bridge,client,calls,groups,friends,sent,contacts,human,agent,publicAgent,actor,identity,connect,setFailSend:(v:boolean)=>{failSend=v},setFailManagement:(v:boolean)=>{failManagement=v},setSkipProfileHook:(v:boolean)=>{skipProfileHook=v},setAfterSend:(v:boolean)=>{afterSend=v},setOnToken:(v:(()=>Promise<void>)|null)=>{onToken=v},setOnFriendList:(v:(()=>Promise<void>)|null)=>{onFriendList=v},setFriendListResult:(v:Record<string,unknown>|null)=>{friendListResult=v}}
}

describe('OpenIM bridge with explicit synthetic management adapter, not live server verification',{timeout:20000},()=>{
  it('provisions a visitor-only consultation mapping and sends canonical pointers without importing a friend', async () => {
    const s = await setup(), target = s.agent('member_A')
    expect((await s.request('updateAgentConsultation', { expectedVersion: 0, mode: 'free' }, { id: target.id })).status).toBe(200)
    const direct = await s.request('createDirectConversation', { contactId: target.id }, {}, 1)
    expect(direct.status, direct.raw).toBe(200)
    const id = direct.value.data.id
    const sync = await s.request('imSyncConversation', {}, { id }, 1)
    expect(sync.status, sync.raw).toBe(200)
    const mapping = sync.value.data
    const self = s.identity(s.human('member_B').id, 1), peer = s.identity(target.id, 1)
    expect(mapping).toMatchObject({ transportStatus: 'ready', peerUserID: peer })
    expect(s.calls.filter(call => call.path === '/conversation/set_conversations')).toMatchObject([
      { body: { userIDs: [self], conversation: { conversationID: mapping.imConversationID, userID: peer } } },
    ])
    expect(s.calls.some(call => call.path === '/friend/import_friend')).toBe(false)
    expect((await s.request('createPersonalModel', {
      name: '访客合成模型', provider: 'deepseek', model: 'deepseek-flash', enabled: true, apiKey: 'synthetic-visitor-model-key',
    }, {}, 1)).status).toBe(201)
    const sent = await s.request('agentChatMessage', { text: '访客咨询' }, { id }, 1)
    expect(sent.status, sent.raw).toBe(201)
    const model = new ChatWorker(s.db, s.config, async () => ({
      text: '合成咨询回复', failure: null, inputTokens: 20, outputTokens: 8, elapsedMs: 5,
    }))
    expect(await model.tick()).toBe(true)
    const worker = new OpenImWorker(s.db, s.config, s.client)
    expect(await worker.tick()).toBe(true)
    expect(await worker.tick()).toBe(true)
    expect(s.sent).toMatchObject([
      { sendID: self, recvID: peer, contentType: 110 },
      { sendID: peer, recvID: self, contentType: 110 },
    ])
    expect(String(s.sent[0]!.content)).not.toContain('访客咨询')
    expect(String(s.sent[1]!.content)).not.toContain('合成咨询回复')
    expect(s.db.prepare('SELECT status FROM im_message_outbox WHERE message_id=?').get(sent.value.data.message.id)).toMatchObject({ status: 'sent' })
    expect((await s.request('imSyncConversation', {}, { id })).status).toBe(404)
  })

  it('welcomes new and existing users once in their own private assistant history, even while IM is unavailable',async()=>{
    vi.useFakeTimers({toFake:['Date']})
    cleanup.push(()=>vi.useRealTimers())
    vi.setSystemTime(new Date('2026-10-31T15:00:00Z'))
    const s=await setup(false)
    const personal=(await s.request('personalConversation',{})).value.data.conversation
    const manual=await s.request('sendChatMessage',{text:'原有聊天内容'},{id:personal.id})
    expect(manual.status,manual.raw).toBe(201)
    const requests=await Promise.all([
      s.request('imSession',{platformID:5},{},0,undefined,{'x-acceptcat-time-zone':'America/Los_Angeles'}),
      s.request('imSession',{platformID:3},{},0,undefined,{'x-acceptcat-time-zone':'Asia/Invalid'}),
      s.request('imSession',{platformID:5},{},1),
    ])
    expect(requests.map(request=>request.value.data.status)).toEqual(['unavailable','unavailable','unavailable'])
    expect(requests[0]!.value.data.coordinator.researchConversationId).toBe(personal.id)
    const state=s.db.prepare('SELECT * FROM assistant_greetings WHERE member_id=?')
    expect(state.get('member_A')).toMatchObject({device_time_zone:'America/Los_Angeles',last_greeting_date:'2026-10-31',next_daily_at:'2026-11-01T17:00:00.000Z'})
    expect(state.get('member_B')).toMatchObject({device_time_zone:null,last_greeting_date:'2026-10-31',next_daily_at:'2026-11-01T01:00:00.000Z'})
    expect(state.get('member_C')).toBeUndefined()
    const {data:messages}=(await s.request('chatMessages',null,{id:personal.id})).value
    expect(messages).toMatchObject([
      {id:manual.value.data.message.id,origin:'human',text:'原有聊天内容',sequence:1},
      {id:state.get('member_A')!.welcome_message_id,origin:'service',senderContactId:s.agent('member_A').id,text:'你好呀，以后咱们一起做研究。',sequence:2,turnId:null},
    ])
    expect((await s.request('chatMessages',null,{id:personal.id},1)).status).toBe(404)
    expect(s.db.prepare('SELECT status FROM im_message_outbox WHERE message_id=?').get(messages[1].id)?.status).toBe('pending')
    expect(s.db.prepare('SELECT count(*) n FROM chat_turns').get()!.n).toBe(0)
    const settings=await s.request('updatePersonalMemorySettings',{expectedVersion:1,candidateLearning:false,timeZone:'Asia/Tokyo',quietHours:null})
    expect(settings.status,settings.raw).toBe(200)
    expect(state.get('member_A')?.next_daily_at).toBe('2026-11-01T00:00:00.000Z')
    await s.request('imSession',{platformID:5},{},0,undefined,{'x-acceptcat-time-zone':'Europe/Paris'})
    expect(state.get('member_A')).toMatchObject({welcome_message_id:messages[1].id,device_time_zone:'Europe/Paris',next_daily_at:'2026-11-01T00:00:00.000Z'})
  })

  it('sends the daily greeting at local 09:00 through the durable IM outbox with no active login',async()=>{
    vi.useFakeTimers({toFake:['Date']})
    cleanup.push(()=>vi.useRealTimers())
    vi.setSystemTime(new Date('2026-10-31T15:00:00Z'))
    const s=await setup()
    const session=(await s.request('imSession',{platformID:5},{},0,undefined,{'x-acceptcat-time-zone':'America/Los_Angeles'})).value.data
    expect(session.status).toBe('available')
    const id=session.coordinator.researchConversationId
    const imWorker=new OpenImWorker(s.db,s.config,s.client)
    const offline=new AssistantGreetingWorker(s.db,s.config)
    expect(await imWorker.tick()).toBe(true)
    expect((await s.request('logout',{})).status).toBe(200)
    expect(await imWorker.tick()).toBe(true)
    expect(s.db.prepare('SELECT count(*) n FROM im_token_leases').get()!.n).toBe(0)
    const received=()=>s.db.prepare('SELECT id,document FROM chat_messages WHERE conversation_id=? ORDER BY sequence').all(id)
    vi.setSystemTime(new Date('2026-11-01T16:59:59Z'))
    expect(await offline.tick()).toBe(false)
    vi.setSystemTime(new Date('2026-11-01T17:00:00Z'))
    s.db.exec("CREATE TEMP TRIGGER fail_greeting_schedule BEFORE UPDATE ON assistant_greetings BEGIN SELECT RAISE(ABORT,'synthetic schedule write fault'); END")
    await expect(offline.tick()).rejects.toThrow('synthetic schedule write fault')
    expect(received()).toHaveLength(1)
    expect(s.db.prepare('SELECT count(*) n FROM im_message_outbox').get()!.n).toBe(1)
    s.db.exec('DROP TRIGGER fail_greeting_schedule')
    const reopened=openDatabase(s.config.databasePath)
    cleanup.push(()=>reopened.close())
    expect(await Promise.all([offline.tick(),new AssistantGreetingWorker(reopened,s.config).tick()])).toEqual([true,false])
    expect(received()).toHaveLength(2)
    const greeting=JSON.parse(String(received()[1]!.document))
    expect(greeting).toMatchObject({origin:'service',senderContactId:s.agent('member_A').id,text:expect.stringMatching(/^早上好/),turnId:null,sequence:2})
    expect(await imWorker.tick()).toBe(true)
    expect(s.sent).toHaveLength(2)
    expect(s.sent[1]).toMatchObject({sendID:session.coordinator.peerUserID,recvID:session.user.userID,isOnlineOnly:false,sessionType:1})
    expect(JSON.parse(JSON.parse(s.sent[1]!.content).data)).toMatchObject({conversationId:id,messageId:greeting.id,sequence:2})
    expect(s.db.prepare('SELECT status FROM im_message_outbox WHERE message_id=?').get(greeting.id)?.status).toBe('sent')
    expect(await imWorker.tick()).toBe(false)
    vi.setSystemTime(new Date('2026-11-03T05:00:00Z')) // 21:00 on Nov 2 in Los Angeles.
    expect(await offline.tick()).toBe(true)
    expect(received()).toHaveLength(2)
    expect(s.db.prepare('SELECT next_daily_at FROM assistant_greetings WHERE member_id=?').get('member_A')?.next_daily_at).toBe('2026-11-03T17:00:00.000Z')
  })

  it('applies an account-wide morning message policy and defers past quiet hours', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    cleanup.push(() => vi.useRealTimers())
    vi.setSystemTime(new Date('2026-11-11T16:00:00Z'))
    const s = await setup()
    const session = await s.request('imSession', { platformID: 5 }, {}, 0, undefined, { 'x-acceptcat-time-zone': 'Europe/Paris' })
    const id = session.value.data.coordinator.researchConversationId
    const messageCount = () => s.db.prepare('SELECT count(*) n FROM chat_messages WHERE conversation_id=?').get(id)!.n
    const next = () => s.db.prepare('SELECT next_daily_at FROM assistant_greetings WHERE member_id=?').get('member_A')!.next_daily_at
    const worker = new AssistantGreetingWorker(s.db, s.config)
    expect((await s.request('assistantProactiveSettings')).value).toEqual({ data: { mode: 'greeting', learnFromChat: false, version: 1 } })
    expect((await s.request('updatePersonalMemorySettings', {
      expectedVersion: 1, timeZone: 'UTC', quietHours: { start: '22:00', end: '10:15' }, candidateLearning: false,
    })).status).toBe(200)
    expect(next()).toBe('2026-11-12T10:15:00.000Z')
    vi.setSystemTime(new Date('2026-11-12T09:00:00Z'))
    expect(await worker.tick()).toBe(false)
    expect(messageCount()).toBe(1)
    vi.setSystemTime(new Date('2026-11-12T10:15:00Z'))
    expect(await worker.tick()).toBe(true)
    expect(messageCount()).toBe(2)
    const pendingGreeting = String(s.db.prepare('SELECT message_id FROM assistant_proactive_deliveries').get()!.message_id)
    const imWorker = new OpenImWorker(s.db, s.config, s.client)
    expect(() => imWorker.snapshot(pendingGreeting)).not.toThrow()

    await s.login(0)
    await s.login(1)
    const key = randomUUID()
    const off = { mode: 'off', learnFromChat: true, expectedVersion: 1 }
    expect((await s.request('updateAssistantProactiveSettings', off, {}, 0, key)).value).toEqual({ data: { mode: 'off', learnFromChat: true, version: 2 } })
    expect(() => imWorker.snapshot(pendingGreeting)).toThrow('FORBIDDEN')
    expect((await s.request('updateAssistantProactiveSettings', { mode: 'contextual', expectedVersion: 1 })).status).toBe(409)
    await s.request('imSession', { platformID: 3 }, {}, 0, undefined, { 'x-acceptcat-time-zone': 'Asia/Tokyo' })
    expect((await s.request('assistantProactiveSettings')).value).toEqual({ data: { mode: 'off', learnFromChat: true, version: 2 } })
    expect((await s.request('assistantProactiveSettings', null, {}, 1)).value).toEqual({ data: { mode: 'greeting', learnFromChat: false, version: 1 } })
    vi.setSystemTime(new Date('2026-11-13T10:15:00Z'))
    expect(await worker.tick()).toBe(false)
    expect(messageCount()).toBe(2)
    await s.login(0)
    expect((await s.request('updateAssistantProactiveSettings', { mode: 'greeting', expectedVersion: 2 })).status).toBe(200)
    expect((await s.request('updateAssistantProactiveSettings', off, {}, 0, key)).value).toEqual({ data: { mode: 'greeting', learnFromChat: true, version: 3 } })
    expect(await worker.tick()).toBe(true)
    expect(messageCount()).toBe(3)
  })

  it('asks once about a verified owner thread in the afternoon after recent chat has settled', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    cleanup.push(() => vi.useRealTimers())
    vi.setSystemTime(new Date('2026-11-11T16:00:00Z'))
    const s = await setup()
    const session = await s.request('imSession', { platformID: 5 }, {}, 0, undefined, { 'x-acceptcat-time-zone': 'UTC' })
    const id = session.value.data.coordinator.researchConversationId
    expect((await s.request('updateAssistantProactiveSettings', { mode: 'contextual', expectedVersion: 1 })).status).toBe(200)
    const worker = new AssistantGreetingWorker(s.db, s.config)
    vi.setSystemTime(new Date('2026-11-12T09:00:00Z'))
    expect(await worker.tick()).toBe(true)
    const subject = '合成转录数据质控'
    vi.setSystemTime(new Date('2026-11-12T12:15:00Z'))
    await s.login(0)
    await s.login(1)
    const source = await s.request('sendChatMessage', { text: `「${subject}」还没做完，下次聊到时可以问问我。` }, { id })
    expect(source.status, source.raw).toBe(201)
    const sourceId = source.value.data.message.id
    const insertThread = s.db.prepare(`INSERT INTO assistant_relationship_memories
      (id,owner_id,assistant_id,conversation_id,message_id,kind,subject,text,status,proactive,version,created_at,updated_at,expires_at)
      VALUES (?,'member_A',?,?,?,'open_thread',?,?,'active',1,1,?,?, '2026-12-12T00:00:00.000Z')`)
    const stamp = new Date().toISOString()
    insertThread.run(randomUUID(), s.agent('member_A').id, id, sourceId, subject, source.value.data.message.text, stamp, stamp)

    vi.setSystemTime(new Date('2026-11-12T14:00:00Z'))
    expect(await worker.tick()).toBe(true)
    expect(s.db.prepare('SELECT * FROM assistant_proactive_deliveries WHERE context_key IS NOT NULL').all()).toEqual([])
    expect(s.db.prepare('SELECT next_daily_at FROM assistant_greetings WHERE member_id=?').get('member_A')!.next_daily_at).toBe('2026-11-12T14:15:00.000Z')
    vi.setSystemTime(new Date('2026-11-12T14:15:00Z'))
    const reopened = openDatabase(s.config.databasePath)
    cleanup.push(() => reopened.close())
    expect(await Promise.all([worker.tick(), new AssistantGreetingWorker(reopened, s.config).tick()])).toEqual([true, false])
    const contextual = () => s.db.prepare('SELECT * FROM assistant_proactive_deliveries WHERE context_key IS NOT NULL').all()
    const logged = contextual()
    expect(logged).toMatchObject([{ member_id: 'member_A', local_date: '2026-11-12', source_message_id: sourceId }])
    const messageId = String(logged[0]!.message_id)
    const detail = await s.request('chatMessageDetails', null, { id, messageId })
    expect(detail.value.data).toMatchObject({
      message: { origin: 'service', senderContactId: s.agent('member_A').id, text: `要接着聊「${subject}」吗？`, turnId: null },
      replyTo: { messageId: sourceId },
    })
    expect((await s.request('chatMessageDetails', null, { id, messageId }, 1)).status).toBe(404)
    expect(s.db.prepare('SELECT count(*) n FROM chat_turns').get()!.n).toBe(0)
    const imWorker = new OpenImWorker(s.db, s.config, s.client)
    expect(() => imWorker.snapshot(messageId)).not.toThrow()

    vi.setSystemTime(new Date('2026-11-13T09:00:00Z'))
    expect(await worker.tick()).toBe(true)
    vi.setSystemTime(new Date('2026-11-13T14:15:00Z'))
    expect(await worker.tick()).toBe(true)
    expect(contextual()).toEqual(logged)
    s.db.prepare('INSERT INTO chat_message_retractions VALUES (?,?,?)').run(sourceId, 'member_A', new Date().toISOString())
    expect(() => imWorker.snapshot(messageId)).toThrow('FORBIDDEN')
  })

  it('leaves an explicit scheduled reminder to its worker and skips withdrawn context', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    cleanup.push(() => vi.useRealTimers())
    vi.setSystemTime(new Date('2026-11-11T16:00:00Z'))
    const s = await setup()
    const session = await s.request('imSession', { platformID: 5 }, {}, 0, undefined, { 'x-acceptcat-time-zone': 'UTC' })
    const id = session.value.data.coordinator.researchConversationId
    expect((await s.request('updateAssistantProactiveSettings', { mode: 'contextual', expectedVersion: 1 })).status).toBe(200)
    vi.setSystemTime(new Date('2026-11-12T10:00:00Z'))
    await s.login(0)
    const subject = '合成实验质控表'
    const insertThread = s.db.prepare(`INSERT INTO assistant_relationship_memories
      (id,owner_id,assistant_id,conversation_id,message_id,kind,subject,text,status,proactive,version,created_at,updated_at,expires_at)
      VALUES (?,'member_A',?,?,?,'open_thread',?,?,'active',1,1,?,?, '2026-12-12T00:00:00.000Z')`)
    for (const title of [subject, '应撤回的内容']) {
      const source = await s.request('sendChatMessage', { text: `「${title}」还没做完，下次可以问我。` }, { id })
      expect(source.status, source.raw).toBe(201)
      const message = source.value.data.message
      const now = new Date().toISOString()
      insertThread.run(randomUUID(), s.agent('member_A').id, id, message.id, title, message.text, now, now)
      if (title !== subject) expect((await s.request('withdrawChatMessage', { expectedVersion: 1 }, { id, messageId: message.id })).status).toBe(200)
    }
    const dueAt = '2026-11-12T14:10:00.000Z'
    expect((await s.request('createPersonalFollowup', { title: subject, body: '整理合成实验的质控表', dueAt, timeZone: 'UTC' })).status).toBe(201)
    const worker = new AssistantGreetingWorker(s.db, s.config)
    vi.setSystemTime(new Date('2026-11-12T14:00:00Z'))
    expect(await worker.tick()).toBe(true)
    expect(s.db.prepare('SELECT count(*) n FROM assistant_proactive_deliveries WHERE context_key IS NOT NULL').get()!.n).toBe(0)
    vi.setSystemTime(new Date(dueAt))
    const reminders = new PersonalFollowupWorker(s.db, s.config)
    expect(await reminders.tick()).toBe(true)
    expect(await reminders.tick()).toBe(false)
    expect(s.db.prepare('SELECT count(*) n FROM personal_followup_runs').get()!.n).toBe(1)

    vi.setSystemTime(new Date('2026-11-13T14:00:00Z'))
    expect(await worker.tick()).toBe(true)
    expect(s.db.prepare('SELECT count(*) n FROM assistant_proactive_deliveries WHERE context_key IS NOT NULL').get()!.n).toBe(0)
  })

  it('reconciles native withdrawals after and before send callbacks without trusting another actor',async()=>{
    const s=await setup(),session=(await s.request('imSession',{platformID:5})).value.data
    await s.request('imSession',{platformID:5},{},1)
    const operator={userID:session.user.userID,platform:'Web'},conversationID=session.coordinator.imConversationID,id=session.coordinator.researchConversationId
    const send={sendID:operator.userID,recvID:session.coordinator.peerUserID,senderPlatformID:5,msgFrom:100,contentType:101,content:JSON.stringify({content:'撤回的普通 IM 消息'}),clientMsgID:'native-revoke-1'}
    const revoke={userID:operator.userID,sendID:operator.userID,conversationID,seq:12,clientMsgID:send.clientMsgID}
    await s.callback('callbackAfterSendSingleMsgCommand',send)
    const message=JSON.parse(String(s.db.prepare("SELECT document FROM chat_messages WHERE json_extract(document,'$.origin')='human'").get()!.document))
    for(const [body,op] of [[revoke,{userID:s.identity(s.human('member_B').id),platform:'Web'}],[{...revoke,conversationID:'unknown'},operator],[{...revoke,sendID:session.coordinator.peerUserID},operator]] as const)await s.callback('callbackBeforeAfterMsgCommand',body,undefined,op)
    expect(s.db.prepare('SELECT count(*) n FROM chat_message_retractions').get()!.n).toBe(0)
    for(let i=0;i<2;i++)expect((await s.callback('callbackBeforeAfterMsgCommand',revoke,undefined,operator)).value).toEqual({errCode:0,errMsg:''})
    const detail=await s.request('chatMessageDetails',null,{id,messageId:message.id})
    expect(detail.status,detail.raw).toBe(200);expect(detail.value.data.withdrawn).toBe(true)
    expect(s.db.prepare('SELECT count(*) n FROM chat_message_retractions').get()!.n).toBe(1)
    // Delivery order is independent: a successful revoke may beat asynchronous mirroring.
    await s.callback('callbackBeforeAfterMsgCommand',{...revoke,clientMsgID:'native-revoke-2',seq:13},undefined,operator)
    await s.callback('callbackAfterSendSingleMsgCommand',{...send,clientMsgID:'native-revoke-2'})
    expect(s.db.prepare('SELECT count(*) n FROM chat_message_retractions').get()!.n).toBe(2)
    await s.callback('callbackAfterSendSingleMsgCommand',{...send,clientMsgID:'native-revoke-2'})
    expect(s.db.prepare("SELECT count(*) n FROM chat_messages WHERE json_extract(document,'$.origin')='human'").get()!.n).toBe(2)
    // An upstream-only callback without the trusted original ID cannot retract by sequence.
    await s.callback('callbackAfterSendSingleMsgCommand',{...send,clientMsgID:'native-keep'})
    await s.callback('callbackBeforeAfterMsgCommand',{...revoke,clientMsgID:undefined},undefined,operator)
    expect(s.db.prepare('SELECT count(*) n FROM chat_message_retractions').get()!.n).toBe(2)
  })
  it('requires sessions/CSRF and returns honest unavailable without credentials',async()=>{
    const s=await setup(false),response=await s.request('imSession',{platformID:5})
    expect(response.value.data).toMatchObject({status:'unavailable',reason:'not_configured',user:null,configuration:null})
    expect(s.calls).toEqual([])
    expect((await s.app.inject({method:'POST',url:routes.imSession.path,headers:{origin:s.config.origin,cookie:s.clients[0]!.cookie},payload:{platformID:5}})).statusCode).toBe(403)
    expect((await s.app.inject({url:routes.imContacts.path})).statusCode).toBe(401)
    expect((await s.callback('callbackBeforeUserRegisterCommand',{users:[]},'0'.repeat(64))).status).toBe(403)
  })
  it('provisions only own human token and coordinator, persists mapping, and fences revoked sessions',async()=>{
    const s=await setup(),session=await s.request('imSession',{platformID:5});expect(session.status,session.raw).toBe(200)
    const data=session.value.data;expect(data.status).toBe('available');expect(data.coordinator).toMatchObject({kind:'personal',pinned:true,transportStatus:'ready'})
    expect(data.user.userID).toBe(s.identity(s.human('member_A').id));expect(s.calls.filter(c=>c.path==='/auth/get_user_token').map(c=>c.body.userID)).toEqual([data.user.userID])
    expect(s.calls.filter(c=>c.path==='/auth/force_logout')).toHaveLength(1)
    const message={sendID:data.user.userID,recvID:data.coordinator.peerUserID,senderPlatformID:5,msgFrom:100,contentType:101,content:JSON.stringify({content:'普通问题不调用模型'}),clientMsgID:'ordinary_1',serverMsgID:'server_1'}
    expect((await s.callback('callbackBeforeSendSingleMsgCommand',message)).value.nextCode).toBe(0)
    expect((await s.callback('callbackBeforeSendSingleMsgCommand',message,undefined,{userID:'',platform:''})).value.nextCode).toBe(1)
    expect((await s.callback('callbackBeforeMsgModifyCommand',message)).value.nextCode).toBe(0)
    expect((await s.callback('callbackAfterSendSingleMsgCommand',message)).status).toBe(200)
    await s.callback('callbackAfterSendSingleMsgCommand',message)
    expect(s.db.prepare("SELECT count(*) n FROM chat_messages WHERE json_extract(document,'$.origin')='human'").get()!.n).toBe(1);expect(s.db.prepare('SELECT count(*) n FROM chat_turns').get()!.n).toBe(0)
    expect((await s.callback('callbackAfterSendSingleMsgCommand',{...message,content:'{"content":"different"}'})).status).toBe(409)
    await s.callback('callbackAfterSendSingleMsgCommand',{...message,clientMsgID:'ordinary_at_1',contentType:106,content:'{"text":"@助理 普通提及","atUserList":[]}'});expect(s.db.prepare('SELECT count(*) n FROM chat_turns').get()!.n).toBe(0)
    for(const type of [102,103,105])await s.callback('callbackAfterSendSingleMsgCommand',{...message,clientMsgID:`media_${type}`,contentType:type,content:'{}'})
    expect(s.db.prepare('SELECT count(*) n FROM artifacts').get()!.n).toBe(0);expect(s.db.prepare("SELECT count(*) n FROM chat_messages WHERE json_extract(document,'$.origin')='human'").get()!.n).toBe(2)
    const reopened=openDatabase(s.config.databasePath);expect(reopened.prepare('SELECT count(*) n FROM im_conversations').get()!.n).toBe(1);reopened.close()
    expect((await s.request('logout',{})).status).toBe(200)
    expect((await s.callback('callbackBeforeSendSingleMsgCommand',message)).value).toMatchObject({nextCode:1,errCode:1002})
    await new OpenImWorker(s.db,s.config,s.client).tick();expect(s.db.prepare('SELECT count(*) n FROM im_token_leases').get()!.n).toBe(0)
  })
  it('requires accepted relationships and blocks revoked contacts, expired leases and disabled accounts',async()=>{
    const s=await setup();await s.request('imSession',{platformID:5});await s.request('imSession',{platformID:3},{},1)
    const msg={sendID:s.identity(s.human('member_A').id),recvID:s.identity(s.human('member_B').id),senderPlatformID:5,msgFrom:100,contentType:101,content:'{"content":"hello"}'}
    expect((await s.callback('callbackBeforeSendSingleMsgCommand',msg)).value.nextCode).toBe(1)
    await s.connect(s.human('member_B').id)
    expect((await s.callback('callbackBeforeSendSingleMsgCommand',msg)).value.nextCode).toBe(0)
    expect((await s.callback('callbackBeforeSendSingleMsgCommand',msg,undefined,{userID:msg.recvID,platform:'Windows'})).value.nextCode).toBe(1)
    await s.request('imSync',{})
    expect(s.friends.get(msg.sendID)).toContain(msg.recvID)
    const relationship=(await s.request('chatContact',null,{id:s.human('member_B').id})).value.data.relationship
    expect((await s.request('revokeContact',{expectedVersion:relationship.version},{id:s.human('member_B').id})).status).toBe(200)
    expect((await s.callback('callbackBeforeSendSingleMsgCommand',msg)).value.nextCode).toBe(1)
    await s.request('imSync',{});expect(s.friends.get(msg.sendID)).not.toContain(msg.recvID)
    await s.connect(s.human('member_B').id)
    s.db.prepare("UPDATE im_token_leases SET expires_at='2000-01-01T00:00:00Z' WHERE member_id='member_A'").run()
    expect((await s.callback('callbackBeforeSendSingleMsgCommand',msg)).value.nextCode).toBe(1)
    await s.request('imSession',{platformID:5});s.db.prepare("UPDATE auth_accounts SET disabled=1 WHERE member_id='member_A'").run()
    expect((await s.callback('callbackBeforeSendSingleMsgCommand',msg)).value.nextCode).toBe(1)
  })
  it('reads actual friends before importing across sessions, sync and worker sends, and heals missing remote relationships',async()=>{
    const s=await setup();await s.connect(s.human('member_B').id)
    const direct=(await s.request('createDirectConversation',{contactId:s.human('member_B').id})).value.data
    expect((await s.request('imSession',{platformID:5})).value.data.status).toBe('available')
    expect((await s.request('imSync',{})).value.data.status).toBe('available')
    const imports=()=>s.calls.filter(c=>c.path==='/friend/import_friend'),count=imports().length
    expect(count).toBeGreaterThan(0)
    const personal=(await s.request('personalConversation',{})).value.data.conversation
    for(let i=0;i<2;i++){
      expect((await s.request('imSession',{platformID:5})).value.data.status).toBe('available')
      expect((await s.request('imSyncConversation',{}, {id:direct.id})).value.data.transportStatus).toBe('ready')
      expect((await s.request('imSync',{})).value.data.status).toBe('available')
    }
    await s.request('sendChatMessage',{text:'科研记录并不重复添加好友',intent:'chat',agentContactId:null,budget:null,context:[]},{id:personal.id})
    const worker=new OpenImWorker(s.db,s.config,s.client)
    expect(await worker.tick()).toBe(true)
    expect(await worker.tick()).toBe(true)
    expect(imports()).toHaveLength(count)
    const self=s.identity(s.human('member_A').id),coordinator=s.identity(s.agent('member_A').id)
    s.friends.set(self,s.friends.get(self)!.filter(id=>id!==coordinator))
    expect((await s.request('imSession',{platformID:5})).value.data.status).toBe('available')
    expect(imports()).toHaveLength(count+1);expect(imports().at(-1)!.body.friendUserIDs).toEqual([coordinator])
    s.friends.get(self)!.push('unauthorized_remote_friend')
    expect((await s.request('imSync',{})).value.data.status).toBe('available')
    expect(s.friends.get(self)).not.toContain('unauthorized_remote_friend');expect(imports()).toHaveLength(count+1)
  })
  it('rechecks contact authority after an asynchronous friend-list read and fails closed on incomplete lists',async()=>{
    const s=await setup();await s.connect(s.human('member_B').id)
    const relationship=(await s.request('chatContact',null,{id:s.human('member_B').id})).value.data.relationship
    s.setOnFriendList(async()=>{s.setOnFriendList(null);expect((await s.request('revokeContact',{expectedVersion:relationship.version},{id:s.human('member_B').id})).status).toBe(200)})
    expect((await s.request('imSync',{})).status).toBe(403)
    expect(s.calls.filter(c=>c.path==='/friend/import_friend')).toEqual([])
    for(const result of [{friendsInfo:[],total:1001},{friendsInfo:[{friendUser:{}}],total:1},{friendsInfo:null,total:1},{friendsInfo:[]},{friendsInfo:[{friendUser:{userID:s.identity(s.human('member_B').id)}}]}]){
      s.setFriendListResult(result)
      expect((await s.request('imSession',{platformID:5})).value.data).toMatchObject({status:'unavailable',reason:'provisioning_failed',user:null})
    }
    expect(s.calls.filter(c=>c.path==='/friend/import_friend')).toEqual([])
    expect(s.calls.filter(c=>c.path==='/auth/get_user_token')).toEqual([])
  })
  it('creates and invites without AI, with authorized idempotent replay and direct joined membership',async()=>{
    const s=await setup(false),body={title:'真实讨论群',contactIds:[s.human('member_B').id],sharedContext:context,plan:null},key=randomUUID()
    const created=await s.request('imCreateGroup',body,{},0,key);expect(created.status,created.raw).toBe(200)
    let group=created.value.data as Conversation;expect(group.taskIds).toEqual([]);expect(s.db.prepare('SELECT count(*) n FROM tasks').get()!.n).toBe(0)
    expect((await s.request('imCreateGroup',body,{},0,key)).value.data.id).toBe(group.id)
    expect((await s.request('imCreateGroup',{...body,title:'changed'}, {},0,key)).status).toBe(409)
    // Selecting an Agent joins only that Agent; its owner stays outside the group.
    expect((await s.request('chatConversation',null,{id:group.id},2)).status).toBe(404)
    group=(await s.request('chatConversation',null,{id:group.id})).value.data
    expect(group.members.every(member=>member.status==='joined')).toBe(true)
    expect((await s.request('chatInvitations',null,{},1)).value.data).toEqual([])
    expect((await s.request('imConversations',null,{},2)).value.data.conversations).toEqual([])
    expect((await s.request('imInviteContact',{contactId:s.human('member_C').id,expectedConversationVersion:group.version+1},{id:group.id})).status).toBe(409)
    group=(await s.request('chatConversation',null,{id:group.id})).value.data
    const memberView=(await s.request('chatConversation',null,{id:group.id},1)).value.data as Conversation
    expect(memberView.allowedActions).toContain('invite')
    expect(memberView.allowedActions).not.toContain('manage')
    const inviteKey=randomUUID(),command={contactId:s.human('member_C').id,expectedConversationVersion:group.version}
    expect((await s.request('imInviteContact',command,{id:group.id},1,inviteKey)).status).toBe(200)
    expect((await s.request('imInviteContact',command,{id:group.id},1,inviteKey)).status).toBe(200)
    expect(s.db.prepare('SELECT count(*) n FROM chat_invitations WHERE conversation_id=?').get(group.id)!.n).toBe(0)
  })
  it('lets joined humans invite colleagues but rejects private agents, with member-scoped replay',async()=>{
    const s=await setup();let group=(await s.request('imCreateGroup',{title:'单群助理',contactIds:[s.human('member_B').id],sharedContext:context,plan:null})).value.data as Conversation
    expect((await s.request('imInviteContact',{contactId:s.agent('member_B').id,expectedConversationVersion:group.version},{id:group.id},1)).value.error.code).toBe('GROUP_AGENT_NOT_ALLOWED')
    const key=randomUUID(),command={contactId:s.human('member_C').id,expectedConversationVersion:group.version}
    const added=await s.request('imInviteContact',command,{id:group.id},1,key);expect(added.status,added.raw).toBe(200);group=added.value.data
    expect((await s.request('imInviteContact',command,{id:group.id},1,key)).value.data.version).toBe(group.version)
    const mapped=(await s.request('imSyncConversation',{}, {id:group.id},1)).value.data;expect(mapped.transportStatus).toBe('ready')
    expect(s.groups.get(mapped.groupID)!.some(m=>m.userID===s.identity(`group_assistant_${group.id}`,1))).toBe(true)
    const member=group.members.find(m=>m.contactId===s.human('member_B').id)!
    expect((await s.request('revokeChatMember',{expectedVersion:member.version,expectedConversationVersion:group.version,reason:'明确退群'},{id:group.id,contactId:member.contactId})).status).toBe(200)
    expect((await s.request('imInviteContact',command,{id:group.id},1,key)).status).toBe(404)
  })
  it('uses admin-only IM owner, reconciles joined recipients and rejects native role/registration bypasses',async()=>{
    const s=await setup();await s.request('imSession',{platformID:5});await s.request('imSession',{platformID:5},{},1)
    const created=await s.request('imCreateGroup',{title:'权限群',contactIds:[s.human('member_B').id],sharedContext:context,plan:null});expect(created.status,created.raw).toBe(200)
    let group=created.value.data as Conversation,mapped=(await s.request('imSyncConversation',{}, {id:group.id})).value.data
    expect(mapped.transportStatus).toBe('ready');expect(s.groups.get(mapped.groupID)!.map(m=>m.userID)).toEqual(expect.arrayContaining(['imAdmin',s.identity(s.human('member_A').id),s.identity(`group_assistant_${group.id}`)]))
    expect((await s.callback('callbackBeforeSendGroupMsgCommand',{groupID:mapped.groupID,sendID:'imAdmin',senderPlatformID:0,msgFrom:200,contentType:1501,content:'{}'})).value.nextCode).toBe(0)
    expect(s.groups.get(mapped.groupID)!.find(m=>m.userID===s.identity(s.human('member_A').id))!.roleLevel).toBe(20)
    const msg={groupID:mapped.groupID,sendID:s.identity(s.human('member_B').id),senderPlatformID:5,msgFrom:100,contentType:101,content:'{"content":"hello"}'}
    // Joined at creation: the first group message needs no invitation round.
    expect((await s.callback('callbackBeforeSendGroupMsgCommand',msg)).value.nextCode).toBe(0)
    // A real IM identity that is not a member of this group still cannot send into it.
    const outsider=await s.request('imCreateGroup',{title:'没有乙的群',contactIds:[s.human('member_C').id],sharedContext:context,plan:null});expect(outsider.status,outsider.raw).toBe(200)
    const outsiderMapping=(await s.request('imSyncConversation',{}, {id:outsider.value.data.id})).value.data
    expect(outsiderMapping.transportStatus).toBe('ready')
    expect((await s.callback('callbackBeforeSendGroupMsgCommand',{...msg,groupID:outsiderMapping.groupID})).value.nextCode).toBe(1)
    mapped=(await s.request('imSyncConversation',{}, {id:group.id})).value.data;expect(mapped.transportStatus).toBe('ready')
    expect((await s.callback('callbackBeforeSendGroupMsgCommand',msg)).value.nextCode).toBe(0)
    s.db.prepare("UPDATE auth_accounts SET disabled=1 WHERE member_id='member_B'").run()
    const ownMsg={...msg,sendID:s.identity(s.human('member_A').id)}
    expect((await s.callback('callbackBeforeSendGroupMsgCommand',ownMsg)).value.nextCode).toBe(1)
    expect((await s.request('imSyncConversation',{}, {id:group.id})).value.data.transportStatus).toBe('ready')
    expect(s.groups.get(mapped.groupID)!.some(m=>m.userID===msg.sendID)).toBe(false)
    expect((await s.callback('callbackBeforeSendGroupMsgCommand',ownMsg)).value.nextCode).toBe(0)
    s.db.prepare("UPDATE auth_accounts SET disabled=0 WHERE member_id='member_B'").run()
    expect((await s.callback('callbackBeforeSetGroupMemberInfoCommand',{groupID:mapped.groupID,userID:msg.sendID,roleLevel:60})).value.nextCode).toBe(1)
    expect((await s.callback('callbackBeforeUserRegisterCommand',{users:[{userID:'unmapped',nickname:'x'}]})).value.nextCode).toBe(1)
    expect((await s.callback('callbackBeforeUpdateUserInfoExCommand',{userID:msg.sendID,nickName:{value:'forged'}})).value.nextCode).toBe(1)
    expect((await s.callback('callbackBeforeSetGroupInfoExCommand',{groupID:mapped.groupID,needVerification:{value:0}})).value.nextCode).toBe(1)
    group=(await s.request('chatConversation',null,{id:group.id})).value.data
    const member=group.members.find(m=>m.contactId===s.human('member_B').id)!
    await s.request('revokeChatMember',{expectedConversationVersion:group.version,expectedVersion:member.version,reason:'测试撤权'},{id:group.id,contactId:member.contactId})
    await s.request('imSyncConversation',{}, {id:group.id});expect(s.groups.get(mapped.groupID)!.some(m=>m.userID===msg.sendID)).toBe(false)
    expect((await s.callback('callbackBeforeSendGroupMsgCommand',msg)).value.nextCode).toBe(1)
    await s.callback('callbackAfterDisMissGroupCommand',{groupID:mapped.groupID});expect(s.db.prepare('SELECT status FROM im_conversations WHERE conversation_id=?').get(group.id)!.status).toBe('pending')
  })
  it('mirrors controlled research messages as authorized pointers, never copies AI private answer, and handles unknown send outcomes',async()=>{
    const s=await setup()
    const settings=await s.request('updateLabAiSettings',{expectedVersion:0,enabled:true,model:'deepseek-flash',apiKey:'sk-synthetic-only'}, {id:'lab_synthetic'})
    expect(settings.status,settings.raw).toBe(200)
    const personal=(await s.request('personalConversation',{})).value.data.conversation
    await s.request('sendChatMessage',{text:'显式科研请求',intent:'ask_agent',agentContactId:s.agent('member_A').id,budget:{maxTokens:25000,maxSeconds:10},context:[]},{id:personal.id})
    await new ChatWorker(s.db,s.config,async()=>({text:JSON.stringify({answer:'PRIVATE SYNTHETIC ANSWER',waitingInput:false,group:null,actions:[]}),failure:null,inputTokens:4,outputTokens:6,elapsedMs:10})).tick()
    const worker=new OpenImWorker(s.db,s.config,s.client);expect(await worker.tick()).toBe(true);expect(await worker.tick()).toBe(true)
    expect(s.sent).toHaveLength(2);expect(JSON.stringify(s.sent)).not.toContain('PRIVATE SYNTHETIC ANSWER')
    const reply=s.sent.find(msg=>msg.sendID===s.identity(s.agent('member_A').id))!;expect(reply.recvID).toBe(s.identity(s.human('member_A').id))
    expect(await worker.tick()).toBe(false)
    expect((await s.callback('callbackBeforeSendSingleMsgCommand',{...reply,operationID:randomUUID()})).value.nextCode).toBe(1)
    await s.request('sendChatMessage',{text:'普通科研入口消息',intent:'chat',agentContactId:null,budget:null,context:[]},{id:personal.id})
    s.setFailSend(true);await worker.tick();const last=s.sent.at(-1)!;expect(s.db.prepare("SELECT count(*) n FROM im_message_outbox WHERE status='uncertain'").get()!.n).toBe(1)
    const sends=s.sent.length;expect(await worker.tick()).toBe(false);expect(s.sent).toHaveLength(sends)
    await s.callback('callbackAfterSendSingleMsgCommand',last);expect(s.db.prepare("SELECT count(*) n FROM im_message_outbox WHERE status='uncertain'").get()!.n).toBe(0)
  })
  it('delivers one assistant sticker through the authorized pointer with readable legacy history',async()=>{
    const s=await setup()
    const model=await s.request('createPersonalModel',{name:'合成模型',provider:'deepseek',model:'deepseek-flash',apiKey:'synthetic-sticker-model',enabled:true})
    expect(model.status,model.raw).toBe(201)
    const personal=(await s.request('personalConversation',{})).value.data.conversation
    const stickerInput=`${personalStickerInputPrefix}挥手打招呼`
    const request=await s.request('agentChatMessage',{text:stickerInput},{id:personal.id})
    expect(request.status,request.raw).toBe(201)
    const turnId=request.value.data.turn.id
    await new ChatWorker(s.db,s.config,async input=>{
      expect(input.system).toContain('wave=打招呼')
      expect(input.system).toContain(personalStickerInputPrefix.trim())
      expect(input.prompt).toContain(stickerInput)
      return {text:JSON.stringify({kind:'dafeiyu_sticker',id:'wave',answer:null}),failure:null,inputTokens:100,outputTokens:40,elapsedMs:10}
    }).tick()
    const progress=(await s.request('chatTurnProgress',null,{id:turnId})).value.data
    expect(progress).toMatchObject({phase:'final',text:'[大肥鱼表情] 打招呼'})
    const history=(await s.request('chatMessages',null,{id:personal.id})).value.data
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({origin:'human',text:stickerInput})
    expect(history[1]).toMatchObject({id:progress.finalMessageId,origin:'model',text:progress.text})
    expect(history[1]).not.toHaveProperty('assistantSticker')
    expect((await s.request('chatMessages',null,{id:personal.id},1)).status).toBe(404)

    const worker=new OpenImWorker(s.db,s.config,s.client)
    expect(await worker.tick()).toBe(true)
    expect(await worker.tick()).toBe(true)
    expect(await worker.tick()).toBe(false)
    expect(s.sent).toHaveLength(2)
    const [original,reply]=s.sent.map(message=>JSON.parse(message.content))
    expect(original.extension).toBe('')
    expect(OpenImResearchPointer.parse(JSON.parse(reply.data))).toMatchObject({conversationId:personal.id,messageId:history[1].id,sequence:history[1].sequence})
    expect(AssistantStickerExtension.parse(JSON.parse(reply.extension))).toEqual({type:'dafeiyu_sticker',version:1,id:'wave'})
    expect(s.db.prepare('SELECT status FROM im_message_outbox WHERE message_id=?').get(progress.finalMessageId)?.status).toBe('sent')
  })
  it('reauthorizes after asynchronous token calls and prevents transaction-held callback deadlocks',async()=>{
    const s=await setup();s.setOnToken(async()=>{expect((await s.request('logout',{})).status).toBe(200)})
    const response=await s.request('imSession',{platformID:5});expect(response.status,response.raw).toBe(401)
    expect(s.db.prepare("SELECT count(*) n FROM im_token_leases WHERE state='ready'").get()!.n).toBe(0)
    expect(s.calls.some(c=>c.path==='/user/user_register')).toBe(true) // provider awaited real callbacks on a second connection
  })
  it('backs off unavailable remote transport while retaining unsent authority pointers',async()=>{
    const s=await setup(),group=(await s.request('personalConversation',{})).value.data.conversation
    await s.request('sendChatMessage',{text:'待发送消息'},{id:group.id});s.setFailManagement(true)
    const worker=new OpenImWorker(s.db,s.config,s.client);expect(await worker.tick()).toBe(false)
    const calls=s.calls.length;expect(await worker.tick()).toBe(false);expect(s.calls).toHaveLength(calls)
    expect(s.db.prepare("SELECT status FROM im_message_outbox").get()!.status).toBe('pending')
  })
  it('does not submit when operation persistence fails and releases only its unsubmitted claim',async()=>{
    const s=await setup()
    const group=(await s.request('personalConversation',{})).value.data.conversation
    await s.request('sendChatMessage',{text:'合成未提交消息'},{id:group.id})
    s.db.exec("CREATE TEMP TRIGGER fail_im_operation BEFORE UPDATE OF operation_id ON im_message_outbox WHEN NEW.operation_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'synthetic persistence fault'); END")
    expect(await new OpenImWorker(s.db,s.config,s.client).tick()).toBe(false)
    expect(s.sent).toHaveLength(0)
    expect(s.db.prepare('SELECT status,attempts,operation_id,lease_until FROM im_message_outbox').get()).toMatchObject({status:'pending',attempts:1,operation_id:null,lease_until:null})
    s.db.exec('DROP TRIGGER fail_im_operation')
    expect(await new OpenImWorker(s.db,s.config,s.client).tick()).toBe(true)
    expect(s.sent).toHaveLength(1)
    expect(s.db.prepare('SELECT status,attempts FROM im_message_outbox').get()).toMatchObject({status:'sent',attempts:2})
  })
  it('propagates a transient snapshot database busy without permanently denying the pending message',async()=>{
    const s=await setup()
    const group=(await s.request('personalConversation',{})).value.data.conversation
    await s.request('sendChatMessage',{text:'合成快照忙'},{id:group.id})
    const worker=new OpenImWorker(s.db,s.config,s.client),busy=Object.assign(new Error('synthetic SQLite busy'),{code:'ERR_SQLITE_ERROR',errcode:5})
    vi.spyOn(worker,'snapshot').mockImplementationOnce(()=>{throw busy})
    await expect(worker.tick()).rejects.toBe(busy)
    expect(s.db.prepare('SELECT status,attempts,operation_id FROM im_message_outbox').get()).toMatchObject({status:'pending',attempts:0,operation_id:null})
    expect(s.sent).toHaveLength(0)
  })
  it('preserves the positive callback server ID when the send response omits it',async()=>{
    const s=await setup()
    const group=(await s.request('personalConversation',{})).value.data.conversation
    await s.request('sendChatMessage',{text:'合成空响应编号'},{id:group.id})
    const request=s.client.request.bind(s.client)
    vi.spyOn(s.client,'request').mockImplementation(async(path,body,operationID)=>{const response=await request(path,body,operationID);return path==='/msg/send_msg'?{}:response})
    expect(await new OpenImWorker(s.db,s.config,s.client).tick()).toBe(true)
    expect(s.db.prepare('SELECT status,server_message_id FROM im_message_outbox').get()).toMatchObject({status:'sent',server_message_id:s.sent[0]!.serverMsgID})
  })
  it('recovers an expired no-operation claim after a real SQLite write lock prevented cleanup',async()=>{
    const s=await setup()
    const group=(await s.request('personalConversation',{})).value.data.conversation
    await s.request('sendChatMessage',{text:'合成领取后写锁'},{id:group.id})
    const lock=openDatabase(s.config.databasePath);cleanup.push(()=>lock.close());s.db.exec('PRAGMA busy_timeout=1')
    const worker=new OpenImWorker(s.db,s.config,s.client),sync=worker.bridge.syncConversation.bind(worker.bridge)
    vi.spyOn(worker.bridge,'syncConversation').mockImplementation(async(...args)=>{const mapped=await sync(...args);lock.exec('BEGIN IMMEDIATE');return mapped})
    try{await expect(worker.tick()).rejects.toThrow(/locked|busy/i)}finally{lock.exec('ROLLBACK')}
    expect(s.sent).toHaveLength(0)
    expect(s.db.prepare('SELECT status,attempts,operation_id FROM im_message_outbox').get()).toMatchObject({status:'sending',attempts:1,operation_id:null})
    s.db.prepare('UPDATE im_message_outbox SET lease_until=?').run(Date.now()-1)
    expect(await new OpenImWorker(s.db,s.config,s.client).tick()).toBe(true)
    expect(s.sent).toHaveLength(1)
    expect(s.db.prepare('SELECT status,attempts FROM im_message_outbox').get()).toMatchObject({status:'sent',attempts:2})
  })
  it('fences a suspended worker before HTTP after another worker reclaims its expired unsubmitted lease',async()=>{
    const s=await setup()
    const group=(await s.request('personalConversation',{})).value.data.conversation
    await s.request('sendChatMessage',{text:'合成并发领取'},{id:group.id})
    const second=openDatabase(s.config.databasePath);cleanup.push(()=>second.close())
    const slow=new OpenImWorker(s.db,s.config,s.client),sync=slow.bridge.syncConversation.bind(slow.bridge)
    let entered!:()=>void,resume!:()=>void
    const paused=new Promise<void>(resolve=>{entered=resolve}),released=new Promise<void>(resolve=>{resume=resolve})
    vi.spyOn(slow.bridge,'syncConversation').mockImplementation(async(...args)=>{const mapped=await sync(...args);entered();await released;return mapped})
    const first=slow.tick();await paused
    s.db.prepare('UPDATE im_message_outbox SET lease_until=?').run(Date.now()-1)
    try{expect(await new OpenImWorker(second,s.config,s.client).tick()).toBe(true)}finally{resume()}
    expect(await first).toBe(false)
    expect(s.sent).toHaveLength(1)
    expect(s.db.prepare('SELECT status,attempts,operation_id,server_message_id FROM im_message_outbox').get()).toMatchObject({status:'sent',attempts:2,operation_id:s.sent[0]!.operationID,server_message_id:s.sent[0]!.serverMsgID})
  })
  it('keeps an expired submitted request uncertain and never replays an unknown HTTP outcome',async()=>{
    const s=await setup();s.setAfterSend(false)
    const group=(await s.request('personalConversation',{})).value.data.conversation
    await s.request('sendChatMessage',{text:'合成响应丢失'},{id:group.id})
    const request=s.client.request.bind(s.client)
    let entered!:()=>void,resume!:()=>void
    const submitted=new Promise<void>(resolve=>{entered=resolve}),released=new Promise<void>(resolve=>{resume=resolve})
    vi.spyOn(s.client,'request').mockImplementation(async(path,body,operationID)=>{const response=await request(path,body,operationID);if(path==='/msg/send_msg'){entered();await released;throw new ImUnavailable('backend_unreachable')}return response})
    const first=new OpenImWorker(s.db,s.config,s.client).tick();await submitted
    expect(s.db.prepare('SELECT status,operation_id FROM im_message_outbox').get()).toMatchObject({status:'sending',operation_id:s.sent[0]!.operationID})
    s.db.prepare('UPDATE im_message_outbox SET lease_until=?').run(Date.now()-1)
    try{expect(await new OpenImWorker(s.db,s.config,s.client).tick()).toBe(false)}finally{resume()}
    await first
    expect(s.db.prepare('SELECT status,operation_id,attempts FROM im_message_outbox').get()).toMatchObject({status:'uncertain',operation_id:s.sent[0]!.operationID,attempts:1})
    expect(await new OpenImWorker(s.db,s.config,s.client).tick()).toBe(false)
    expect(s.sent).toHaveLength(1)
    await s.callback('callbackAfterSendSingleMsgCommand',s.sent[0]!)
    expect(s.db.prepare('SELECT status FROM im_message_outbox').get()!.status).toBe('sent')
  })
  it('never reactivates restored or historical uncertain rows with missing submission IDs',async()=>{
    const s=await setup()
    const group=(await s.request('personalConversation',{})).value.data.conversation
    for(const status of ['pending','sending','uncertain']){
      await s.request('sendChatMessage',{text:`合成恢复隔离${status}`},{id:group.id})
      s.db.prepare('UPDATE im_message_outbox SET status=?,lease_until=?,attempts=1 WHERE message_id=(SELECT message_id FROM im_message_outbox ORDER BY rowid DESC LIMIT 1)').run(status,Date.now()-1)
    }
    await s.app.close()
    const saved=join(s.dir,'saved'),restored=join(s.dir,'restored')
    backup(s.config,saved,'synthetic-operator','a'.repeat(40),'synthetic-revision');restore(saved,restored,'synthetic-operator')
    const config={...s.config,databasePath:join(restored,'platform.sqlite'),blobRoot:join(restored,'blobs')},db=openDatabase(config.databasePath);cleanup.push(()=>db.close())
    const worker=new OpenImWorker(db,config,s.client)
    for(let index=0;index<3;index++)await worker.tick()
    expect(db.prepare('SELECT status,operation_id,attempts FROM im_message_outbox ORDER BY rowid').all()).toEqual(Array.from({length:3},()=>expect.objectContaining({status:'uncertain',operation_id:null,attempts:1})))
    expect(s.sent).toHaveLength(0)
  })
  it('requires actual trusted policy callback proof before declaring a cached mapping ready',async()=>{
    const s=await setup();expect((await s.request('imSession',{platformID:5})).value.data.status).toBe('available')
    s.setSkipProfileHook(true)
    const response=await s.request('imSession',{platformID:5});expect(response.value.data).toMatchObject({status:'unavailable',reason:'policy_not_configured',user:null})
    expect(s.calls.filter(c=>c.path==='/auth/get_user_token')).toHaveLength(1)
  })
  it('accepts fixed Go nil profile fields without permitting metadata injection or forged operators',async()=>{
    const s=await setup(),session=(await s.request('imSession',{platformID:5})).value.data
    expect(session.status).toBe('available') // Real Go-shaped ex:null also passes the policy proof.
    const userID=session.user.userID,name=s.human('member_A').displayName,operator={userID,platform:'Web'}
    for(const command of ['callbackBeforeUpdateUserInfoCommand','callbackBeforeUpdateUserInfoExCommand']){
      const nil={userID,nickName:null,faceURL:null,ex:null}
      expect((await s.callback(command,nil,undefined,operator)).value).toMatchObject({nextCode:0,errCode:0})
      const supplied={userID,nickName:command.endsWith('ExCommand')?{value:name}:name,faceURL:'',ex:''}
      expect((await s.callback(command,supplied,undefined,operator)).value.nextCode).toBe(0)
      for(const change of [{ex:'injected-private-metadata'},{ex:{value:'injected-private-metadata'}},{faceURL:'https://unapproved.example/avatar'},{nickName:'forged-name'},{nickName:{value:'forged-name'}},{ex:{value:null}},{userID:'unmapped-user'}]){
        expect((await s.callback(command,{...nil,...change},undefined,operator)).value).toMatchObject({nextCode:1,errCode:1002})
      }
      expect((await s.callback(command,nil,undefined,{userID:s.identity(s.human('member_B').id),platform:'Web'})).value.nextCode).toBe(1)
      expect((await s.callback(command,nil,undefined,{userID,platform:'Linux'})).value.nextCode).toBe(1)
      expect((await s.callback(command,nil,undefined,{userID:'',platform:''})).value.nextCode).toBe(1)
    }
  })
  it('keeps stable IM identities and mapping projections isolated by laboratory',async()=>{
    const s=await setup();s.db.prepare("INSERT INTO labs VALUES ('other_lab','Other synthetic lab')").run();s.db.prepare("UPDATE members SET lab_id='other_lab' WHERE id='member_C'").run()
    const a=(await s.request('imSession',{platformID:5})).value.data,c=(await s.request('imSession',{platformID:5},{},2)).value.data
    expect(c.status).toBe('available');expect((await s.request('imConversations',null,{},0)).value.data.conversations.some((m:any)=>m.researchConversationId===c.coordinator.researchConversationId)).toBe(false)
    expect((await s.request('imSyncConversation',{}, {id:c.coordinator.researchConversationId})).status).toBe(404)
    expect((await s.callback('callbackBeforeSendSingleMsgCommand',{sendID:a.user.userID,recvID:c.user.userID,senderPlatformID:5,msgFrom:100,contentType:101,content:'{}'})).value.nextCode).toBe(1)
  })
  it('upgrades 014 to 015 repeatedly without broadcasting existing history',()=>{
    const dir=mkdtempSync(join(tmpdir(),'rap-im-upgrade-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}));const db=openDatabase(join(dir,'old.sqlite'),true);cleanup.push(()=>db.close())
    db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL) STRICT')
    const names=['001-foundation.sql','002-collaboration.sql','003-invitation-decisions.sql','004-discovery.sql','005-coordination.sql','006-execution.sql','007-authorized-reuse.sql','008-pilot-operations.sql','009-invite-registration.sql','010-lab-invite-management.sql','011-lab-ai-settings.sql','012-research-chat.sql','013-chat-viewer-state.sql','014-agent-contacts.sql']
    for(const [index,name] of names.entries()){const sql=readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');db.exec(sql);db.prepare('INSERT INTO schema_migrations VALUES (?,?,?)').run(index+1,createHash('sha256').update(sql).digest('hex'),'2026-01-01T00:00:00Z')}
    seed(db,'test');db.prepare("INSERT INTO chat_conversations VALUES ('old','lab_synthetic','member_A','personal','old_scope','{}')").run();db.prepare("INSERT INTO chat_messages VALUES ('old_message','old',1,'{}')").run()
    migrate(db);migrate(db);checkDatabase(db);expect(db.prepare('SELECT count(*) n FROM schema_migrations').get()!.n).toBe(45)
    expect(db.prepare('SELECT count(*) n FROM chat_messages').get()!.n).toBe(1);expect(db.prepare('SELECT count(*) n FROM im_message_outbox').get()!.n).toBe(0)
  })
})
