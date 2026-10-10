import type {DatabaseSync} from 'node:sqlite'
import type {Actor} from './auth.js'
import type {Config} from './config.js'
import {isLabManager} from './invite-management.js'
import {personalModelRuntime} from './personal-models.js'

// New private planning uses the requester's own model. Legacy compatibility is
// limited to the manager who is authorized to maintain the lab configuration;
// ordinary members never inherit an administrator's key for private planning.
export function planningModelRuntime(db:DatabaseSync,actor:Actor,config:Config){
  const runtime=personalModelRuntime(db,actor,config)
  return {...runtime,enabled:Boolean(runtime.enabled&&(runtime.source==='personal'||isLabManager(db,actor)))}
}
export type PlanningModelRuntime=ReturnType<typeof planningModelRuntime>
export type PlanningModelBinding=Pick<PlanningModelRuntime,'source'|'provider'|'model'|'fingerprint'>
