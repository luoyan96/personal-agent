import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it, expect } from 'vitest'
import { routes } from '@research-agent-platform/contracts'
import type { Contact, Conversation, RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { openDatabase, migrate, seed, transaction, checkDatabase } from '../src/database.js'
import { provisionTestAccounts, authenticate } from '../src/auth.js'
import { createServer } from '../src/server.js'
import { OpenImClient, ImUnavailable } from '../src/openim-client.js'
import type { ImCall } from '../src/openim-client.js'
import { OpenImBridge } from '../src/openim-bridge.js'
import { OpenImWorker } from '../src/openim-worker.js'
import { ChatWorker } from '../src/chat-worker.js'

const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
const context={selectedText:null,artifactRefs:[]}

async function setup(configured=true){
  const dir=mkdtempSync(join(tmpdir(),'rap-im-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
  const secret=join(dir,'synthetic-im.secret'),key=join(dir,'synthetic-callback.key'),credential=join(dir,'synthetic-model.key'),callbackKey=randomBytes(32).toString('hex')
  writeFileSync(secret,'synthetic-management-secret-not-real');writeFileSync(key,callbackKey);writeFileSync(credential,randomBytes(32).toString('hex'))
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
  for(const account of accounts){const login=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:config.origin},payload:{username:account.username,password:account.password}});expect(login.statusCode).toBe(200);const cookie=String(login.headers['set-cookie']).split(';')[0]!,session=await app.inject({url:'/api/v1/auth/session',headers:{cookie}});clients.push({cookie,csrf:session.json().data.csrfToken,token:cookie.slice('rap_session='.length)})}
  async function request(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,keyValue=randomUUID()){
    const route=routes[name],response=await app.inject({method:route.method,url:route.path.replace(/\{(\w+)\}/g,(_,k:string)=>params[k]!),headers:{origin:config.origin,cookie:clients[actor]!.cookie,'x-csrf-token':clients[actor]!.csrf,'idempotency-key':keyValue},...(route.method==='GET'?{}:{payload:body as B})})
    return {status:response.statusCode,value:response.json(),raw:response.body}
  }
  const contacts=(await request('chatContacts')).value.data as Contact[]
  const human=(member:string)=>contacts.find(c=>c.identity.kind==='human'&&c.identity.memberId===member)!,agent=(member:string)=>contacts.find(c=>c.identity.kind==='personal_agent'&&c.identity.ownerMemberId===member)!,publicAgent=contacts.find(c=>c.identity.kind==='public_agent')!
  const bridge=new OpenImBridge(db,config,client),actor=(index=0)=>authenticate(db,clients[index]!.token)
  const identity=(id:string,index=0)=>transaction(db,()=>bridge.identity(bridge.chat(actor(index)),id).userID)
  async function connect(id:string,index=0){const relation=(await request('requestContact',{}, {id},index)).value.data.relationship;if(relation.status==='pending_outbound'){const contact=contacts.find(c=>c.id===id)!,owner=contact.identity.kind==='human'?contact.identity.memberId:contact.identity.ownerMemberId;expect((await request('decideContactRequest',{expectedVersion:relation.version,decision:'accept'},{id:relation.requestId},['member_A','member_B','member_C'].indexOf(owner))).status).toBe(200)}}
  return {dir,db,config,app,clients,accounts,request,callback,bridge,client,calls,groups,friends,sent,contacts,human,agent,publicAgent,actor,identity,connect,setFailSend:(v:boolean)=>{failSend=v},setFailManagement:(v:boolean)=>{failManagement=v},setSkipProfileHook:(v:boolean)=>{skipProfileHook=v},setAfterSend:(v:boolean)=>{afterSend=v},setOnToken:(v:(()=>Promise<void>)|null)=>{onToken=v},setOnFriendList:(v:(()=>Promise<void>)|null)=>{onFriendList=v},setFriendListResult:(v:Record<string,unknown>|null)=>{friendListResult=v}}
}

describe('OpenIM bridge with explicit synthetic management adapter, not live server verification',{timeout:20000},()=>{
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
    expect(s.db.prepare('SELECT count(*) n FROM chat_messages').get()!.n).toBe(1);expect(s.db.prepare('SELECT count(*) n FROM chat_turns').get()!.n).toBe(0)
    expect((await s.callback('callbackAfterSendSingleMsgCommand',{...message,content:'{"content":"different"}'})).status).toBe(409)
    await s.callback('callbackAfterSendSingleMsgCommand',{...message,clientMsgID:'ordinary_at_1',contentType:106,content:'{"text":"@助理 普通提及","atUserList":[]}'});expect(s.db.prepare('SELECT count(*) n FROM chat_turns').get()!.n).toBe(0)
    for(const type of [102,103,105])await s.callback('callbackAfterSendSingleMsgCommand',{...message,clientMsgID:`media_${type}`,contentType:type,content:'{}'})
    expect(s.db.prepare('SELECT count(*) n FROM artifacts').get()!.n).toBe(0);expect(s.db.prepare('SELECT count(*) n FROM chat_messages').get()!.n).toBe(2)
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
    expect(await new OpenImWorker(s.db,s.config,s.client).tick()).toBe(true)
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
  it('creates and invites without AI, with authorized idempotent replay and separate joined authority',async()=>{
    const s=await setup(false),body={title:'真实讨论群',contactIds:[s.human('member_B').id,s.agent('member_C').id],sharedContext:context,plan:null},key=randomUUID()
    const created=await s.request('imCreateGroup',body,{},0,key);expect(created.status,created.raw).toBe(200)
    let group=created.value.data as Conversation;expect(group.taskIds).toEqual([]);expect(s.db.prepare('SELECT count(*) n FROM tasks').get()!.n).toBe(0)
    expect((await s.request('imCreateGroup',body,{},0,key)).value.data.id).toBe(group.id)
    expect((await s.request('imCreateGroup',{...body,title:'changed'}, {},0,key)).status).toBe(409)
    expect((await s.request('chatConversation',null,{id:group.id},1)).status).toBe(404)
    const invitation=(await s.request('chatInvitations',null,{},1)).value.data[0]
    expect((await s.request('decideChatInvitation',{expectedVersion:invitation.version,decision:'accept'},{id:invitation.id},1)).status).toBe(200)
    group=(await s.request('chatConversation',null,{id:group.id})).value.data
    const aiInvite=(await s.request('chatInvitations',null,{},2)).value.data[0];await s.request('decideChatInvitation',{expectedVersion:aiInvite.version,decision:'accept'},{id:aiInvite.id},2)
    expect((await s.request('imConversations',null,{},2)).value.data.conversations).toEqual([])
    expect((await s.request('imInviteContact',{contactId:s.human('member_C').id,expectedConversationVersion:group.version},{id:group.id})).status).toBe(409)
    group=(await s.request('chatConversation',null,{id:group.id})).value.data
    expect((await s.request('imInviteContact',{contactId:s.human('member_C').id,expectedConversationVersion:group.version},{id:group.id},1)).status).toBe(403)
    const inviteKey=randomUUID(),command={contactId:s.human('member_C').id,expectedConversationVersion:group.version}
    expect((await s.request('imInviteContact',command,{id:group.id},0,inviteKey)).status).toBe(200)
    expect((await s.request('imInviteContact',command,{id:group.id},0,inviteKey)).status).toBe(200)
    expect(s.db.prepare('SELECT count(*) n FROM chat_invitations WHERE conversation_id=?').get(group.id)!.n).toBe(3)
  })
  it('uses admin-only IM owner, reconciles joined recipients and rejects native role/registration bypasses',async()=>{
    const s=await setup();await s.request('imSession',{platformID:5});await s.request('imSession',{platformID:5},{},1)
    const created=await s.request('imCreateGroup',{title:'权限群',contactIds:[s.human('member_B').id,s.publicAgent.id],sharedContext:context,plan:null});expect(created.status,created.raw).toBe(200)
    let group=created.value.data as Conversation,mapped=(await s.request('imSyncConversation',{}, {id:group.id})).value.data
    expect(mapped.transportStatus).toBe('ready');expect(s.groups.get(mapped.groupID)!.map(m=>m.userID)).toEqual(expect.arrayContaining(['imAdmin',s.identity(s.human('member_A').id),s.identity(s.publicAgent.id)]))
    expect((await s.callback('callbackBeforeSendGroupMsgCommand',{groupID:mapped.groupID,sendID:'imAdmin',senderPlatformID:0,msgFrom:200,contentType:1501,content:'{}'})).value.nextCode).toBe(0)
    expect(s.groups.get(mapped.groupID)!.find(m=>m.userID===s.identity(s.human('member_A').id))!.roleLevel).toBe(20)
    const msg={groupID:mapped.groupID,sendID:s.identity(s.human('member_B').id),senderPlatformID:5,msgFrom:100,contentType:101,content:'{"content":"hello"}'}
    expect((await s.callback('callbackBeforeSendGroupMsgCommand',msg)).value.nextCode).toBe(1)
    const invitation=(await s.request('chatInvitations',null,{},1)).value.data[0];await s.request('decideChatInvitation',{expectedVersion:invitation.version,decision:'accept'},{id:invitation.id},1)
    expect((await s.callback('callbackBeforeSendGroupMsgCommand',{...msg,sendID:s.identity(s.human('member_A').id)})).value.nextCode).toBe(1)
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
    const s=await setup();await s.request('imSession',{platformID:5})
    await s.request('updateLabAiSettings',{expectedVersion:0,enabled:true,model:'deepseek-flash',apiKey:'sk-synthetic-only'}, {id:'lab_synthetic'})
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
    migrate(db);migrate(db);checkDatabase(db);expect(db.prepare('SELECT count(*) n FROM schema_migrations').get()!.n).toBe(15)
    expect(db.prepare('SELECT count(*) n FROM chat_messages').get()!.n).toBe(1);expect(db.prepare('SELECT count(*) n FROM im_message_outbox').get()!.n).toBe(0)
  })
})
