import {Assignment, Deliverable, ResearchWorkspaceRow, ResearchWorkspaceSummary, type RequestFor, type ScheduleModel} from '@research-agent-platform/contracts'
import type {Collaboration} from './collaboration.js'
import {ApiError} from './errors.js'

// A date remains due for the entire day in its own timezone. Suggestions and
// unconfirmed arrangements are never promoted into an overdue commitment.
export function scheduleOverdue(schedule:ScheduleModel,at:string){
  return [schedule.hardDeadline,schedule.committed].some(due=>{
    if(!due?.confirmed||due.source==='suggestion')return false
    if(due.value.kind==='instant')return Date.parse(due.value.at)<Date.parse(at)
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:due.value.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at))
    return due.value.date<today
  })
}
function missing(error:unknown){if(!(error instanceof ApiError)||error.code!=='NOT_FOUND')throw error}
export function planTasks(c:Collaboration,request:RequestFor<'planTasks'>){
  const plan=c.plan(request.params.id)
  return {data:{planId:plan.id,planVersion:plan.version,steps:plan.proposedItems.map(item=>{
    const row=c.db.prepare('SELECT id FROM tasks WHERE plan_id=? AND item_id=?').get(plan.id,item.id)
    if(row){try{return {itemId:item.id,taskId:String(row.id),task:c.projection(String(row.id),false)}}catch(error){missing(error)}}
    return {itemId:item.id,taskId:null,task:null}
  })}}
}
export function researchWorkspace(c:Collaboration,request:RequestFor<'researchWorkspace'>){
  c.sameLab(request.params.id)
  const {query}=request,base={kind:'researchWorkspace',labId:request.params.id,scope:query.scope??'lab',limit:query.limit??30},cursor=c.cursor(base,query.cursor),v=c.visible(base.scope)
  const at=c.readSnapshot!.at
  const summary=ResearchWorkspaceSummary.parse({total:0,unassigned:0,awaitingAcceptance:0,active:0,blocked:0,awaitingReview:0,accepted:0,cancelled:0,overdue:0,pendingMyReview:0,pendingMyInvitation:0})
  const facts=c.db.prepare(`SELECT t.status,acl.access,t.reviewer_id,json_extract(t.document,'$.schedule') schedule,
    EXISTS(SELECT 1 FROM assignments a WHERE a.task_id=t.id AND a.member_id=? AND a.status='pending') invited,
    EXISTS(SELECT 1 FROM deliverables d JOIN reviews r ON r.deliverable_id=d.id WHERE d.task_id=t.id AND d.revision=(SELECT MAX(latest.revision) FROM deliverables latest WHERE latest.task_id=t.id) AND json_extract(r.document,'$.decision')='accepted' AND json_extract(d.document,'$.review.decision')='accepted') accepted
    ${v.sql}`).all(c.actor.id,...v.values)
  for(const row of facts){
    summary.total++
    const status=String(row.status),full=row.access==='full'
    if(status==='unassigned')summary.unassigned++
    if(status==='awaiting_acceptance')summary.awaitingAcceptance++
    if(['ready','in_progress','changes_requested'].includes(status))summary.active++
    if(status==='blocked')summary.blocked++
    if(status==='in_review')summary.awaitingReview++
    if(status==='completed'&&full&&row.accepted===1)summary.accepted++
    if(status==='cancelled')summary.cancelled++
    if(!['completed','cancelled'].includes(status)&&scheduleOverdue(JSON.parse(String(row.schedule)),at))summary.overdue++
    if(status==='in_review'&&full&&row.reviewer_id===c.actor.id)summary.pendingMyReview++
    if(status==='awaiting_acceptance'&&row.invited===1)summary.pendingMyInvitation++
  }
  const rows=c.db.prepare(`SELECT t.id,t.created_at ${v.sql} AND (? IS NULL OR t.created_at<? OR (t.created_at=? AND t.id<?)) ORDER BY t.created_at DESC,t.id DESC LIMIT ?`).all(...v.values,cursor?.last??null,cursor?.created??'',cursor?.created??'',cursor?.last??'',base.limit+1)
  const data=rows.slice(0,base.limit).map(row=>{
    const task=c.projection(String(row.id),false) as ResearchWorkspaceRow['task'],full=!('projection' in task)
    let planGoal:string|null=null,latestDeliverable:ResearchWorkspaceRow['latestDeliverable']=null,acceptedAssignment:ResearchWorkspaceRow['acceptedAssignment']=null,pendingInvitation:ResearchWorkspaceRow['pendingInvitation']=null
    if(full){
      // The source plan contains the owner's private goal. Shared task access
      // grants its task goal, never the entire owner's planning notes.
      const planOwner=c.db.prepare('SELECT owner_id FROM plans WHERE id=?').get(task.planId)
      if(planOwner?.owner_id===c.actor.id){try{planGoal=c.plan(task.planId).goal}catch(error){missing(error)}}
      const latest=c.db.prepare('SELECT document FROM deliverables WHERE task_id=? ORDER BY revision DESC LIMIT 1').get(task.id)
      if(latest)latestDeliverable=Deliverable.parse(JSON.parse(String(latest.document)))
      const accepted=c.db.prepare("SELECT document FROM assignments WHERE task_id=? AND status='accepted' LIMIT 1").get(task.id)
      if(accepted)acceptedAssignment=Assignment.parse(JSON.parse(String(accepted.document)))
      const pending=c.db.prepare("SELECT document FROM assignments WHERE task_id=? AND status='pending' LIMIT 1").get(task.id)
      if(pending)pendingInvitation=Assignment.parse(JSON.parse(String(pending.document)))
    }
    const status=full?task.status:task.visibleStatus
    return ResearchWorkspaceRow.parse({task,planGoal,latestDeliverable,acceptedAssignment,pendingInvitation,nextActions:task.allowedActions,overdue:!['completed','cancelled'].includes(status??'')&&scheduleOverdue(task.schedule,at)})
  })
  const last=rows[base.limit-1]
  return {data,summary,nextCursor:rows.length>base.limit?c.nextCursor(base,String(last!.id),String(last!.created_at)):null}
}
