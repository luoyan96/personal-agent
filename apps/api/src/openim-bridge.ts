import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import { OpenImConversation, OpenImContact, OpenImSession } from '@research-agent-platform/contracts'
import type { Actor } from './auth.js'
import { authenticate, hash } from './auth.js'
import { Collaboration } from './collaboration.js'
import { ChatService } from './chat.js'
import { transaction } from './database.js'
import { labAiRuntime } from './lab-ai-settings.js'
import type { Config } from './config.js'
import { ImUnavailable, imConfiguration, OpenImClient } from './openim-client.js'
import { fail } from './errors.js'

export type ImMapping=z.infer<typeof OpenImConversation>
const now=()=>new Date().toISOString()
export class OpenImBridge {
  constructor(readonly db:DatabaseSync,readonly config:Config,readonly client=new OpenImClient(config)){}
  chat(actor:Actor){const chat=new ChatService(new Collaboration(this.db,actor,this.config.blobRoot,labAiRuntime(this.db,actor.labId,this.config)),this.config);chat.ensureContacts();return chat}
  identity(chat:ChatService,id:string){
    const contact=chat.contact(id),userID=`u_${hash(`${contact.labId}:${contact.id}`).slice(0,32)}`
    this.db.prepare('INSERT INTO im_identities(contact_id,lab_id,user_id,updated_at) VALUES (?,?,?,?) ON CONFLICT(contact_id) DO NOTHING').run(id,contact.labId,userID,now())
    const row=this.db.prepare('SELECT status,profile_version FROM im_identities WHERE contact_id=?').get(id)!
    return OpenImContact.parse({contact,userID,transportStatus:row.status==='ready'&&row.profile_version===contact.profile.version?'ready':'pending'})
  }
  unavailableReason(){try{imConfiguration(this.config);return null}catch(error){return error instanceof ImUnavailable?error.reason:'not_configured' as const}}
  mapping(chat:ChatService,id:string):ImMapping{
    const group=chat.conversation(id,false),self=this.identity(chat,chat.human().id)
    let groupID:string|null=null,peerUserID:string|null=null,imConversationID:string
    if(group.kind==='group'){groupID=`g_${hash(`${group.labId}:${group.id}`).slice(0,32)}`;imConversationID=`sg_${groupID}`}
    else{const peer=group.members.find(member=>member.contactId!==self.contact.id&&member.status==='joined');if(!peer)fail('NOT_FOUND');peerUserID=this.identity(chat,peer.contactId).userID;imConversationID=`si_${[self.userID,peerUserID].sort().join('_')}`}
    this.db.prepare('INSERT INTO im_conversations(conversation_id,lab_id,im_conversation_id,group_id,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(conversation_id) DO NOTHING').run(id,group.labId,imConversationID,groupID,now())
    const row=this.db.prepare('SELECT * FROM im_conversations WHERE conversation_id=?').get(id)!,reason=this.unavailableReason()
    if(group.kind==='group'&&row.members_hash!==this.membersHash(chat,group)){this.db.prepare("UPDATE im_conversations SET status='pending' WHERE conversation_id=?").run(id);row.status='pending'}
    return OpenImConversation.parse({researchConversationId:id,imConversationID,kind:group.kind,peerUserID,groupID,pinned:group.kind==='personal',transportStatus:reason?'unavailable':row.status==='ready'&&row.synced_version===group.version?'ready':'pending',reason})
  }
  contacts(chat:ChatService){
    const ids=[...new Set([...chat.mineContactIds(),...this.db.prepare('SELECT id FROM chat_contacts WHERE lab_id=?').all(chat.c.actor.labId).map(row=>String(row.id))])]
    const all=ids.flatMap(id=>{try{const contact=chat.contact(id);if(contact.labId!==chat.c.actor.labId&&!['own','accepted'].includes(contact.relationship.status))return [];return [this.identity(chat,contact.id)]}catch{return []}})
    return {contacts:all.slice(0,100),truncated:all.length>100}
  }
  conversations(chat:ChatService,imConversationID?:string){
    const all=this.db.prepare("SELECT c.id FROM chat_conversations c JOIN chat_members m ON m.conversation_id=c.id AND m.contact_id=? AND m.status='joined' ORDER BY c.id").all(chat.human().id).flatMap(row=>{try{return [this.mapping(chat,String(row.id))]}catch{return []}}).filter(mapping=>!imConversationID||mapping.imConversationID===imConversationID)
    return {conversations:all.slice(0,100),truncated:all.length>100}
  }
  async provision(actor:Actor,id:string){
    const snapshot=transaction(this.db,()=>this.identity(this.chat(actor),id))
    if(snapshot.transportStatus==='ready')return snapshot
    await this.client.ensureUser(snapshot.userID,snapshot.contact.displayName)
    return transaction(this.db,()=>{const current=this.identity(this.chat(actor),id);if(current.contact.profile.version!==snapshot.contact.profile.version)fail('VERSION_CONFLICT');this.db.prepare("UPDATE im_identities SET status='ready',profile_version=?,updated_at=? WHERE contact_id=?").run(current.contact.profile.version,now(),id);return {...current,transportStatus:'ready' as const}})
  }
  async importMissingFriends(ownerUserID:string,friendUserIDs:string[],checkLive:()=>unknown){
    checkLive()
    const remote=await this.client.request('/friend/get_friend_list',{userID:ownerUserID,pagination:{pageNumber:1,showNumber:1000}})
    // Fixed OpenIM ImportFriends emits an approval notification even for existing
    // friends. Only a complete, actual server list can prove an import is needed.
    // Its Go HTTP writer includes total:0 and serializes a nil list as null.
    const friends=remote.friendsInfo===null&&remote.total===0?[]:remote.friendsInfo
    if(!Array.isArray(friends)||!Number.isInteger(remote.total)||Number(remote.total)!==friends.length)throw new ImUnavailable('provisioning_failed')
    const present=new Set<string>()
    for(const friend of friends as {friendUser?:{userID?:string}}[]){
      const userID=friend.friendUser?.userID;if(typeof userID!=='string'||!userID)throw new ImUnavailable('provisioning_failed');present.add(userID)
    }
    checkLive()
    const missing=[...new Set(friendUserIDs)].filter(userID=>!present.has(userID))
    if(missing.length)await this.client.request('/friend/import_friend',{ownerUserID,friendUserIDs:missing})
    checkLive()
  }
  async reconcileFriends(actor:Actor,reauthorize:()=>Actor=()=>actor){
    const self=transaction(this.db,()=>{const chat=this.chat(reauthorize());return this.identity(chat,chat.human().id).userID})
    const remote=await this.client.request('/friend/get_friend_list',{userID:self,pagination:{pageNumber:1,showNumber:1000}})
    if(!Array.isArray(remote.friendsInfo))throw new ImUnavailable('provisioning_failed')
    for(const friend of remote.friendsInfo as {friendUser?:{userID?:string}}[]){
      const userID=friend.friendUser?.userID;if(typeof userID!=='string')throw new ImUnavailable('provisioning_failed')
      const authorized=transaction(this.db,()=>{const chat=this.chat(reauthorize()),row=this.db.prepare('SELECT contact_id FROM im_identities WHERE user_id=?').get(userID);if(!row)return false;try{chat.directory.requireDirect(chat.contact(String(row.contact_id)));return true}catch{return false}})
      if(!authorized){transaction(this.db,reauthorize);await this.client.request('/friend/delete_friend',{ownerUserID:self,friendUserID:userID})}
    }
    return Number(remote.total??remote.friendsInfo.length)>1000
  }
  async verifyPolicy(actor:Actor,reauthorize:()=>Actor=()=>actor){
    const self=transaction(this.db,()=>{const chat=this.chat(reauthorize());return this.identity(chat,chat.human().id)}),operationID=randomUUID()
    await this.client.request('/user/update_user_info',{userInfo:{userID:self.userID,nickname:self.contact.displayName,faceURL:''}},operationID)
    transaction(this.db,()=>{reauthorize();const key=hash(`policy:${operationID}`),proof=this.db.prepare('SELECT event_key FROM im_callback_receipts WHERE event_key=?').get(key);if(!proof)throw new ImUnavailable('policy_not_configured');this.db.prepare('DELETE FROM im_callback_receipts WHERE event_key=?').run(key)})
  }
  activeContacts(chat:ChatService,group:ReturnType<ChatService['conversation']>){
    return group.members.filter(member=>member.status==='joined').flatMap(member=>{try{return [this.identity(chat,member.contactId)]}catch{return []}})
  }
  membersHash(chat:ChatService,group:ReturnType<ChatService['conversation']>){return hash(JSON.stringify([this.config.openIm.adminID,...this.activeContacts(chat,group).map(c=>c.userID)].sort()))}
  async syncConversation(actor:Actor,id:string,reauthorize:()=>Actor=()=>actor){
    const snapshot=transaction(this.db,()=>{const chat=this.chat(reauthorize()),group=chat.conversation(id,false),mapping=this.mapping(chat,id),contacts=this.activeContacts(chat,group);return {group,mapping,contacts}})
    try{
      imConfiguration(this.config)
      for(const contact of snapshot.contacts)await this.provision(reauthorize(),contact.contact.id)
      await this.verifyPolicy(reauthorize(),reauthorize)
      const checkLive=(chat:ChatService)=>{const group=chat.conversation(id,false);chat.c.checkVersion(group.version,snapshot.group.version);if(JSON.stringify(this.activeContacts(chat,group).map(c=>[c.userID,c.contact.profile.version]))!==JSON.stringify(snapshot.contacts.map(c=>[c.userID,c.contact.profile.version])))fail('VERSION_CONFLICT');return chat}
      const live=()=>transaction(this.db,()=>checkLive(this.chat(reauthorize())))
      live()
      if(snapshot.mapping.groupID){
        const groupID=snapshot.mapping.groupID,ownerID=this.config.openIm.adminID
        const existing=await this.client.request('/group/get_groups_info',{groupIDs:[groupID]})
        if(!Array.isArray(existing.groupInfos)||!existing.groupInfos.some((g:{groupID?:string})=>g.groupID===groupID)){
          live();await this.client.request('/group/create_group',{ownerUserID:ownerID,memberUserIDs:snapshot.contacts.map(value=>value.userID),adminUserIDs:[],groupInfo:{groupID,ownerUserID:ownerID,groupName:snapshot.group.title,groupType:2,needVerification:2,lookMemberInfo:1,applyMemberFriend:1,ex:JSON.stringify({researchConversationId:id})},sendMessage:false})
        }
        const remote=await this.client.request('/group/get_group_member_list',{groupID,filter:0,pagination:{pageNumber:1,showNumber:1000}})
        if(!Array.isArray(remote.members)||Number(remote.total??remote.members.length)>1000)throw new ImUnavailable('provisioning_failed')
        const expected=new Set([ownerID,...snapshot.contacts.map(value=>value.userID)]),present=new Set(remote.members.map((member:{userID:string})=>member.userID))
        const removed=[...present].filter(userID=>!expected.has(userID));if(removed.length){live();await this.client.request('/group/kick_group',{groupID,kickedUserIDs:removed,reason:'Research membership revoked',sendMessage:false})}
        const added=[...expected].filter(userID=>!present.has(userID));if(added.length){live();await this.client.request('/group/invite_user_to_group',{groupID,invitedUserIDs:added,reason:'Research membership accepted',sendMessage:false})}
        const verified=await this.client.request('/group/get_group_member_list',{groupID,filter:0,pagination:{pageNumber:1,showNumber:1000}})
        if(!Array.isArray(verified.members)||verified.members.length!==expected.size||verified.members.some((member:{userID:string;roleLevel:number})=>!expected.has(member.userID)||member.roleLevel!==(member.userID===ownerID?100:20)))throw new ImUnavailable('provisioning_failed')
      }else{
        const self=snapshot.contacts.find(value=>value.contact.identity.kind==='human'&&value.contact.identity.memberId===actor.id)!
        await this.importMissingFriends(self.userID,[snapshot.mapping.peerUserID!],live)
        if(snapshot.mapping.kind==='personal')await this.client.request('/conversation/set_conversations',{userIDs:[self.userID],conversation:{conversationID:snapshot.mapping.imConversationID,conversationType:1,userID:snapshot.mapping.peerUserID,isPinned:true,ex:JSON.stringify({researchConversationId:id})}})
      }
      return transaction(this.db,()=>{const chat=checkLive(this.chat(reauthorize()));this.db.prepare("UPDATE im_conversations SET status='ready',synced_version=?,members_hash=?,updated_at=? WHERE conversation_id=?").run(snapshot.group.version,this.membersHash(chat,chat.conversation(id,false)),now(),id);return this.mapping(chat,id)})
    }catch(error){if(!(error instanceof ImUnavailable))throw error;return transaction(this.db,()=>{const current=this.mapping(this.chat(reauthorize()),id);return {...current,transportStatus:'unavailable' as const,reason:error.reason}})}
  }
  async sync(actor:Actor,reauthorize:()=>Actor=()=>actor){
    const initial=transaction(this.db,()=>{const chat=this.chat(reauthorize());chat.handle('personalConversation',{params:{},query:{},headers:{},body:{}});return this.conversations(chat)})
    let contactsSynced=0,reason:z.infer<typeof OpenImSession>['reason']=null,truncated=initial.truncated
    const deadline=Date.now()+7000
    try{imConfiguration(this.config);const self=transaction(this.db,()=>this.chat(reauthorize()).human().id);await this.provision(reauthorize(),self);contactsSynced++
      const accepted=transaction(this.db,()=>this.contacts(this.chat(reauthorize())).contacts.filter(value=>value.contact.allowedActions.includes('chat')&&value.contact.identity.kind!=='human'||value.contact.relationship.status==='accepted'))
      const friendContacts:typeof accepted=[]
      for(const contact of accepted){if(Date.now()>=deadline){truncated=true;break};await this.provision(reauthorize(),contact.contact.id);transaction(this.db,()=>this.chat(reauthorize()).directory.requireDirect(this.chat(reauthorize()).contact(contact.contact.id)));friendContacts.push(contact);contactsSynced++}
      const selfID=transaction(this.db,()=>this.identity(this.chat(reauthorize()),self).userID)
      const liveFriends=()=>transaction(this.db,()=>{const chat=this.chat(reauthorize());if(this.identity(chat,chat.human().id).userID!==selfID)fail('VERSION_CONFLICT');for(const contact of friendContacts){const current=this.identity(chat,contact.contact.id);chat.directory.requireDirect(current.contact);if(current.userID!==contact.userID||current.contact.profile.version!==contact.contact.profile.version)fail('VERSION_CONFLICT')}})
      if(friendContacts.length)await this.importMissingFriends(selfID,friendContacts.map(contact=>contact.userID),liveFriends)
      truncated=(await this.reconcileFriends(reauthorize(),reauthorize))||truncated
    }catch(error){if(!(error instanceof ImUnavailable))throw error;reason=error.reason}
    const conversations:ImMapping[]=[]
    for(const mapping of initial.conversations){if(Date.now()>=deadline){truncated=true;conversations.push(mapping);continue};const value=await this.syncConversation(reauthorize(),mapping.researchConversationId,reauthorize);conversations.push(value);reason??=value.reason}
    return {status:reason?'unavailable' as const:'available' as const,reason,contactsSynced,conversations,truncated}
  }
  async session(token:string,platformID:3|5){
    const reauthorize=()=>authenticate(this.db,token),actor=transaction(this.db,reauthorize)
    const personal=transaction(this.db,()=>{const chat=this.chat(reauthorize());return (chat.handle('personalConversation',{params:{},query:{},headers:{},body:{}}) as {data:{conversation:{id:string}}}).data.conversation.id})
    let coordinator=transaction(this.db,()=>this.mapping(this.chat(reauthorize()),personal))
    try{
      const configuration=imConfiguration(this.config)
      coordinator=await this.syncConversation(actor,personal,reauthorize)
      if(coordinator.transportStatus!=='ready')throw new ImUnavailable(coordinator.reason??'provisioning_failed')
      const self=transaction(this.db,()=>this.identity(this.chat(reauthorize()),this.chat(reauthorize()).human().id)),operationID=randomUUID()
      transaction(this.db,()=>{
        reauthorize()
        const lease=this.db.prepare('SELECT * FROM im_token_leases WHERE member_id=? AND platform_id=?').get(actor.id,platformID)
        if(lease&&lease.state!=='ready'&&Number(lease.operation_until)>Date.now())fail('RATE_LIMITED')
        this.db.prepare("INSERT INTO im_token_leases VALUES (?,?,?,?, 'issuing',?,?) ON CONFLICT(member_id,platform_id) DO UPDATE SET session_hash=excluded.session_hash,expires_at=excluded.expires_at,state='issuing',operation_id=excluded.operation_id,operation_until=excluded.operation_until").run(actor.id,platformID,hash(token),now(),operationID,Date.now()+120000)
      })
      // Old tokens on this platform must not inherit a newly authenticated RAP lease.
      await this.client.request('/auth/force_logout',{userID:self.userID,platformID})
      transaction(this.db,reauthorize)
      const data=await this.client.request('/auth/get_user_token',{userID:self.userID,platformID})
      if(typeof data.token!=='string'||!data.token||!Number.isFinite(Number(data.expireTimeSeconds))||Number(data.expireTimeSeconds)<=0)throw new ImUnavailable('provisioning_failed')
      const expiresAt=new Date(Math.min(Date.now()+Number(data.expireTimeSeconds)*1000,Date.parse(reauthorize().expiresAt))).toISOString()
      return transaction(this.db,()=>{reauthorize();const changed=this.db.prepare("UPDATE im_token_leases SET expires_at=?,state='ready',operation_id=NULL,operation_until=NULL WHERE member_id=? AND platform_id=? AND operation_id=? AND state='issuing'").run(expiresAt,actor.id,platformID,operationID);if(changed.changes!==1)fail('VERSION_CONFLICT');return OpenImSession.parse({bridgeVersion:'1.0.0',status:'available',reason:null,configuration,user:{userID:self.userID,imToken:data.token,platformID,expiresAt},coordinator})})
    }catch(error){if(!(error instanceof ImUnavailable))throw error;transaction(this.db,reauthorize);return OpenImSession.parse({bridgeVersion:'1.0.0',status:'unavailable',reason:error.reason,configuration:null,user:null,coordinator:{...coordinator,transportStatus:'unavailable',reason:error.reason}})}
  }
}
