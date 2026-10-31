import type { DatabaseSync } from 'node:sqlite'
import { Task } from '@research-agent-platform/contracts'
import type { Conversation } from '@research-agent-platform/contracts'
import { transaction } from './database.js'
import { ChatService } from './chat.js'
import { serviceFor } from './execution-worker.js'
import { hasLabMembership } from './lab-access.js'
import type { Config } from './config.js'

// Deliver task invitation notices (invite + transfer) to the invited member's
// personal assistant. support_requested and other historical kinds stay dormant.
export class TaskInvitationWorker {
  constructor(readonly db: DatabaseSync, readonly config: Config) {}
  async tick() { return transaction(this.db,()=>{
    const row=this.db.prepare("SELECT * FROM outbox WHERE kind IN ('invitation_created','transfer_invitation_created') AND status='pending' AND available_at<=? ORDER BY rowid LIMIT 1").get(new Date().toISOString())
    if(!row)return false
    const payload=JSON.parse(String(row.payload_json)) as {taskId:string;requestedBy?:string}
    const saved=this.db.prepare('SELECT document FROM tasks WHERE id=?').get(payload.taskId)
    const task=saved?Task.parse(JSON.parse(String(saved.document))):null
    const assignment=this.db.prepare("SELECT member_id FROM assignments WHERE task_id=? AND status='pending' ORDER BY rowid DESC LIMIT 1").get(payload.taskId)
    const target=assignment?String(assignment.member_id):null
    const active=(id:string)=>this.db.prepare('SELECT 1 FROM auth_accounts WHERE member_id=? AND disabled=0').get(id)
    const permitted=task&&target&&task.status==='awaiting_acceptance'&&task.version===row.aggregate_version
      &&active(target)
      &&hasLabMembership(this.db,target,task.labId)
      &&!this.db.prepare("SELECT 1 FROM task_access WHERE task_id=? AND member_id=? AND access='revoked'").get(task.id,target)
    if(!permitted){this.db.prepare("UPDATE outbox SET status='cancelled' WHERE id=?").run(row.id!);return true}
    const chat=new ChatService(serviceFor(this.db,target,this.config).c,this.config)
    chat.ensureContacts()
    const {data}=chat.handle('personalConversation',{params:{},query:{},headers:{},body:{}}) as {data:{conversation:Conversation;agent:{id:string}}}
    const inviterId=payload.requestedBy??task.initiatorId
    const inviter=this.db.prepare('SELECT display_name FROM members WHERE id=?').get(inviterId)
    // Carry the task reference so the invitee's client can offer one clickable
    // card instead of a bare sentence. The invitee still decides separately;
    // the reference only links to the inbox entry they are allowed to open.
    chat.message(data.conversation.id,{senderContactId:data.agent.id,origin:'service',text:`${inviter?.display_name ?? '有人'}邀请你承接任务「${task.title}」。请在任务待办中查看详情并决定是否接受。`,mentions:[],resources:[{kind:'task',ref:{id:task.id,version:task.version}}],actionIds:[],turnId:null})
    this.db.prepare("UPDATE outbox SET status='delivered',attempts=attempts+1 WHERE id=?").run(row.id!)
    return true
  }) }
}
