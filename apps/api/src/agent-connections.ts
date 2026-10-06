import { createHmac } from 'node:crypto'
import { AgentConnection, AgentConnectionProbe, AgentConnectionState, type Contact, type RequestFor } from '@research-agent-platform/contracts'
import type { ChatService, ChatRequest } from './chat.js'
import type { ModelResult } from './execution-worker.js'
import { signingKey } from './auth.js'
import { encrypt,decrypt,masterAvailable } from './lab-ai-settings.js'
import { fail } from './errors.js'
import { externalEndpoint } from './external-agent-client.js'

type Row={contact_id:string;owner_id:string;protocol:'chat_completions';endpoint:string;model:string;configured:number;enabled:number;allow_accepted_contacts:number;encrypted_api_key:string|null;version:number;updated_at:string;last_probe_json:string|null}
export const connectionCommands=['agentConnection','updateAgentConnection','disconnectAgentConnection','probeAgentConnection'] as const
export function connectionRow(s:ChatService,id:string){return s.db.prepare('SELECT * FROM agent_connections WHERE contact_id=?').get(id) as Row|undefined}
export function ownedSpecialist(s:ChatService,id:string){const c=s.contact(id);if(c.identity.kind!=='personal_agent'||c.identity.ownerMemberId!==s.c.actor.id||c.profile.role!=='specialist')fail('FORBIDDEN');return c}
const scope=(row:Pick<Row,'owner_id'|'contact_id'|'endpoint'>)=>`external-agent:${row.owner_id}:${row.contact_id}:${row.endpoint}`
export function connectionState(s:ChatService,id:string){
 ownedSpecialist(s,id);const row=connectionRow(s,id)
 return AgentConnectionState.parse({version:row?.version??0,connection:row?.configured===1?AgentConnection.parse({contactId:id,protocol:row.protocol,endpoint:row.endpoint,model:row.model,enabled:row.enabled===1,allowAcceptedContacts:row.allow_accepted_contacts===1,hasApiKey:!!row.encrypted_api_key,version:row.version,updatedAt:row.updated_at}):null,lastProbe:row?.last_probe_json?JSON.parse(row.last_probe_json):null})
}
export function externalContact(s:ChatService,contact:Contact){
 const row=connectionRow(s,contact.id);if(row?.configured!==1)return contact
 const callerAllowed=contact.identity.kind==='personal_agent'&&(contact.identity.ownerMemberId===s.c.actor.id||(row.allow_accepted_contacts===1&&contact.relationship.status==='accepted'))
 const probe=row.last_probe_json?AgentConnectionProbe.parse(JSON.parse(row.last_probe_json)):null
 contact.agentRuntime={kind:'external',protocol:'chat_completions',serviceOrigin:new URL(row.endpoint).origin,scope:'current_message',credentialPayer:'agent_owner',allowAcceptedContacts:row.allow_accepted_contacts===1,callerAllowed,requiresConsent:true,verification:probe?.version===row.version&&probe.status!=='uncertain'?probe.status==='passed'?'passed':'failed':'unverified'}
 contact.availability=!callerAllowed?{status:'unavailable',reason:'owner_authorization_required'}:row.enabled!==1?{status:'disabled',reason:null}:!s.config.aiEnabled?{status:'unavailable',reason:'platform_disabled'}:!row.encrypted_api_key||!masterAvailable(s.config)?{status:'unavailable',reason:'missing_credentials'}:{status:'available',reason:null}
 return contact
}
export function externalForChat(s:ChatService,id:string){
 const contact=s.contact(id),row=connectionRow(s,id);if(row?.configured!==1)return null
 if(!contact.agentRuntime?.callerAllowed)fail('FORBIDDEN')
 if(contact.availability.status!=='available')fail('MODEL_UNAVAILABLE')
 return {...row,apiKey:decrypt(s.config,scope(row),row.encrypted_api_key!)}
}
export function chatModelFingerprint(s:ChatService,id:string,local:string){const row=connectionRow(s,id);return row?.configured===1?`external:${id}:${row.version}`:local}
export function handleConnection(s:ChatService,name:typeof connectionCommands[number],req:ChatRequest){
 const id=req.params.id!;ownedSpecialist(s,id)
 if(name==='agentConnection')return {data:connectionState(s,id)}
 const row=connectionRow(s,id),body=req.body as RequestFor<'updateAgentConnection'>['body']
 if((row?.version??0)!==body.expectedVersion)fail('VERSION_CONFLICT')
 if(name==='disconnectAgentConnection'){
  if(!row)fail('NOT_FOUND');s.db.prepare('UPDATE agent_connections SET configured=0,enabled=0,encrypted_api_key=NULL,version=version+1,updated_at=?,last_probe_json=NULL WHERE contact_id=?').run(new Date().toISOString(),id)
 }else{
  try{externalEndpoint(body.endpoint)}catch{fail('EXTERNAL_ENDPOINT_UNSAFE')}
  if(row?.encrypted_api_key&&row.endpoint!==body.endpoint&&!body.apiKey&&!body.removeApiKey)fail('VALIDATION_ERROR')
  if(body.removeApiKey&&(body.apiKey||body.enabled))fail('VALIDATION_ERROR')
  if(body.apiKey&&!/^[\x21-\x7e]{8,512}$/.test(body.apiKey))fail('VALIDATION_ERROR')
  const target={owner_id:s.c.actor.id,contact_id:id,endpoint:body.endpoint},cipher=body.removeApiKey?null:body.apiKey?encrypt(s.config,scope(target),body.apiKey):row?.encrypted_api_key??null
  if(body.enabled&&(!s.config.aiEnabled||!cipher||!masterAvailable(s.config)))fail('MODEL_UNAVAILABLE')
  if(cipher)decrypt(s.config,scope(target),cipher)
  s.db.prepare('INSERT INTO agent_connections VALUES (?,?,\'chat_completions\',?,?,1,?,?,?,?,?,NULL) ON CONFLICT(contact_id) DO UPDATE SET endpoint=excluded.endpoint,model=excluded.model,configured=1,enabled=excluded.enabled,allow_accepted_contacts=excluded.allow_accepted_contacts,encrypted_api_key=excluded.encrypted_api_key,version=excluded.version,updated_at=excluded.updated_at,last_probe_json=NULL').run(id,s.c.actor.id,body.endpoint,body.model,body.enabled?1:0,body.allowAcceptedContacts?1:0,cipher,(row?.version??0)+1,new Date().toISOString())
 }
 return {data:connectionState(s,id)}
}
export function beginConnectionProbe(s:ChatService,req:ChatRequest){
 const id=req.params.id!;ownedSpecialist(s,id);const row=connectionRow(s,id),version=(req.body as {expectedVersion:number}).expectedVersion
 if(!row||row.configured!==1)fail('NOT_FOUND');if(row.version!==version)fail('VERSION_CONFLICT')
 const fingerprint=createHmac('sha256',signingKey(s.db)).update(JSON.stringify(req)).digest('hex'),key=req.headers['Idempotency-Key']!
 const old=s.db.prepare('SELECT request_hash,response_json FROM idempotency_results WHERE actor_id=? AND command=? AND resource_id=? AND key=?').get(s.c.actor.id,'probeAgentConnection',id,key)
 if(old){if(old.request_hash!==fingerprint)fail('IDEMPOTENCY_CONFLICT');return {cached:JSON.parse(String(old.response_json))}}
 if(Number(s.db.prepare("SELECT count(*) n FROM idempotency_results WHERE actor_id=? AND command='probeAgentConnection' AND created_at>?").get(s.c.actor.id,new Date(Date.now()-60000).toISOString())!.n)>=5)fail('RATE_LIMITED')
 if(!row.encrypted_api_key||!s.config.aiEnabled||!masterAvailable(s.config))fail('MODEL_UNAVAILABLE')
 const result=AgentConnectionProbe.parse({contactId:id,version,status:'uncertain',failure:'EXTERNAL_OUTCOME_UNCERTAIN',usage:null,at:new Date().toISOString()})
 s.db.prepare('INSERT INTO idempotency_results VALUES (?,?,?,?,?,?,?,?)').run(s.c.actor.id,'probeAgentConnection',id,key,fingerprint,JSON.stringify({data:result}),200,result.at)
 return {job:{id,version,key,apiKey:decrypt(s.config,scope(row),row.encrypted_api_key),endpoint:row.endpoint,model:row.model}}
}
export function finishConnectionProbe(s:ChatService,req:ChatRequest,result:ModelResult){
 const id=req.params.id!;ownedSpecialist(s,id);const row=connectionRow(s,id)!
 if(!row||row.version!==(req.body as {expectedVersion:number}).expectedVersion)fail('VERSION_CONFLICT')
 const uncertain=result.failure&&['EXTERNAL_TIMEOUT','USAGE_UNCERTAIN','INTERRUPTED','EXTERNAL_SERVICE_FAILED'].includes(result.failure)&&(result.inputTokens===null||result.outputTokens===null)
 const value=AgentConnectionProbe.parse({contactId:id,version:row.version,status:uncertain?'uncertain':result.failure?'failed':'passed',failure:result.failure,usage:{inputTokens:result.inputTokens,outputTokens:result.outputTokens,elapsedMs:result.elapsedMs,cost:null,currency:null},at:new Date().toISOString()})
 s.db.prepare('UPDATE agent_connections SET last_probe_json=? WHERE contact_id=?').run(JSON.stringify(value),id)
 s.db.prepare('UPDATE idempotency_results SET response_json=? WHERE actor_id=? AND command=? AND resource_id=? AND key=?').run(JSON.stringify({data:value}),s.c.actor.id,'probeAgentConnection',id,req.headers['Idempotency-Key']!)
 return {data:value}
}
