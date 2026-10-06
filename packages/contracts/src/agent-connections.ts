import { z } from 'zod'
import { Id, Version, Instant, ModelUsage, ErrorResponse, errorStatus, data } from './models.js'
import { Contact, Conversation, ContactProfileInput } from './chat.js'
import { ProviderModel } from './personal-models.js'

// A portable profile grants no remote endpoint, tools, private memory or identity.
export const AgentProfileDocument = z.strictObject({ format: z.literal('research-agent-profile/v1'), profile: ContactProfileInput })
export const ExternalAgentEndpoint = z.string().min(1).max(512).refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && (!url.port || url.port === '443') && !url.username && !url.password && !url.search && !url.hash && /^\/[A-Za-z0-9/_-]*chat\/completions$/.test(url.pathname) } catch { return false }
}, 'HTTPS chat-completions endpoint required')
export const AgentConnectionInput = z.strictObject({ expectedVersion: z.number().int().nonnegative(), protocol: z.literal('chat_completions'), endpoint: ExternalAgentEndpoint, model: ProviderModel, enabled: z.boolean(), allowAcceptedContacts: z.boolean().default(false), apiKey: z.string().min(8).max(512).optional(), removeApiKey: z.boolean().optional() })
export const AgentConnection = z.strictObject({ contactId: Id, protocol: z.literal('chat_completions'), endpoint: ExternalAgentEndpoint, model: ProviderModel, enabled: z.boolean(), allowAcceptedContacts: z.boolean(), hasApiKey: z.boolean(), version: Version, updatedAt: Instant })
export const ExternalAgentFailure = z.enum(['EXTERNAL_ENDPOINT_UNSAFE','EXTERNAL_AUTH_FAILED','EXTERNAL_SERVICE_FAILED','EXTERNAL_RESPONSE_INVALID','EXTERNAL_TIMEOUT','OUTPUT_LIMIT','USAGE_UNCERTAIN','EXTERNAL_OUTCOME_UNCERTAIN','INTERRUPTED'])
export const AgentConnectionProbe = z.strictObject({ contactId: Id, version: Version, status: z.enum(['passed','failed','uncertain']), failure: ExternalAgentFailure.nullable(), usage: ModelUsage.nullable(), at: Instant })
export const AgentConnectionState = z.strictObject({ connection: AgentConnection.nullable(), version: z.number().int().nonnegative(),lastProbe:AgentConnectionProbe.nullable() })
export type AgentConnection = z.infer<typeof AgentConnection>
export type AgentConnectionProbe = z.infer<typeof AgentConnectionProbe>
export type ExternalAgentFailure = z.infer<typeof ExternalAgentFailure>
const empty = z.strictObject({}), id = z.strictObject({ id: Id }), version = z.strictObject({ expectedVersion: Version })
const headers = z.strictObject({ 'Idempotency-Key': z.string().regex(/^[A-Za-z0-9_-]{16,128}$/) })
function route<P extends z.ZodType,B extends z.ZodType,R extends z.ZodType>(method:'GET'|'POST',path:string,params:P,body:B,response:R,status:number,rule:string) { return { method,path:`/api/v1${path}`,stage:'CHAT1' as const,implemented:true,access:'session',status,rule,idempotent:method!=='GET',request:z.strictObject({params,query:empty,headers:method==='GET'?empty:headers,body}),response,errors:ErrorResponse,errorStatuses:errorStatus } }
export const agentIntegrationRoutes = {
  importAgentProfile: route('POST','/chat/agents/import',empty,AgentProfileDocument,data(z.strictObject({contact:Contact,conversation:Conversation,reused:z.boolean(),mode:z.literal('profile_only')})),201,'Owner profile JSON only. Exact four-field existing local specialist is reused; otherwise create an owned specialist and canonical direct atomically. No private memory, credentials, external connection, tools or capability hosting imported; max20 specialists. Idempotent replay returns authorized current identities.'),
  exportAgentProfile: route('GET','/chat/agents/{id}/export',id,z.null(),data(AgentProfileDocument),200,'Owned specialist profile only, no secret, endpoint, memory, account identity or executable capability. Reimporting a profile does not connect a remote service.'),
  agentConnection: route('GET','/chat/agents/{id}/connection',id,z.null(),data(AgentConnectionState),200,'Owned specialist only. Exact endpoint/model/options and hasApiKey; no key or ciphertext. Platform contacts retain legacy shape; external public runtime reveals only service origin, consent, caller policy and who pays.'),
  updateAgentConnection: route('POST','/chat/agents/{id}/connection',id,AgentConnectionInput,data(AgentConnectionState),200,'Owned specialist only, expectedVersion0 for initial configuration. Fixed chat-completions protocol, HTTPS443 public DNS pinned per request, no redirects/proxy/URL credentials. Endpoint change requires fresh key or explicit removal. Enabled configuration is not a proven connection. Default owner-only; allowAcceptedContacts explicitly authorizes accepted callers to spend this owner external credential. No fallback to another model.'),
  disconnectAgentConnection: route('POST','/chat/agents/{id}/connection/disconnect',id,version,data(AgentConnectionState),200,'Owner exact version; remove encrypted credential and remote binding, retaining monotonic configuration version. Reverts future local text chat to sender model. Fences outstanding external turns, which never fall back or auto-retry.'),
  probeAgentConnection: route('POST','/chat/agents/{id}/connection/probe',id,version,data(AgentConnectionProbe),200,'Owner explicit bounded synthetic connection check; no user history/profile/memory/file sent. Owner external account bears provider charges. Writes uncertain idempotency receipt before external I/O; process interruption or lost response never triggers an automatic second probe. Reauthorize session/owner/version after network. Passed proves only this protocol call at this time, not hosted tools or research accuracy.'),
} as const
