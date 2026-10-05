import { createHmac, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { PersonalModelConfiguration, PersonalModelSettings } from '@research-agent-platform/contracts'
import type { RequestFor, ModelProvider } from '@research-agent-platform/contracts'
import type { z } from 'zod'
import type { Actor } from './auth.js'
import { signingKey } from './auth.js'
import { encrypt, decrypt, masterAvailable, labAiRuntime, labApiKey } from './lab-ai-settings.js'
import type { Config } from './config.js'
import { fail } from './errors.js'

type Provider=z.infer<typeof ModelProvider>
type Row={id:string;member_id:string;name:string;provider:Provider;model:string;enabled:number;encrypted_api_key:string|null;version:number;created_at:string;updated_at:string}
const baseUrls={deepseek:'https://api.deepseek.com/anthropic',qwen:'https://dashscope.aliyuncs.com/compatible-mode/v1',doubao:'https://ark.cn-beijing.volces.com/api/v3'} as const
export const personalModelCommands=['personalModels','createPersonalModel','updatePersonalModel','deletePersonalModel','defaultPersonalModel'] as const
type Command=typeof personalModelCommands[number]
const state=(db:DatabaseSync,actor:Actor)=>db.prepare('SELECT * FROM personal_model_settings WHERE member_id=?').get(actor.id)
function owned(db:DatabaseSync,actor:Actor,id:string){const row=db.prepare('SELECT * FROM personal_model_configurations WHERE id=? AND member_id=?').get(id,actor.id) as Row|undefined;if(!row)fail('NOT_FOUND');return row}
const secretScope=(actor:Actor,id:string,provider:Provider)=>`personal-model:${actor.id}:${id}:${provider}`
function view(db:DatabaseSync,actor:Actor,row:Row){return PersonalModelConfiguration.parse({id:row.id,name:row.name,provider:row.provider,model:row.model,baseUrl:baseUrls[row.provider],enabled:row.enabled===1,hasApiKey:!!row.encrypted_api_key,isDefault:state(db,actor)?.default_configuration_id===row.id,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at})}
export function personalModels(db:DatabaseSync,actor:Actor,config:Config){
 const current=state(db,actor),legacy=!db.prepare('SELECT 1 FROM personal_spaces WHERE lab_id=?').get(actor.labId)&&labAiRuntime(db,actor.labId,config).enabled
 return PersonalModelSettings.parse({configurations:(db.prepare('SELECT * FROM personal_model_configurations WHERE member_id=? ORDER BY created_at,id').all(actor.id) as Row[]).map(row=>view(db,actor,row)),version:current?.version??0,platformEnabled:config.aiEnabled&&masterAvailable(config),defaultConfigurationId:current?.default_configuration_id??null,source:current?'personal':legacy?'legacy_lab':'unconfigured',legacyLabAvailable:legacy})
}
export function personalModelRuntime(db:DatabaseSync,actor:Actor,config:Config){
 const current=state(db,actor)
 if(current){
  const row=current.default_configuration_id?owned(db,actor,String(current.default_configuration_id)):null
  return {source:'personal' as const,enabled:config.aiEnabled&&masterAvailable(config)&&row?.enabled===1&&!!row.encrypted_api_key,disabled:row?.enabled===0,provider:row?.provider??'deepseek' as Provider,model:row?.model??config.model,fingerprint:`personal:${current.version}:${row?.id??''}:${row?.version??0}`,configurationId:row?.id??null}
 }
 const legacy=labAiRuntime(db,actor.labId,config),isolated=!!db.prepare('SELECT 1 FROM personal_spaces WHERE lab_id=?').get(actor.labId),version=db.prepare('SELECT version FROM lab_ai_settings WHERE lab_id=?').get(actor.labId)?.version??0
 return {source:'legacy_lab' as const,enabled:!isolated&&legacy.enabled,disabled:false,provider:'deepseek' as Provider,model:legacy.model,fingerprint:`lab:${actor.labId}:${version}:${isolated}`,configurationId:null}
}
export function personalModelKey(db:DatabaseSync,actor:Actor,config:Config){
 const runtime=personalModelRuntime(db,actor,config);if(!runtime.enabled)fail('MODEL_UNAVAILABLE')
 if(runtime.source==='legacy_lab')return labApiKey(db,actor.labId,config)
 const row=owned(db,actor,runtime.configurationId!);return decrypt(config,secretScope(actor,row.id,row.provider),row.encrypted_api_key!)
}
function bump(db:DatabaseSync,actor:Actor){db.prepare('INSERT INTO personal_model_settings VALUES (?,NULL,1) ON CONFLICT(member_id) DO UPDATE SET version=version+1').run(actor.id)}
export function runPersonalModel(db:DatabaseSync,actor:Actor,name:Command,input:RequestFor<Command>,config:Config):unknown {
 if(name==='personalModels')return {data:personalModels(db,actor,config)}
 const body=input.body as any,id=(input.params as {id?:string}).id,key=input.headers['Idempotency-Key']!,resource=id??actor.id
 const fingerprint=createHmac('sha256',signingKey(db)).update(JSON.stringify({actor:actor.id,name,id,body})).digest('hex')
 const prior=db.prepare('SELECT request_hash,response_json FROM idempotency_results WHERE actor_id=? AND command=? AND resource_id=? AND key=?').get(actor.id,name,resource,key)
 if(prior){if(prior.request_hash!==fingerprint)fail('IDEMPOTENCY_CONFLICT');const old=JSON.parse(String(prior.response_json));return {data:name==='createPersonalModel'||name==='updatePersonalModel'?view(db,actor,owned(db,actor,old.data.id)):personalModels(db,actor,config)}}
 if(id)owned(db,actor,id)
 let response:unknown
 if(name==='createPersonalModel'||name==='updatePersonalModel'){
  const old=id?owned(db,actor,id):undefined
  if(old&&old.version!==body.expectedVersion)fail('VERSION_CONFLICT')
  if(!old&&Number(db.prepare('SELECT count(*) n FROM personal_model_configurations WHERE member_id=?').get(actor.id)!.n)>=20)fail('RATE_LIMITED')
  if(body.removeApiKey&&(body.apiKey||body.enabled))fail('VALIDATION_ERROR')
  // Changing vendors must never silently transmit a credential to a new host.
  if(old&&old.provider!==body.provider&&old.encrypted_api_key&&!body.apiKey&&!body.removeApiKey)fail('VALIDATION_ERROR')
  if(body.apiKey&&!/^[\x21-\x7e]{8,512}$/.test(body.apiKey))fail('VALIDATION_ERROR')
  if(body.enabled&&!config.aiEnabled)fail('MODEL_UNAVAILABLE')
  const configId=old?.id??randomUUID(),cipher=body.removeApiKey?null:body.apiKey?encrypt(config,secretScope(actor,configId,body.provider),body.apiKey):old?.encrypted_api_key??null
  if(body.enabled&&!cipher)fail('MODEL_UNAVAILABLE')
  if(body.enabled)decrypt(config,secretScope(actor,configId,body.provider),cipher!)
  const at=new Date().toISOString(),first=!state(db,actor)
  if(old)db.prepare('UPDATE personal_model_configurations SET name=?,provider=?,model=?,enabled=?,encrypted_api_key=?,version=version+1,updated_at=? WHERE id=?').run(body.name,body.provider,body.model,body.enabled?1:0,cipher,at,configId)
  else db.prepare('INSERT INTO personal_model_configurations VALUES (?,?,?,?,?,?,?,1,?,?)').run(configId,actor.id,body.name,body.provider,body.model,body.enabled?1:0,cipher,at,at)
  bump(db,actor)
  if(first&&body.enabled&&cipher)db.prepare('UPDATE personal_model_settings SET default_configuration_id=? WHERE member_id=?').run(configId,actor.id)
  response={data:view(db,actor,owned(db,actor,configId))}
 } else if(name==='defaultPersonalModel'){
  if(Number(state(db,actor)?.version??0)!==body.expectedVersion)fail('VERSION_CONFLICT')
  if(body.configurationId){const row=owned(db,actor,body.configurationId);if(!config.aiEnabled||row.enabled!==1||!row.encrypted_api_key)fail('MODEL_UNAVAILABLE');decrypt(config,secretScope(actor,row.id,row.provider),row.encrypted_api_key)}
  bump(db,actor);db.prepare('UPDATE personal_model_settings SET default_configuration_id=? WHERE member_id=?').run(body.configurationId,actor.id);response={data:personalModels(db,actor,config)}
 } else {
  const row=owned(db,actor,id!);if(row.version!==body.expectedVersion)fail('VERSION_CONFLICT')
  db.prepare('UPDATE personal_model_settings SET default_configuration_id=NULL WHERE member_id=? AND default_configuration_id=?').run(actor.id,id!);db.prepare('DELETE FROM personal_model_configurations WHERE id=? AND member_id=?').run(id!,actor.id);bump(db,actor);response={data:personalModels(db,actor,config)}
 }
 db.prepare('INSERT INTO idempotency_results VALUES (?,?,?,?,?,?,?,?)').run(actor.id,name,resource,key,fingerprint,JSON.stringify(response),name==='createPersonalModel'?201:200,new Date().toISOString())
 return response
}
