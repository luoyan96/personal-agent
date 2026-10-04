import { readFileSync } from 'node:fs'
import { timingSafeEqual } from 'node:crypto'
import { OpenImResearchPointer } from '@research-agent-platform/contracts'
import { hash } from './auth.js'
import { serviceFor } from './execution-worker.js'
import { OpenImBridge } from './openim-bridge.js'
import { fail } from './errors.js'

type Body=Record<string,unknown>
const unwrap=(value:unknown)=>value&&typeof value==='object'&&'value' in value?(value as {value:unknown}).value:value
export type ImOperator={userID:string;platform:string;policy:string;operationID:string}
export class OpenImCallbacks {
  constructor(readonly bridge:OpenImBridge){}
  get db(){return this.bridge.db}
  authenticate(key:string){let expected='';try{expected=readFileSync(this.bridge.config.openIm.callbackKeyFile!,'utf8').trim()}catch{fail('FORBIDDEN')};if(!/^[a-f0-9]{64}$/.test(expected)||key.length!==expected.length||!timingSafeEqual(Buffer.from(key),Buffer.from(expected)))fail('FORBIDDEN')}
  operator(value:ImOperator){
    if(!value.userID||!value.platform||value.policy!=='rap-auth-v1')fail('FORBIDDEN')
    if(value.userID===this.bridge.config.openIm.adminID&&value.platform==='Admin')return {...value,admin:true}
    const platformID=value.platform==='Windows'?3:value.platform==='Web'?5:null;if(platformID===null)fail('FORBIDDEN')
    this.actor(value.userID,platformID);return {...value,admin:false}
  }
  contact(userID:unknown){if(typeof userID!=='string')fail('FORBIDDEN');const row=this.db.prepare('SELECT contact_id FROM im_identities WHERE user_id=?').get(userID);if(!row)fail('FORBIDDEN');const owner=this.db.prepare('SELECT owner_id FROM chat_contacts WHERE id=?').get(row.contact_id!)!;const chat=this.bridge.chat(serviceFor(this.db,String(owner.owner_id),this.bridge.config).c.actor);return chat.contact(String(row.contact_id))}
  actor(userID:unknown,platform?:unknown){const contact=this.contact(userID);if(contact.identity.kind!=='human')fail('FORBIDDEN');const id=contact.identity.memberId
    if(platform!==undefined&&platform!==3&&platform!==5)fail('FORBIDDEN')
    if(!this.db.prepare(`SELECT 1 FROM im_token_leases l JOIN sessions s ON s.token_hash=l.session_hash JOIN auth_accounts a ON a.member_id=l.member_id
      WHERE l.member_id=? AND l.state='ready' AND (? IS NULL OR l.platform_id=?) AND l.expires_at>? AND s.expires_at>? AND s.revoked_at IS NULL AND a.disabled=0`).get(id,platform??null,platform??null,new Date().toISOString(),new Date().toISOString()))fail('FORBIDDEN')
    return serviceFor(this.db,id,this.bridge.config).c.actor
  }
  group(groupID:unknown){if(typeof groupID!=='string')fail('FORBIDDEN');const row=this.db.prepare('SELECT conversation_id FROM im_conversations WHERE group_id=?').get(groupID);if(!row)fail('FORBIDDEN');const source=this.db.prepare("SELECT c.owner_id,m.owner_id viewer_id FROM chat_conversations c JOIN chat_members x ON x.conversation_id=c.id AND x.status='joined' JOIN chat_contacts m ON m.id=x.contact_id AND m.kind='human' JOIN auth_accounts a ON a.member_id=m.owner_id AND a.disabled=0 WHERE c.id=? ORDER BY (m.owner_id=c.owner_id) DESC LIMIT 1").get(row.conversation_id!);if(!source)fail('FORBIDDEN');const chat=this.bridge.chat(serviceFor(this.db,String(source.viewer_id),this.bridge.config).c.actor);return {chat,group:chat.conversation(String(row.conversation_id),false),members:this.bridge.activeContacts(chat,chat.conversation(String(row.conversation_id),false)).map(member=>member.userID)}}
  pair(ownerUserID:unknown,peerUserID:unknown){const owner=this.contact(ownerUserID),peer=this.contact(peerUserID);if(owner.labId!==peer.labId)fail('FORBIDDEN');if(owner.identity.kind==='human'){const chat=this.bridge.chat(serviceFor(this.db,owner.identity.memberId,this.bridge.config).c.actor);chat.directory.requireDirect(chat.contact(peer.id));return chat}
    // Server Agent -> authorized human is the reverse of the same relationship.
    if(peer.identity.kind!=='human')fail('FORBIDDEN');const chat=this.bridge.chat(serviceFor(this.db,peer.identity.memberId,this.bridge.config).c.actor);chat.directory.requireDirect(chat.contact(owner.id));return chat
  }
  pointer(body:Body){const content=typeof body.content==='string'?JSON.parse(body.content):body.content as Body|undefined;const custom=(content?.customElem??content) as Body|undefined;const raw=custom?.data;return typeof raw==='string'?OpenImResearchPointer.safeParse(JSON.parse(raw)):OpenImResearchPointer.safeParse(null)}
  serverPointer(body:Body){
    const pointer=this.pointer(body);if(!pointer.success||body.contentType!==110)fail('FORBIDDEN')
    const row=this.db.prepare("SELECT m.document,c.owner_id,o.status,o.operation_id FROM chat_messages m JOIN chat_conversations c ON c.id=m.conversation_id JOIN im_message_outbox o ON o.message_id=m.id WHERE m.id=? AND m.conversation_id=?").get(pointer.data.messageId,pointer.data.conversationId)
    if(!row||!['sending','uncertain','sent'].includes(String(row.status))||!row.operation_id||body.operationID!==row.operation_id)fail('FORBIDDEN')
    const value=JSON.parse(String(row.document)),turn=value.turnId?this.db.prepare('SELECT owner_id FROM chat_turns WHERE id=?').get(value.turnId):null
    const sender=value.senderContactId?this.db.prepare('SELECT owner_id FROM chat_contacts WHERE id=?').get(value.senderContactId):null
    const owner=String(turn?.owner_id??(value.origin==='human'?sender?.owner_id:null)??row.owner_id),chat=this.bridge.chat(serviceFor(this.db,owner,this.bridge.config).c.actor),message=chat.projectedMessage(pointer.data.messageId)
    if(message.sequence!==pointer.data.sequence||this.bridge.identity(chat,message.senderContactId??chat.human().id).userID!==body.sendID)fail('FORBIDDEN')
    return pointer.data
  }
  message(body:Body,operator:ReturnType<OpenImCallbacks['operator']>){
    if(operator.admin&&body.msgFrom===200&&body.senderPlatformID===0&&typeof body.contentType==='number'&&body.contentType>=1000&&body.contentType<=5000){
      // Trusted internal OpenIM notifications update the SDK, never research facts.
      if(body.groupID)this.group(body.groupID)
      return
    }
    const server=body.msgFrom===200&&body.senderPlatformID===10
    if(server){if(!operator.admin)fail('FORBIDDEN');this.serverPointer(body)}
    else{if(operator.admin||operator.userID!==body.sendID||body.msgFrom!==100||body.senderPlatformID!==(operator.platform==='Windows'?3:5))fail('FORBIDDEN');this.actor(body.sendID,body.senderPlatformID)}
    if(body.groupID){const {chat,group,members}=this.group(body.groupID),mapping=this.bridge.mapping(chat,group.id);if(mapping.transportStatus!=='ready')fail('FORBIDDEN');if(!members.includes(String(body.sendID)))fail('FORBIDDEN');if(server&&this.pointer(body).data?.conversationId!==group.id)fail('FORBIDDEN');chat.contact(this.contact(body.sendID).id)}
    else{const chat=this.pair(body.sendID,body.recvID);if(server){const pointer=this.pointer(body);const mapped=this.bridge.mapping(chat,pointer.data!.conversationId);if(mapped.groupID||!mapped.imConversationID.includes(String(body.sendID))||!mapped.imConversationID.includes(String(body.recvID)))fail('FORBIDDEN')}}
  }
  before(command:string,body:Body,operator:ReturnType<OpenImCallbacks['operator']>){
    if(command==='callbackBeforeSendSingleMsgCommand'||command==='callbackBeforeSendGroupMsgCommand'){this.message(body,operator);return}
    // In v3.8.3 this is a text-send transform hook, not editing existing messages.
    // Its body lacks the destination; the preceding send hook checks that ACL.
    if(command==='callbackBeforeMsgModifyCommand'){if(body.contentType!==101||operator.admin||operator.userID!==body.sendID||body.senderPlatformID!==(operator.platform==='Windows'?3:5)||body.msgFrom!==100)fail('FORBIDDEN');this.actor(body.sendID,body.senderPlatformID);return}
    if(['callbackBeforeAddFriendCommand','callbackBeforeAddFriendAgreeCommand','callbackBeforeImportFriendsCommand'].includes(command)){
      const owner=body.ownerUserID??body.fromUserID??body.reqUserID,peers=Array.isArray(body.friendUserIDs)?body.friendUserIDs:[body.friendUserID??body.toUserID??body.blackUserID]
      if(command==='callbackBeforeImportFriendsCommand'&&!operator.admin)fail('FORBIDDEN')
      if(!operator.admin&&operator.userID!==(command==='callbackBeforeAddFriendAgreeCommand'?peers[0]:owner))fail('FORBIDDEN')
      if(command==='callbackBeforeAddFriendCommand')this.actor(owner)
      if(command==='callbackBeforeAddFriendAgreeCommand')this.actor(peers[0])
      if(!peers.length||peers.some(peer=>typeof peer!=='string'))fail('FORBIDDEN');for(const peer of peers)this.pair(owner,peer);return
    }
    if(command==='callbackBeforeCreateGroupCommand'){
      if(!operator.admin)fail('FORBIDDEN')
      const {group,members}=this.group(body.groupID),owner=this.bridge.config.openIm.adminID
      if(body.ownerUserID!==owner||body.groupName!==group.title||body.groupType!==2||body.needVerification!==2||body.lookMemberInfo!==1||body.applyMemberFriend!==1)fail('FORBIDDEN')
      const initial=Array.isArray(body.initMemberList)?body.initMemberList as {userID:string;roleLevel:number}[]:[]
      if(initial.length!==members.length+1||new Set(initial.map(member=>member.userID)).size!==initial.length||initial.some(member=>member.userID===owner?member.roleLevel!==100:!members.includes(member.userID)||member.roleLevel!==20))fail('FORBIDDEN');return
    }
    if(['callbackBeforeMembersJoinGroupCommand','callbackBeforeInviteJoinGroupCommand','callbackBeforeJoinGroupCommand','callbackBeforeApplyJoinGroupCommand'].includes(command)){
      if(!operator.admin)fail('FORBIDDEN')
      const {members}=this.group(body.groupID),ids=Array.isArray(body.memberList)?body.memberList.map((member:{userID:string})=>member.userID):Array.isArray(body.invitedUserIDs)?body.invitedUserIDs:[body.applyID??body.userID??body.reqUserID],admin=this.bridge.config.openIm.adminID
      if(!ids.length||ids.some(id=>id!==admin&&!members.includes(String(id))))fail('FORBIDDEN');for(const id of ids)if(id!==admin)this.contact(id);return
    }
    if(['callbackBeforeUserRegisterCommand','callbackBeforeUpdateUserInfoCommand','callbackBeforeUpdateUserInfoExCommand'].includes(command)){
      const users=command==='callbackBeforeUserRegisterCommand'?body.users:[body.userInfo??body]
      if(!Array.isArray(users)||!users.length)fail('FORBIDDEN')
      for(const value of users as Body[]){const contact=this.contact(value.userID)
        if(!operator.admin&&(command==='callbackBeforeUserRegisterCommand'||operator.userID!==value.userID))fail('FORBIDDEN')
        if(unwrap(value.nickName??value.nickname)!==undefined&&unwrap(value.nickName??value.nickname)!==contact.displayName)fail('FORBIDDEN')
        for(const field of ['faceURL','ex'])if(unwrap(value[field])!==undefined&&unwrap(value[field])!=='')fail('FORBIDDEN')
        if(value.appMangerLevel!==undefined&&value.appMangerLevel!==0)fail('FORBIDDEN')
      };return
    }
    if(['callbackBeforeSetGroupInfoCommand','callbackBeforeSetGroupInfoExCommand','callbackBeforeSetGroupMemberInfoCommand'].includes(command)){
      if(!operator.admin)fail('FORBIDDEN')
      const {group,members}=this.group(body.groupID),admin=this.bridge.config.openIm.adminID
      if(command==='callbackBeforeSetGroupMemberInfoCommand'){
        if(body.userID!==admin&&!members.includes(String(body.userID)))fail('FORBIDDEN')
        if(body.roleLevel!==undefined&&body.roleLevel!==(body.userID===admin?100:20))fail('FORBIDDEN')
        if(body.nickName!==undefined&&(body.userID===admin?body.nickName!==admin:body.nickName!==this.contact(body.userID).displayName))fail('FORBIDDEN')
        for(const field of ['faceURL','ex'])if(body[field]!==undefined&&body[field]!=='')fail('FORBIDDEN')
      }else{
        const expected:Body={groupName:group.title,needVerification:2,lookMemberInfo:1,applyMemberFriend:1,ex:JSON.stringify({researchConversationId:group.id}),faceURL:'',notification:'',introduction:''}
        for(const [field,value] of Object.entries(expected))if(body[field]!==undefined&&unwrap(body[field])!==value)fail('FORBIDDEN')
      };return
    }
    fail('FORBIDDEN')
  }
  handle(command:string,body:Body,context:ImOperator){
    if(body.callbackCommand!==command)fail('FORBIDDEN')
    if(command.startsWith('callbackBefore')){try{const operator=this.operator(context);this.before(command,body,operator);if(operator.admin&&context.operationID)this.db.prepare('INSERT INTO im_callback_receipts(event_key,body_hash,received_at) VALUES (?,?,?) ON CONFLICT(event_key) DO NOTHING').run(hash(`policy:${context.operationID}`),hash(JSON.stringify(body)),new Date().toISOString());return {actionCode:0,errCode:0,errMsg:'',errDlt:'',nextCode:0}}catch{return {actionCode:0,errCode:1002,errMsg:'Research authorization required',errDlt:'',nextCode:1}}}
    let operator:ReturnType<OpenImCallbacks['operator']>
    try{operator=this.operator(context)}catch{return {errCode:0,errMsg:''}}
    if(['callbackAfterQuitGroupCommand','callbackAfterKickGroupCommand','callbackAfterKickGroupMemberCommand','callbackAfterDisMissGroupCommand','callbackAfterDismissGroupCommand','callbackAfterTransferGroupOwnerCommand','callbackAfterSetGroupMemberInfoCommand','callbackAfterSetGroupInfoCommand','callbackAfterSetGroupInfoExCommand'].includes(command)){
      try{const {group}=this.group(body.groupID);this.db.prepare("UPDATE im_conversations SET status='pending',updated_at=? WHERE conversation_id=?").run(new Date().toISOString(),group.id)}catch{/* unknown external groups are never mapped or granted */}
      return {errCode:0,errMsg:''}
    }
    if(!['callbackAfterSendSingleMsgCommand','callbackAfterSendGroupMsgCommand'].includes(command))return {errCode:0,errMsg:''}
    try{this.message(body,operator)}catch{return {errCode:0,errMsg:''}}
    const messageID=body.clientMsgID??body.serverMsgID;if(typeof messageID!=='string'||!messageID.length)fail('VALIDATION_ERROR')
    const key=hash(`${command}:${body.sendID}:${messageID}`),fingerprint=hash(JSON.stringify(body)),previous=this.db.prepare('SELECT body_hash FROM im_callback_receipts WHERE event_key=?').get(key)
    if(previous){if(previous.body_hash!==fingerprint)fail('IDEMPOTENCY_CONFLICT');return {errCode:0,errMsg:''}}
    this.db.prepare('INSERT INTO im_callback_receipts VALUES (?,?,?,NULL)').run(key,fingerprint,new Date().toISOString())
    if(body.contentType===110&&body.msgFrom===200){const pointer=this.pointer(body);if(pointer.success)this.db.prepare("UPDATE im_message_outbox SET status='sent',server_message_id=?,updated_at=? WHERE message_id=? AND status IN ('sending','uncertain')").run(String(body.serverMsgID??''),new Date().toISOString(),pointer.data.messageId);return {errCode:0,errMsg:''}}
    if(body.contentType!==101&&body.contentType!==106)return {errCode:0,errMsg:''}
    let text:unknown
    try{const content=typeof body.content==='string'?JSON.parse(body.content):body.content as Body;text=((content?.textElem??content) as Body)?.content}catch{return {errCode:0,errMsg:''}}
    if(typeof text!=='string'||!text.length||text.length>8000)return {errCode:0,errMsg:''}
    const actor=this.actor(body.sendID,body.senderPlatformID),chat=this.bridge.chat(actor)
    let id:string
    if(body.groupID)id=this.group(body.groupID).group.id
    else{const contact=this.contact(body.recvID);id=(chat.handle('createDirectConversation',{params:{},query:{},headers:{},body:{contactId:contact.id}}) as {data:{id:string}}).data.id}
    const result=chat.message(id,{senderContactId:chat.human().id,origin:'human',text,mentions:[],resources:[],actionIds:[],turnId:null})
    this.db.prepare("UPDATE im_message_outbox SET status='mirrored' WHERE message_id=?").run(result.id)
    this.db.prepare('UPDATE im_callback_receipts SET research_message_id=? WHERE event_key=?').run(result.id,key)
    return {errCode:0,errMsg:''}
  }
}
