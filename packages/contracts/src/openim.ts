import { z } from 'zod'
import { Contact } from './chat.js'
import { Id, Instant, data, ErrorResponse, errorStatus } from './models.js'

export const openImBridgeVersion = '1.0.0' as const
export const OpenImReason = z.enum(['not_configured', 'policy_not_configured', 'backend_unreachable', 'provisioning_failed']).nullable()
export const OpenImConversation = z.strictObject({
  researchConversationId: Id, imConversationID: Id, kind: z.enum(['personal','direct','group']),
  peerUserID: Id.nullable(), groupID: Id.nullable(), pinned: z.boolean(),
  transportStatus: z.enum(['pending','ready','unavailable']), reason: OpenImReason,
})
export const OpenImContact = z.strictObject({ contact: Contact, userID: Id, transportStatus: z.enum(['pending','ready','unavailable']) })
export const OpenImSession = z.strictObject({
  bridgeVersion: z.literal(openImBridgeVersion), status: z.enum(['available','unavailable']), reason: OpenImReason,
  configuration: z.strictObject({apiAddr:z.url(),wsAddr:z.url(),serverVersion:z.literal('3.8.3'),sdkVersion:z.literal('3.8.3-patch.15.1')}).nullable(),
  user: z.strictObject({userID:Id,imToken:z.string().min(1).max(8192),platformID:z.union([z.literal(3),z.literal(5)]),expiresAt:Instant}).nullable(),
  coordinator: OpenImConversation.nullable(),
})
// Untrusted IM custom payload is only a locator. Fetch research content using the current session ACL.
export const OpenImResearchPointer = z.strictObject({ type:z.literal('research_message'),bridgeVersion:z.literal(openImBridgeVersion),conversationId:Id,messageId:Id,sequence:z.number().int().min(1) })
const empty=z.strictObject({})
function route<P extends z.ZodType,Q extends z.ZodType,B extends z.ZodType,R extends z.ZodType>(method:'GET'|'POST',path:string,params:P,query:Q,body:B,response:R,rule:string){
  return {method,path:`/api/v1/im${path}`,stage:'IM1' as const,status:200,access:'session',rule,implemented:true,idempotent:false,
    request:z.strictObject({params,query,headers:empty,body}),response,errors:ErrorResponse,errorStatuses:errorStatus}
}
const sync=data(z.strictObject({status:z.enum(['available','unavailable']),reason:OpenImReason,contactsSynced:z.number().int().min(0),conversations:z.array(OpenImConversation).max(100),truncated:z.boolean()}))
export const openImRoutes={
  imSession:route('POST','/session',empty,empty,z.strictObject({platformID:z.union([z.literal(3),z.literal(5)])}),data(OpenImSession),'Current human only; same-origin and CSRF. Real OpenIM provision/token calls occur outside SQLite transactions, followed by live session reauthorization. No admin credential or Agent token is returned; unconfigured transport is explicit unavailable.'),
  imContacts:route('GET','/contacts',empty,empty,z.null(),data(z.strictObject({contacts:z.array(OpenImContact).max(100),truncated:z.boolean()})),'Same-lab directory and actor relationships, stable server-assigned IM identities. Identity mapping grants no friend, group or task rights.'),
  imConversations:route('GET','/conversations',empty,z.strictObject({imConversationID:Id.optional()}),z.null(),data(z.strictObject({conversations:z.array(OpenImConversation).max(100),truncated:z.boolean()})),'Current joined human and live relationship authority only. IM conversation IDs do not grant access to research facts.'),
  imSync:route('POST','/sync',empty,empty,empty,sync,'Reconcile accepted contacts and current joined members with real OpenIM. No invitation/commitment acceptance inferred from IM membership. Network outside transactions and live reauthorization.'),
  imSyncConversation:route('POST','/conversations/{id}/sync',z.strictObject({id:Id}),empty,empty,data(OpenImConversation),'Ensure real transport for one currently readable research conversation; id is the research conversation ID. Private Agent directs are requester-scoped.'),
} as const
