import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { routes } from '@research-agent-platform/contracts'
import type { RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { openDatabase, migrate, checkDatabase, transaction } from '../src/database.js'
import { hash, authenticate, passwordHash } from '../src/auth.js'
import { createServer } from '../src/server.js'
import { ChatWorker } from '../src/chat-worker.js'
import { personalModelKey, personalModelRuntime } from '../src/personal-models.js'
import { OpenImBridge } from '../src/openim-bridge.js'
import { OpenImCallbacks } from '../src/openim-callback.js'
import { backup, restore } from '../src/recovery.js'

const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
const secret='synthetic-owned-key-not-a-real-vendor-credential'
const modelInput=(provider='deepseek',model='deepseek-flash',apiKey:string|null=secret)=>({name:'本人合成模型',provider,model,enabled:true,...(apiKey?{apiKey}:{})})
async function setup(){
 const dir=mkdtempSync(join(tmpdir(),'rap-personal-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
 const master=join(dir,'master.key'),callback=join(dir,'callback.key'),imSecret=join(dir,'im.secret'),callbackKey=randomBytes(32).toString('hex')
 writeFileSync(master,randomBytes(32).toString('hex'),{mode:0o600});writeFileSync(callback,callbackKey,{mode:0o600});writeFileSync(imSecret,'synthetic-im-secret',{mode:0o600})
 const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'db.sqlite'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'http://127.0.0.1:4317',B3_AI_ENABLED:'1',LAB_CREDENTIAL_KEY_FILE:master,OPENIM_API_URL:'http://127.0.0.1:15002',OPENIM_PUBLIC_API_URL:'http://127.0.0.1:15002',OPENIM_PUBLIC_WS_URL:'ws://127.0.0.1:15001',OPENIM_SECRET_FILE:imSecret,OPENIM_CALLBACK_KEY_FILE:callback,OPENIM_POLICY_ENFORCED:'1'})
 mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);cleanup.push(()=>db.close());migrate(db)
 db.prepare('INSERT INTO labs VALUES (?,?)').run('lab_ifrc_synthetic','合成已有IFRC')
 const invite='synthetic-ifrc-invite-for-local-test-only'
 db.prepare('INSERT INTO registration_invites(id,lab_id,code_hash,expires_at,max_uses,created_at,bootstrap_manager) VALUES (?,?,?,?,1,?,1)').run('invite_synthetic','lab_ifrc_synthetic',hash(invite),new Date(Date.now()+3600000).toISOString(),new Date().toISOString())
 let app=createServer(config),url=await app.listen({host:'127.0.0.1',port:0});cleanup.push(()=>app.close())
 const raw=async(path:string,body:unknown=null,client?:{cookie:string;csrf:string},method='GET',key=randomUUID(),extra:Record<string,string>={})=>{
  const response=await fetch(url+path,{method,headers:{origin:config.origin,...(client?{cookie:client.cookie,'x-csrf-token':client.csrf}:{}),'content-type':'application/json','idempotency-key':key,...extra},...(method==='GET'?{}:{body:JSON.stringify(body)})})
  const text=await response.text();return {status:response.status,value:JSON.parse(text),text,cookie:response.headers.get('set-cookie')?.split(';')[0]??''}
 }
 const clients:{cookie:string;csrf:string;id:string;labId:string;username:string}[]=[]
 for(const [i,name] of ['甲','乙','丙'].entries()){
  const username=`synthetic_person_${i}`,body={username,displayName:`合成用户${name}`,password:'12345678',...(i===0?{inviteCode:invite}:{})}
  expect((await raw(routes.register.path,body,undefined,'POST')).status).toBe(201)
  const login=await raw(routes.login.path,{username,password:'12345678'},undefined,'POST');expect(login.status).toBe(200)
  const session=await raw(routes.session.path,null,{cookie:login.cookie,csrf:''});clients.push({cookie:login.cookie,csrf:session.value.data.csrfToken,id:login.value.data.id,labId:login.value.data.labId,username})
 }
 const call=async(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,query='',key=randomUUID())=>{const route=routes[name];return raw(route.path.replace(/\{(\w+)\}/g,(_,k:string)=>params[k]!)+query,body,clients[actor],route.method,key)}
 const find=async(viewer:number,owner:number)=>{const result=await call('chatContacts',null,{},viewer,`?scope=global&search=${clients[owner]!.username}`);expect(result.status,result.text).toBe(200);return result.value.data as any[]}
 const own=async(owner=0)=>{const data=(await call('personalConversation',{}, {},owner)).value.data;return {conversation:data.conversation,agent:data.agent}}
 const accept=async(contactId:string,requester=1,decider=0)=>{const r=await call('requestContact',{}, {id:contactId},requester);expect(r.status,r.text).toBe(200);const relation=r.value.data.relationship;expect((await call('decideContactRequest',{expectedVersion:relation.version,decision:'accept'},{id:relation.requestId},decider)).status).toBe(200);return relation.requestId as string}
 return {dir,db,config,app,raw,call,clients,find,own,accept,callbackKey,actor:(i=0)=>authenticate(db,clients[i]!.cookie.slice('rap_session='.length)),restart:async()=>{await app.close();app=createServer(config);url=await app.listen({host:'127.0.0.1',port:0})}}
}

describe('public accounts and owned models over real local HTTP, synthetic credentials/model/IM leases only',{timeout:20000},()=>{
 it('registers without invitation into isolated personal spaces, preserving the old laboratory and public KDF/idempotency/Origin boundary',async()=>{
  const s=await setup()
  expect(s.clients[0]!.labId).toBe('lab_ifrc_synthetic');expect(s.clients[1]!.labId).not.toBe(s.clients[2]!.labId)
  expect((await s.call('session',null,{},1)).value.data).toMatchObject({spaceKind:'personal',isLabManager:false})
  expect((await s.call('session')).value.data).toMatchObject({spaceKind:'laboratory',isLabManager:true})
  expect((await s.call('members',null,{id:'lab_ifrc_synthetic'},1)).status).toBe(404)
  expect((await s.call('labAiSettings',null,{id:'lab_ifrc_synthetic'},1)).status).toBe(404)
  expect((await s.call('labAiSettings',null,{id:s.clients[1]!.labId},1)).status).toBe(403)
  const key=randomUUID(),body={username:' \tpublic_normalized ',displayName:'合成公开注册者',password:'12345678'}
  expect((await s.raw(routes.register.path,body,undefined,'POST',key)).status).toBe(201)
  expect((await s.raw(routes.register.path,{...body,username:'public_normalized'},undefined,'POST',key)).status).toBe(201)
  expect(s.db.prepare('SELECT count(*) n FROM auth_accounts WHERE username=?').get('public_normalized')!.n).toBe(1)
  expect(s.db.prepare('SELECT used_count FROM registration_invites').get()!.used_count).toBe(1)
  expect((await s.raw(routes.register.path,{...body,username:'bad_scope',labId:'lab_ifrc_synthetic'},undefined,'POST')).status).toBe(400)
  expect((await s.raw(routes.register.path,{...body,username:'origin_rejected'},undefined,'POST',randomUUID(),{origin:'http://foreign.test'})).status).toBe(403)
 })

 it('encrypts separate owned keys, supports real metadata CRUD/default concurrency and never falls back after explicit personal selection',async()=>{
  const s=await setup(),key=randomUUID(),created=await s.call('createPersonalModel',modelInput(),{},1,'',key)
  expect(created.status,created.text).toBe(201);const first=created.value.data;expect(first).toMatchObject({isDefault:true,hasApiKey:true,version:1,baseUrl:'https://api.deepseek.com/anthropic'})
  expect((await s.call('createPersonalModel',modelInput(),{},1,'',key)).value.data.id).toBe(first.id)
  expect((await s.call('updatePersonalModel',{...modelInput(),expectedVersion:1},{id:first.id},2)).status).toBe(404)
  const stored=s.db.prepare('SELECT encrypted_api_key FROM personal_model_configurations WHERE id=?').get(first.id)!.encrypted_api_key
  expect(String(stored)).not.toContain(secret);expect(created.text).not.toContain(secret)
  const qwen=(await s.call('createPersonalModel',modelInput('qwen','qwen-plus','synthetic-qwen-key'),{},1)).value.data
  const doubao=(await s.call('createPersonalModel',modelInput('doubao','ep-synthetic','synthetic-doubao-key'),{},1)).value.data
  expect(qwen).toMatchObject({provider:'qwen',model:'qwen-plus',isDefault:false});expect(doubao).toMatchObject({provider:'doubao',model:'ep-synthetic',isDefault:false})
  expect((await s.call('createPersonalModel',modelInput('deepseek','invented-model'),{},1)).status).toBe(400)
  expect((await s.call('createPersonalModel',{...modelInput('qwen','qwen-plus'),baseUrl:'http://private-host'}, {},1)).status).toBe(400)
  const settings=(await s.call('personalModels',null,{},1)).value.data
  expect((await s.call('updatePersonalModel',{...modelInput('doubao','ep-synthetic',null),expectedVersion:1},{id:qwen.id},1)).status).toBe(400)
  expect((await s.call('defaultPersonalModel',{configurationId:qwen.id,expectedVersion:settings.version-1},{},1)).status).toBe(409)
  expect((await s.call('defaultPersonalModel',{configurationId:qwen.id,expectedVersion:settings.version},{},1)).status).toBe(200)
  expect(personalModelRuntime(s.db,s.actor(1),s.config)).toMatchObject({provider:'qwen',model:'qwen-plus',enabled:true})
  expect(personalModelKey(s.db,s.actor(1),s.config)).toBe('synthetic-qwen-key')
  const updated=await s.call('updatePersonalModel',{...modelInput('qwen','qwen-plus',null),name:'改名保留Key',expectedVersion:1},{id:qwen.id},1)
  expect(updated.status,updated.text).toBe(200);expect(updated.value.data.hasApiKey).toBe(true)
  expect((await s.call('updatePersonalModel',{...modelInput('qwen','qwen-plus'),expectedVersion:1},{id:qwen.id},1)).status).toBe(409)
  const revoked=await s.call('updatePersonalModel',{name:'移除Key',provider:'qwen',model:'qwen-plus',enabled:false,removeApiKey:true,expectedVersion:2},{id:qwen.id},1)
  expect(revoked.value.data).toMatchObject({hasApiKey:false,enabled:false,version:3})
  expect(personalModelRuntime(s.db,s.actor(1),s.config).enabled).toBe(false)
  const delKey=randomUUID();expect((await s.call('deletePersonalModel',{expectedVersion:3},{id:qwen.id},1,'',delKey)).status).toBe(200)
  expect((await s.call('deletePersonalModel',{expectedVersion:3},{id:qwen.id},1,'',delKey)).status).toBe(200)
  const at=await s.call('personalModels',null,{},1);expect(at.value.data).toMatchObject({source:'personal',defaultConfigurationId:null})
  const allReceipts=JSON.stringify(s.db.prepare('SELECT * FROM idempotency_results').all());expect(allReceipts).not.toContain(secret);expect(allReceipts).not.toContain('synthetic-qwen-key')
  await s.restart();expect((await s.call('personalModels',null,{},1)).value.data.configurations).toHaveLength(2)
 })

 it('retains original lab credentials only for old members, and cryptographically rejects transplanting another member ciphertext',async()=>{
  const s=await setup(),legacyKey='sk-synthetic-lab-key-only'
  expect((await s.call('updateLabAiSettings',{expectedVersion:0,enabled:true,model:'deepseek-flash',apiKey:legacyKey},{id:'lab_ifrc_synthetic'})).status).toBe(200)
  expect((await s.call('personalModels')).value.data).toMatchObject({source:'legacy_lab',legacyLabAvailable:true,configurations:[]})
  expect(personalModelKey(s.db,s.actor(),s.config)).toBe(legacyKey)
  const a=(await s.call('createPersonalModel',modelInput())).value.data,b=(await s.call('createPersonalModel',modelInput(),{},1)).value.data
  expect(personalModelKey(s.db,s.actor(),s.config)).toBe(secret)
  const foreign=s.db.prepare('SELECT encrypted_api_key FROM personal_model_configurations WHERE id=?').get(a.id)!.encrypted_api_key
  s.db.prepare('UPDATE personal_model_configurations SET encrypted_api_key=? WHERE id=?').run(foreign!,b.id)
  expect(()=>personalModelKey(s.db,s.actor(1),s.config)).toThrow('SERVICE_UNAVAILABLE')
  const settings=(await s.call('personalModels')).value.data
  expect((await s.call('defaultPersonalModel',{configurationId:null,expectedVersion:settings.version})).status).toBe(200)
  expect(personalModelRuntime(s.db,s.actor(),s.config).enabled).toBe(false)
  expect((await s.call('deletePersonalModel',{expectedVersion:a.version},{id:a.id})).value.data).toMatchObject({source:'personal',configurations:[],defaultConfigurationId:null})
  expect(()=>personalModelKey(s.db,s.actor(),s.config)).toThrow('MODEL_UNAVAILABLE')
 })

 it('requires exact username discovery and symmetric human acceptance, shares one direct and rechecks revoked cursors and IM mappings',async()=>{
  const s=await setup();expect((await s.call('chatContacts',null,{},1,'?scope=global')).status).toBe(400)
  expect((await s.call('chatContacts',null,{},1,'?scope=global&search=synthetic_person')).value.data).toEqual([])
  const contacts=await s.find(1,0),human=contacts.find(c=>c.identity.kind==='human')
  expect(human).toMatchObject({username:s.clients[0]!.username,labId:'lab_ifrc_synthetic',relationship:{status:'none'}})
  expect((await s.call('createDirectConversation',{contactId:human.id},{},1)).status).toBe(403)
  const requestId=await s.accept(human.id),peer=(await s.find(0,1)).find(c=>c.identity.kind==='human')
  expect(peer.relationship.status).toBe('accepted')
  const direct=(await s.call('createDirectConversation',{contactId:human.id},{},1)).value.data
  expect((await s.call('createDirectConversation',{contactId:peer.id})).value.data.id).toBe(direct.id)
  for(const i of [0,1])expect((await s.call('chatConversation',null,{id:direct.id},i)).status).toBe(200)
  expect((await s.call('sendChatMessage',{text:'真人普通聊天 @不执行'},{id:direct.id},1)).status).toBe(201)
  expect((await s.call('sendChatMessage',{text:'真人回信'},{id:direct.id})).status).toBe(201)
  const page=(await s.call('chatMessages',null,{id:direct.id},1,'?limit=1')).value
  expect(page.nextCursor).not.toBeNull()
  const ownMaps=(await s.call('imConversations',null,{},1)).value.data.conversations,peerMaps=(await s.call('imConversations')).value.data.conversations
  expect(ownMaps.find((m:any)=>m.researchConversationId===direct.id).imConversationID).toBe(peerMaps.find((m:any)=>m.researchConversationId===direct.id).imConversationID)
  expect((await s.call('imContacts',null,{},1)).value.data.contacts.some((c:any)=>c.contact.id===human.id)).toBe(true)
  expect((await s.call('chatConversation',null,{id:direct.id},2)).status).toBe(404)
  expect((await s.call('imCreateGroup',{title:'跨空间不能成为任务群成员',plan:null,contactIds:[peer.id],sharedContext:{selectedText:null,artifactRefs:[]}})).status).toBe(403)
  const request=(await s.call('contactRequests',null,{},0,'?status=all')).value.data.find((r:any)=>r.id===requestId)
  expect((await s.call('revokeContactRequest',{expectedVersion:request.version},{id:requestId})).status).toBe(200)
  expect((await s.call('chatMessages',null,{id:direct.id},1,`?limit=1&cursor=${encodeURIComponent(page.nextCursor)}`)).status).toBe(404)
  expect((await s.call('chatConversation',null,{id:direct.id})).status).toBe(404)
  expect((await s.call('imConversations',null,{},1)).value.data.conversations.some((m:any)=>m.researchConversationId===direct.id)).toBe(false)
  expect(s.db.prepare('SELECT count(*) n FROM chat_turns').get()!.n).toBe(0)
 })

 it('uses requester Key and authorized direct memory for a foreign Agent, preserves private owner memory, and produces pure text without arrangements',async()=>{
  const s=await setup(),owner=await s.own()
  await s.call('createChatMemory',{scope:'private_agent',scopeId:owner.agent.id,content:'主人私有合成记忆不共享',source:null})
  const created=await s.call('createPersonalAgent',{displayName:'合成专属专家',introduction:'合成介绍',capabilityDescription:'分析合成文字',personality:'简洁、直接'})
  const agent=created.value.data
  expect((await s.call('requestContact',{}, {id:agent.id},1)).value.data.relationship.status).toBe('pending_outbound')
  const req=(await s.call('contactRequests')).value.data[0]
  expect((await s.call('decideContactRequest',{expectedVersion:req.version,decision:'accept'},{id:req.id},2)).status).toBe(404)
  expect((await s.call('decideContactRequest',{expectedVersion:req.version,decision:'accept'},{id:req.id})).status).toBe(200)
  await s.call('createChatMemory',{scope:'private_agent',scopeId:agent.id,content:'专家主人的私有合成记忆',source:null})
  const direct=(await s.call('createDirectConversation',{contactId:agent.id},{},1)).value.data
  await s.call('createChatMemory',{scope:'conversation',scopeId:direct.id,content:'该私聊明确保存的共同合成记忆',source:null},{},1)
  expect((await s.call('chatConversation',null,{id:direct.id})).status).toBe(404)
  expect((await s.call('chatMemories',null,{},1,`?scope=private_agent&scopeId=${agent.id}`)).status).toBe(404)
  expect((await s.call('createPersonalModel',modelInput('qwen','qwen-plus','synthetic-requester-key'),{},1)).status).toBe(201)
  const key=randomUUID(),sent=await s.call('agentChatMessage',{text:'你好，我们自然聊天即可。'},{id:direct.id},1,'',key)
  expect(sent.status,sent.text).toBe(201);expect(sent.value.data.turn).toMatchObject({status:'queued',budget:{maxTokens:4000,maxSeconds:90}})
  expect((await s.call('agentChatMessage',{text:'你好，我们自然聊天即可。'},{id:direct.id},1,'',key)).value.data.message.id).toBe(sent.value.data.message.id)
  let callCount=0
  const worker=new ChatWorker(s.db,s.config,async(input,_signal,credential)=>{
   callCount++;expect(input).toMatchObject({provider:'qwen',model:'qwen-plus'});expect(credential.apiKey).toBe('synthetic-requester-key')
   expect(input.system).toContain('natural private conversation');expect(input.system).not.toContain('Return JSON')
   expect(input.prompt).toContain('简洁、直接');expect(input.prompt).toContain('共同合成记忆');expect(input.prompt).not.toContain('主人私有');expect(input.prompt).not.toContain('主人的私有')
   return {text:'你好，可以直接聊。',failure:null,inputTokens:900,outputTokens:100,elapsedMs:10}
  })
  expect(await worker.tick()).toBe(true);expect(callCount).toBe(1)
  const turn=(await s.call('chatTurn',null,{id:sent.value.data.turn.id},1)).value.data;expect(turn.status).toBe('succeeded')
  const messages=(await s.call('chatMessages',null,{id:direct.id},1)).value.data;expect(messages.at(-1)).toMatchObject({origin:'model',text:'你好，可以直接聊。',actionIds:[]})
  expect(s.db.prepare('SELECT count(*) n FROM plans').get()!.n).toBe(0);expect(s.db.prepare('SELECT count(*) n FROM chat_actions').get()!.n).toBe(0)
  expect(s.db.prepare('SELECT count(*) n FROM im_message_outbox WHERE status=?').get('pending')!.n).toBe(2)
 })

 it('fences model selection changes during running chat while retaining actual normalized usage and rejecting stale results',async()=>{
  const s=await setup(),personal=await s.own(1),configuration=(await s.call('createPersonalModel',modelInput(),{},1)).value.data
  const sent=(await s.call('agentChatMessage',{text:'这是合成Key变更并发测试。'},{id:personal.conversation.id},1)).value.data
  let resolve!: (value:any)=>void,started!:()=>void
  const runningStarted=new Promise<void>(r=>{started=r}),worker=new ChatWorker(s.db,s.config,async()=>{started();return new Promise(r=>{resolve=r})})
  const execution=worker.tick();await runningStarted
  const update=await s.call('updatePersonalModel',{...modelInput(),apiKey:'synthetic-rotated-key-only',expectedVersion:configuration.version},{id:configuration.id},1)
  expect(update.status,update.text).toBe(200)
  resolve({text:'旧Key结果不能发布',failure:null,inputTokens:1100,outputTokens:100,elapsedMs:10});await execution
  const turn=(await s.call('chatTurn',null,{id:sent.turn.id},1)).value.data
  expect(turn).toMatchObject({status:'cancelled',failure:'INPUT_CHANGED',outputMessageId:null,usage:{inputTokens:1100,outputTokens:100}})
  expect(s.db.prepare('SELECT count(*) n FROM chat_messages WHERE conversation_id=?').get(personal.conversation.id)!.n).toBe(1)
 })

 it('restores encrypted personal configuration disabled with advanced versions and never resumes the queued natural model call',async()=>{
  const s=await setup(),personal=await s.own(1),configuration=(await s.call('createPersonalModel',modelInput(),{},1)).value.data
  const sent=(await s.call('agentChatMessage',{text:'恢复后须人工重新启用'},{id:personal.conversation.id},1)).value.data
  const stateVersion=(await s.call('personalModels',null,{},1)).value.data.version
  await s.app.close()
  const source=join(s.dir,'backup'),target=join(s.dir,'restored')
  expect(backup(s.config,source,'synthetic_operator','a'.repeat(40),'synthetic_config').completed).toBe(true)
  expect(restore(source,target,'synthetic_operator').completed).toBe(true)
  const restored=openDatabase(join(target,'platform.sqlite'));cleanup.push(()=>restored.close());checkDatabase(restored)
  expect(restored.prepare('SELECT enabled,version FROM personal_model_configurations WHERE id=?').get(configuration.id)).toMatchObject({enabled:0,version:configuration.version+1})
  expect(restored.prepare('SELECT version FROM personal_model_settings WHERE member_id=?').get(s.clients[1]!.id)!.version).toBe(stateVersion+1)
  expect(restored.prepare('SELECT count(*) n FROM sessions WHERE revoked_at IS NULL').get()!.n).toBe(0)
  let calls=0;const worker=new ChatWorker(restored,{...s.config,databasePath:join(target,'platform.sqlite'),blobRoot:join(target,'blobs')},async()=>{calls++;throw new Error('Must never dispatch restored old model request')})
  expect(await worker.tick()).toBe(false);expect(calls).toBe(0)
  expect(restored.prepare('SELECT status FROM chat_turns WHERE id=?').get(sent.turn.id)!.status).toBe('cancelled')
 })

 it('keeps synthetic trusted IM single-message callback ordinary and closes the existing accepted pair after revoke',async()=>{
  const s=await setup(),human=(await s.find(1,0)).find(c=>c.identity.kind==='human'),requestId=await s.accept(human.id)
  const bridge=new OpenImBridge(s.db,s.config),callbacks=new OpenImCallbacks(bridge)
  const ids=transaction(s.db,()=>s.clients.slice(0,2).map((_,i)=>{const chat=bridge.chat(s.actor(i));return bridge.identity(chat,chat.human().id).userID}))
  for(const i of [0,1])s.db.prepare("INSERT INTO im_token_leases(member_id,platform_id,session_hash,expires_at,state) VALUES (?,5,?,?,'ready')").run(s.clients[i]!.id,hash(s.clients[i]!.cookie.slice('rap_session='.length)),new Date(Date.now()+600000).toISOString())
  const body={sendID:ids[1],recvID:ids[0],senderPlatformID:5,msgFrom:100,contentType:101,content:JSON.stringify({content:'普通文字 @助理 仍不执行'}),clientMsgID:'synthetic_cross_space_sdk_message',serverMsgID:'synthetic_server_message'},operator={userID:ids[1]!,platform:'Web',policy:'rap-auth-v1',operationID:'synthetic_im_operation'}
  expect(transaction(s.db,()=>callbacks.handle('callbackBeforeSendSingleMsgCommand',{...body,callbackCommand:'callbackBeforeSendSingleMsgCommand'},operator))).toMatchObject({nextCode:0})
  transaction(s.db,()=>callbacks.handle('callbackAfterSendSingleMsgCommand',{...body,callbackCommand:'callbackAfterSendSingleMsgCommand'},operator));transaction(s.db,()=>callbacks.handle('callbackAfterSendSingleMsgCommand',{...body,callbackCommand:'callbackAfterSendSingleMsgCommand'},operator))
  expect(s.db.prepare('SELECT count(*) n FROM chat_messages').get()!.n).toBe(1);expect(s.db.prepare('SELECT count(*) n FROM chat_turns').get()!.n).toBe(0)
  expect(s.db.prepare('SELECT status FROM im_message_outbox').get()!.status).toBe('mirrored')
  const relationship=(await s.call('chatContact',null,{id:human.id},1)).value.data.relationship
  await s.call('revokeContactRequest',{expectedVersion:relationship.version},{id:requestId},1)
  expect(transaction(s.db,()=>callbacks.handle('callbackBeforeSendSingleMsgCommand',{...body,callbackCommand:'callbackBeforeSendSingleMsgCommand'},operator))).toMatchObject({nextCode:1,errCode:1002})
 })
})

it('upgrades exact populated015 twice, preserving IFRC accounts, sessions, chat documents, keys and IM identity; changes only relationship/scope indexes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'rap-personal-migrate-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}));const db=openDatabase(join(dir,'old.sqlite'),true);cleanup.push(()=>db.close())
 db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL) STRICT')
 const files=readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>/^\d{3}-/.test(n)).sort().slice(0,15)
 for(const [index,file] of files.entries()){const sql=readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8');db.exec(sql);db.prepare('INSERT INTO schema_migrations VALUES (?,?,?)').run(index+1,createHash('sha256').update(sql).digest('hex'),'2026-01-01T00:00:00Z')}
 db.prepare("INSERT INTO labs VALUES ('lab_ifrc','Synthetic preserved IFRC')").run()
 for(const id of ['member_old_A','member_old_B']){db.prepare('INSERT INTO members(id,lab_id,display_name) VALUES (?,?,?)').run(id,'lab_ifrc',id);db.prepare('INSERT INTO auth_accounts VALUES (?,?,?,0)').run(id,id,await passwordHash('12345678'));db.prepare("INSERT INTO chat_contacts VALUES (?,?,'human',?,?)").run(`contact_${id}`,'lab_ifrc',id,id)}
 const at='2026-01-01T00:00:00Z',conversation={id:'direct_old',labId:'lab_ifrc',kind:'direct',title:'Old title preserved',ownerMemberId:'member_old_A',version:1,members:[],taskIds:[],lastSequence:0,createdAt:at,updatedAt:at,allowedActions:[]}
 db.prepare('INSERT INTO chat_conversations VALUES (?,?,?,?,?,?)').run('direct_old','lab_ifrc','member_old_A','direct','direct:lab_ifrc:member_old_A:member_old_B',JSON.stringify(conversation))
 for(const id of ['member_old_A','member_old_B'])db.prepare("INSERT INTO chat_members VALUES (?,?,'joined',1,?)").run('direct_old',`contact_${id}`,id.endsWith('A')?'owner':'member')
 db.prepare("INSERT INTO chat_contact_requests VALUES (?,?,?,?,?,?,'accepted',1,?,?)").run('relation_old','lab_ifrc','member_old_A','contact_member_old_B','member_old_B','human:lab_ifrc:member_old_A:member_old_B',at,at)
 db.prepare("INSERT INTO lab_ai_settings VALUES (?,1,'deepseek-flash',?,1,?,?)").run('lab_ifrc','synthetic-preserved-ciphertext','member_old_A',at)
 db.prepare('INSERT INTO im_identities(contact_id,lab_id,user_id,updated_at) VALUES (?,?,?,?)').run('contact_member_old_A','lab_ifrc','u_preserved_old',at)
 const prior={accounts:db.prepare('SELECT * FROM auth_accounts').all(),lab:db.prepare('SELECT * FROM labs').all(),key:db.prepare('SELECT * FROM lab_ai_settings').all(),document:db.prepare('SELECT document FROM chat_conversations').get()!.document,identity:db.prepare('SELECT * FROM im_identities').all()}
 migrate(db);migrate(db);checkDatabase(db)
 expect(db.prepare('SELECT count(*) n FROM schema_migrations').get()!.n).toBe(19)
 expect(db.prepare('SELECT * FROM auth_accounts').all()).toEqual(prior.accounts);expect(db.prepare('SELECT * FROM labs').all()).toEqual(prior.lab);expect(db.prepare('SELECT * FROM lab_ai_settings').all()).toEqual(prior.key);expect(db.prepare('SELECT * FROM im_identities').all()).toEqual(prior.identity);expect(db.prepare('SELECT document FROM chat_conversations').get()!.document).toBe(prior.document)
 expect(db.prepare('SELECT relation_key FROM chat_contact_requests').get()!.relation_key).toBe('human:member_old_A:member_old_B')
 expect(db.prepare('SELECT scope_key FROM chat_conversations').get()!.scope_key).toBe('direct:member_old_A:member_old_B')
 expect(db.prepare('SELECT count(*) n FROM personal_spaces').get()!.n).toBe(0);expect(db.prepare('SELECT count(*) n FROM personal_model_configurations').get()!.n).toBe(0)
// This integration check runs fifteen file-backed migrations, password hashing,
// and two upgrades; Windows hosted-runner disk latency can exceed the 5s default.
},20000)
