import {z} from 'zod'
import {Id, Text, Version, Task, TaskSummary, Deliverable, Assignment, Snapshot, ErrorResponse, errorStatus} from './models.js'

export const ResearchWorkspaceRow = z.strictObject({
  task: z.union([Task, TaskSummary]), planGoal: Text.nullable(),
  latestDeliverable: Deliverable.nullable(), acceptedAssignment: Assignment.nullable(),
  pendingInvitation: Assignment.nullable(), nextActions: z.array(z.string().max(80)).max(20), overdue: z.boolean(),
}).superRefine((row,ctx)=>{
  if('projection' in row.task&&(row.planGoal!==null||row.latestDeliverable!==null||row.acceptedAssignment!==null||row.pendingInvitation!==null))ctx.addIssue({code:'custom',message:'Summary-only task cannot disclose private planning, delivery or commitment records'})
})
export const ResearchWorkspaceSummary = z.strictObject({
  total: z.number().int().nonnegative(), unassigned: z.number().int().nonnegative(),
  awaitingAcceptance: z.number().int().nonnegative(), active: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(), awaitingReview: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(), cancelled: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(), pendingMyReview: z.number().int().nonnegative(), pendingMyInvitation: z.number().int().nonnegative(),
})
export const PlanTaskLinks = z.strictObject({planId: Id, planVersion: Version, steps: z.array(z.strictObject({itemId: Id, taskId: Id.nullable(), task: z.union([Task, TaskSummary]).nullable()}).refine(step=>step.taskId===(step.task?.id??null),'Task ID must match the authorized task projection')).max(100)})
export type ResearchWorkspaceRow = z.infer<typeof ResearchWorkspaceRow>
export type ResearchWorkspaceSummary = z.infer<typeof ResearchWorkspaceSummary>
export type PlanTaskLinks = z.infer<typeof PlanTaskLinks>
const empty=z.strictObject({}), id=z.strictObject({id:Id})
const snapshotQuery=z.strictObject({snapshot:z.string().min(1).max(2048).optional()})
function get<Q extends z.ZodType,R extends z.ZodType>(path:string,query:Q,response:R,rule:string){return {method:'GET' as const,path:'/api/v1'+path,stage:'B2a' as const,status:200,access:'session',implemented:true,idempotent:false,rule,request:z.strictObject({params:id,query,headers:empty,body:z.null()}),response,errors:ErrorResponse,errorStatuses:errorStatus}}
export const researchTeamRoutes={
  planTasks:get('/plans/{id}/tasks',snapshotQuery,z.strictObject({data:PlanTaskLinks,snapshot:Snapshot}), 'Current plan owner and source authorization. Link persisted item IDs to currently authorized tasks; drafts and unavailable tasks return null, never title matching. No task creation on reads.'),
  researchWorkspace:get('/labs/{id}/research-workspace',snapshotQuery.extend({scope:z.enum(['lab','mine']).default('lab'),cursor:z.string().min(1).max(2048).optional(),limit:z.number().int().min(1).max(100).default(30)}),z.strictObject({data:z.array(ResearchWorkspaceRow).max(100),summary:ResearchWorkspaceSummary,nextCursor:z.string().nullable(),snapshot:Snapshot}), 'Current lab and existing task ACL first. Summary covers the whole authorized scope independently of paging. Private plan goals owner-only; commitments and deliveries full-access only. Accepted counts current latest human-reviewed deliverable, not run success; overdue uses confirmed hard or committed dates in their timezone.'),
} as const
