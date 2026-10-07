import { z } from 'zod'
import { Id,Title,Version,Instant,Timezone,ObjectRef,ErrorResponse,errorStatus,data,page } from './models.js'

export const PersonalMemoryStatus=z.enum(['confirmed','candidate','revoked'])
export const PersonalMemoryInput=z.strictObject({topic:z.string().trim().min(1).max(80),content:z.string().trim().min(1).max(1000),scope:z.enum(['general','topic']).default('general')})
export const PersonalMemory=z.strictObject({id:Id,topic:z.string().min(1).max(80),content:z.string().min(1).max(1000),scope:z.enum(['general','topic']),status:PersonalMemoryStatus,origin:z.enum(['explicit','feedback','inferred']),sourceMessageId:Id.nullable(),version:Version,createdAt:Instant,updatedAt:Instant,allowedActions:z.array(z.enum(['edit','confirm','revoke'])).max(3)})
export const QuietHours=z.strictObject({start:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),end:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)}).refine(v=>v.start!==v.end,'Quiet interval must not be a whole day')
export const PersonalMemorySettings=z.strictObject({candidateLearning:z.boolean(),timeZone:Timezone,quietHours:QuietHours.nullable(),version:Version})
export const FollowupRecurrence=z.discriminatedUnion('frequency',[
 z.strictObject({frequency:z.literal('daily')}),
 z.strictObject({frequency:z.literal('weekly'),weekdays:z.array(z.number().int().min(1).max(7)).min(1).max(7).refine(v=>new Set(v).size===v.length,'Duplicate weekday')}),
])
export const FollowupExecution=z.strictObject({kind:z.literal('agent'),contactId:Id,budget:z.strictObject({maxTokens:z.number().int().min(1000).max(16000),maxSeconds:z.number().int().min(10).max(120)}).default({maxTokens:4000,maxSeconds:90})})
export const FollowupDelivery=z.enum(['scheduled','due','recorded','im_sent','im_uncertain','im_denied'])
export const PersonalFollowupRun=z.strictObject({id:Id,scheduledAt:Instant,messageId:Id.nullable(),turnId:Id.nullable(),outputMessageId:Id.nullable(),status:z.enum(['recorded','queued','running','waiting_input','succeeded','unavailable','failed','interrupted','cancelled','skipped']),failure:z.string().max(200).nullable(),delivery:FollowupDelivery})
export const PersonalFollowupInput=z.strictObject({title:Title,body:z.string().trim().min(1).max(1000),dueAt:Instant,timeZone:Timezone,task:ObjectRef.nullable().default(null),quietHours:QuietHours.nullable().default(null),recurrence:FollowupRecurrence.nullable().default(null),execution:FollowupExecution.nullable().default(null)})
export const PersonalFollowup=PersonalFollowupInput.extend({id:Id,status:z.enum(['active','paused','completed','cancelled']),nextDeliveryAt:Instant,messageId:Id.nullable(),delivery:FollowupDelivery,version:Version,createdAt:Instant,updatedAt:Instant,lastRun:PersonalFollowupRun.nullable().default(null),allowedActions:z.array(z.enum(['edit','pause','resume','complete','cancel'])).max(5)})
export const PersonalMemoryReceipt=z.strictObject({operation:z.enum(['saved','corrected','forgotten','candidate','clarify']),memoryId:Id.nullable(),topic:z.string().nullable(),status:PersonalMemoryStatus.nullable(),version:z.number().int().nonnegative(),question:z.string().nullable()})
export const PersonalFollowupReceipt=z.strictObject({operation:z.enum(['created','clarify']),followupId:Id.nullable(),dueAt:Instant.nullable(),timeZone:Timezone.nullable(),question:z.string().nullable()})
export const PersonalAssistantReceipt=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('work_task'),taskId:Id,conversationId:Id.nullable(),status:z.enum(['proposed','ready'])}),
 z.strictObject({kind:z.literal('delegate'),contactId:Id,conversationId:Id,displayName:Title,reused:z.boolean(),messageId:Id,turnId:Id,status:z.enum(['queued','unavailable']),budget:z.strictObject({maxTokens:z.number().int().positive(),maxSeconds:z.number().int().positive()})}),
 z.strictObject({kind:z.literal('collaborate'),planId:Id,actionIds:z.array(Id).min(1).max(5)}),
])
export type PersonalMemory=z.infer<typeof PersonalMemory>
export type PersonalFollowup=z.infer<typeof PersonalFollowup>
export type PersonalFollowupRun=z.infer<typeof PersonalFollowupRun>
export type FollowupRecurrence=z.infer<typeof FollowupRecurrence>
export type PersonalMemorySettings=z.infer<typeof PersonalMemorySettings>
export type PersonalAssistantReceipt=z.infer<typeof PersonalAssistantReceipt>
export type PersonalMemoryReceipt=z.infer<typeof PersonalMemoryReceipt>
export type PersonalFollowupReceipt=z.infer<typeof PersonalFollowupReceipt>
const empty=z.strictObject({}),id=z.strictObject({id:Id}),headers=z.strictObject({'Idempotency-Key':z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)}),pagination=z.strictObject({cursor:z.string().max(2048).optional(),limit:z.number().int().min(1).max(100).default(30)})
function route<P extends z.ZodType,Q extends z.ZodType,B extends z.ZodType,R extends z.ZodType>(method:'GET'|'POST',path:string,params:P,query:Q,body:B,response:R,status:number,rule:string){return {method,path:'/api/v1'+path,stage:'CHAT1' as const,implemented:true,access:'session',status,rule,idempotent:method!=='GET',request:z.strictObject({params,query,headers:method==='GET'?empty:headers,body}),response,errors:ErrorResponse,errorStatuses:errorStatus}}
export const personalAssistantRoutes={
 personalMemorySettings:route('GET','/me/memory-settings',empty,empty,z.null(),data(PersonalMemorySettings),200,'Current member only; candidate learning defaults false; timezone defaults Asia/Shanghai and is visible. No model call.'),
 updatePersonalMemorySettings:route('POST','/me/memory-settings',empty,empty,z.strictObject({expectedVersion:Version,candidateLearning:z.boolean(),timeZone:Timezone,quietHours:QuietHours.nullable()}),data(PersonalMemorySettings),200,'Owner versioned learning/timezone/quiet policy; fences local personal memory consumers. No model required.'),
 personalMemories:route('GET','/me/memories',empty,pagination.extend({status:z.enum(['confirmed','candidate','revoked','all']).default('all')}),z.null(),page(PersonalMemory),200,'Current member memories only, separate from Agent and conversation memory; candidates are not applied until confirmed.'),
 personalMemory:route('GET','/me/memories/{id}',id,empty,z.null(),data(PersonalMemory),200,'Current member only, including immutable revoked record; no cross-owner discovery.'),
 createPersonalMemory:route('POST','/me/memories',empty,empty,PersonalMemoryInput,data(PersonalMemory),201,'Explicit owner save; correct current confirmed topic atomically instead of duplicating preference; max50 active confirmed records. No model required.'),
 updatePersonalMemory:route('POST','/me/memories/{id}',id,empty,PersonalMemoryInput.extend({expectedVersion:Version}),data(PersonalMemory),200,'Owner versioned correction; retains revision/source trail, supersedes old confirmed same-topic preference and fences pending local turns.'),
 decidePersonalMemory:route('POST','/me/memories/{id}/decision',id,empty,z.strictObject({expectedVersion:Version,decision:z.enum(['confirm','revoke'])}),data(PersonalMemory),200,'Candidate confirm or active revoke; revoked entries never enter subsequent prompts. Idempotent explicit owner action.'),
 personalFollowups:route('GET','/me/followups',empty,pagination.extend({status:z.enum(['active','paused','completed','cancelled','all']).default('all')}),z.null(),page(PersonalFollowup),200,'Owner reminders and scheduled local Agent jobs; daily/weekly wall time in explicit timezone. Canonical recorded and actual IM sent/uncertain are distinct. No device push claim.'),
 personalFollowupRuns:route('GET','/me/followups/{id}/runs',id,pagination,z.null(),page(PersonalFollowupRun),200,'Owner only; persistent scheduled occurrences newest first, actual turn status/output and delivery. No automatic retry of uncertain or failed model calls.'),
 personalFollowup:route('GET','/me/followups/{id}',id,empty,z.null(),data(PersonalFollowup),200,'Owner only; current task ACL and current canonical/IM outbox state rechecked.'),
 createPersonalFollowup:route('POST','/me/followups',empty,empty,PersonalFollowupInput,data(PersonalFollowup),201,'Explicit future time, null/daily/weekly recurrence, optional owned local Agent execution and fixed per-run budget. Reminder needs no model; execution rechecks authority/model. No external agents, arbitrary tools or local filesystem grant. Missed dates coalesce into one occurrence; no catchup storm.'),
 updatePersonalFollowup:route('POST','/me/followups/{id}',id,empty,PersonalFollowupInput.extend({expectedVersion:Version}),data(PersonalFollowup),200,'Owner versioned schedule edit; cancels old queued/running executions, retains history, never repeats an already-recorded one-time reminder.'),
 changePersonalFollowup:route('POST','/me/followups/{id}/state',id,empty,z.strictObject({expectedVersion:Version,action:z.enum(['pause','resume','complete','cancel'])}),data(PersonalFollowup),200,'Owner versioned transition; pause/complete/cancel fence queued/running jobs. Resume recurring jobs at next future wall time, without replaying missed occurrences.'),
} as const
