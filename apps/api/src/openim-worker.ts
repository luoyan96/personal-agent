import { OpenImResearchPointer } from '@research-agent-platform/contracts'
import { randomUUID } from 'node:crypto'
import { transaction } from './database.js'
import { serviceFor } from './execution-worker.js'
import { OpenImBridge } from './openim-bridge.js'
import { imConfiguration } from './openim-client.js'
import type { DatabaseSync } from 'node:sqlite'
import type { Config } from './config.js'
import { OpenImClient } from './openim-client.js'

export class OpenImWorker {
  readonly owner=randomUUID()
  readonly bridge:OpenImBridge
  private retryAfter=0
  private checkedFriends=new Map<string,number>()
  constructor(readonly db:DatabaseSync,readonly config:Config,client=new OpenImClient(config)){this.bridge=new OpenImBridge(db,config,client)}
  snapshot(id:string){
    const row=this.db.prepare('SELECT m.document,c.owner_id FROM chat_messages m JOIN chat_conversations c ON c.id=m.conversation_id WHERE m.id=?').get(id)!
    const document=JSON.parse(String(row.document)),turn=document.turnId?this.db.prepare('SELECT owner_id FROM chat_turns WHERE id=?').get(document.turnId):null
    const contact=document.senderContactId?this.db.prepare('SELECT owner_id,kind FROM chat_contacts WHERE id=?').get(document.senderContactId):null
    const owner=String(turn?.owner_id??(document.origin==='human'?contact?.owner_id:null)??row.owner_id),actor=serviceFor(this.db,owner,this.config).c.actor,chat=this.bridge.chat(actor),message=chat.projectedMessage(id),mapping=this.bridge.mapping(chat,message.conversationId)
    const senderContact=message.senderContactId??chat.human().id,sender=this.bridge.identity(chat,senderContact),pointer=OpenImResearchPointer.parse({type:'research_message',bridgeVersion:'1.0.0',conversationId:message.conversationId,messageId:id,sequence:message.sequence})
    return {actor,mapping,sender,pointer}
  }
  async tick(){
    if(Date.now()<this.retryAfter)return false
    try{imConfiguration(this.config)}catch{return false}
    const revoked=transaction(this.db,()=>{
      const lease=this.db.prepare(`SELECT l.*,i.user_id FROM im_token_leases l JOIN sessions s ON s.token_hash=l.session_hash JOIN auth_accounts a ON a.member_id=l.member_id JOIN chat_contacts c ON c.owner_id=l.member_id AND c.kind='human' JOIN im_identities i ON i.contact_id=c.id
        WHERE (l.state='ready' AND (l.expires_at<=? OR s.expires_at<=? OR s.revoked_at IS NOT NULL OR a.disabled=1)) OR (l.state!='ready' AND l.operation_until<=?) LIMIT 1`).get(new Date().toISOString(),new Date().toISOString(),Date.now())
      if(!lease)return null
      const operationID=randomUUID();this.db.prepare("UPDATE im_token_leases SET state='revoking',operation_id=?,operation_until=? WHERE member_id=? AND platform_id=?").run(operationID,Date.now()+120000,lease.member_id!,lease.platform_id!)
      return {member_id:String(lease.member_id),platform_id:Number(lease.platform_id),user_id:String(lease.user_id),operationID}
    })
    if(revoked){
      try{await this.bridge.client.request('/auth/force_logout',{userID:revoked.user_id,platformID:revoked.platform_id});transaction(this.db,()=>this.db.prepare('DELETE FROM im_token_leases WHERE member_id=? AND platform_id=? AND operation_id=?').run(revoked.member_id!,revoked.platform_id!,revoked.operationID))}
      catch{this.retryAfter=Date.now()+10000;transaction(this.db,()=>this.db.prepare('UPDATE im_token_leases SET operation_until=? WHERE member_id=? AND platform_id=? AND operation_id=?').run(this.retryAfter,revoked.member_id!,revoked.platform_id!,revoked.operationID));return false}
      return true
    }
    const friendOwner=transaction(this.db,()=>this.db.prepare("SELECT DISTINCT l.member_id FROM im_token_leases l JOIN sessions s ON s.token_hash=l.session_hash JOIN auth_accounts a ON a.member_id=l.member_id WHERE l.state='ready' AND l.expires_at>? AND s.expires_at>? AND s.revoked_at IS NULL AND a.disabled=0 ORDER BY l.member_id").all(new Date().toISOString(),new Date().toISOString()).find(row=>(this.checkedFriends.get(String(row.member_id))??0)<Date.now()-60000))
    if(friendOwner){
      this.checkedFriends.set(String(friendOwner.member_id),Date.now())
      try{await this.bridge.reconcileFriends(serviceFor(this.db,String(friendOwner.member_id),this.config).c.actor)}catch{this.retryAfter=Date.now()+10000;return false}
    }
    // A membership change blocks SDK group sends until this live reconciliation removes stale recipients.
    const changed=transaction(this.db,()=>this.db.prepare("SELECT i.conversation_id,m.owner_id FROM im_conversations i JOIN chat_conversations c ON c.id=i.conversation_id JOIN chat_members x ON x.conversation_id=c.id AND x.status='joined' JOIN chat_contacts m ON m.id=x.contact_id AND m.kind='human' JOIN auth_accounts a ON a.member_id=m.owner_id AND a.disabled=0 WHERE i.group_id IS NOT NULL AND (i.status='pending' OR i.synced_version!=json_extract(c.document,'$.version')) ORDER BY i.updated_at,(m.owner_id=c.owner_id) DESC LIMIT 1").get())
    if(changed){try{const actor=serviceFor(this.db,String(changed.owner_id),this.config).c.actor;const mapped=await this.bridge.syncConversation(actor,String(changed.conversation_id));if(mapped.transportStatus!=='ready'){this.retryAfter=Date.now()+10000;return false}}catch{this.retryAfter=Date.now()+10000;return false}}
    const id=transaction(this.db,()=>{
      this.db.prepare("UPDATE im_message_outbox SET status='uncertain',lease_until=NULL WHERE status='sending' AND lease_until<?").run(Date.now())
      const row=this.db.prepare("SELECT message_id FROM im_message_outbox WHERE status='pending' ORDER BY rowid LIMIT 1").get();if(!row)return null
      try{this.snapshot(String(row.message_id))}catch{this.db.prepare("UPDATE im_message_outbox SET status='denied' WHERE message_id=?").run(row.message_id!);return ''}
      this.db.prepare("UPDATE im_message_outbox SET status='sending',lease_until=?,attempts=attempts+1,updated_at=? WHERE message_id=? AND status='pending'").run(Date.now()+120000,new Date().toISOString(),row.message_id!)
      return String(row.message_id)
    })
    if(id===null)return false;if(!id)return true
    let sending=false
    try{
      let value=transaction(this.db,()=>this.snapshot(id))
      const synced=await this.bridge.syncConversation(value.actor,value.mapping.researchConversationId)
      if(synced.transportStatus!=='ready')throw new Error('Transport not ready')
      value=transaction(this.db,()=>this.snapshot(id))
      const {mapping,sender,pointer}=value
      const self=transaction(this.db,()=>{const chat=this.bridge.chat(value.actor);return this.bridge.identity(chat,chat.human().id).userID})
      const operationID=randomUUID()
      transaction(this.db,()=>this.db.prepare('UPDATE im_message_outbox SET operation_id=? WHERE message_id=? AND status=\'sending\'').run(operationID,id))
      sending=true
      const response=await this.bridge.client.request('/msg/send_msg',{sendID:sender.userID,recvID:mapping.groupID?'':sender.userID===self?mapping.peerUserID:self,groupID:mapping.groupID??'',senderNickname:sender.contact.displayName,senderFaceURL:'',senderPlatformID:10,sessionType:mapping.groupID?3:1,contentType:110,content:{data:JSON.stringify(pointer),description:'科研协作记录',extension:''},isOnlineOnly:false,notOfflinePush:true},operationID)
      transaction(this.db,()=>this.db.prepare("UPDATE im_message_outbox SET status='sent',lease_until=NULL,server_message_id=?,updated_at=? WHERE message_id=? AND status IN ('sending','sent')").run(String(response.serverMsgID??''),new Date().toISOString(),id))
    }catch{
      // A lost send response is not proof of failure: never blindly replay and duplicate an IM message.
      transaction(this.db,()=>this.db.prepare("UPDATE im_message_outbox SET status=?,lease_until=NULL,updated_at=? WHERE message_id=? AND status='sending'").run(sending?'uncertain':'pending',new Date().toISOString(),id))
      if(!sending){this.retryAfter=Date.now()+10000;return false}
    }
    return true
  }
}
