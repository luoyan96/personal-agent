import { AgentTurnProgress } from '@research-agent-platform/contracts'
import type { ChatService, TurnInput } from './chat.js'
import { instant } from './ai.js'
import { fail } from './errors.js'

export type ContinuousInput = {
  messageIds:string[]; firstAt:number; lastAt:number; dueAt:number;
  revision:number; text:string; supersededBy?:string; structuredSuppressed?:boolean; updatedAt:string;
}
// Process-local cancellation is only a latency optimization. Every write and
// final commit also checks the durable SQLite lease/fence across processes.
const active = new Map<string,AbortController>()
export function registerChatCall(id:string,controller:AbortController){active.set(id,controller);return()=>{if(active.get(id)===controller)active.delete(id)}}
export function abortChatCall(id:string){active.get(id)?.abort()}
export function startContinuous(messageId:string,now=Date.now()):ContinuousInput{return {messageIds:[messageId],firstAt:now,lastAt:now,dueAt:now+1200,revision:1,text:'',updatedAt:instant()}}
export function extendContinuous(old:ContinuousInput,messageId:string,now=Date.now()):ContinuousInput{
  const lastAt=Math.max(now,old.lastAt)
  return {...old,messageIds:[...old.messageIds,messageId],lastAt,dueAt:Math.min(old.firstAt+4000,lastAt+1200),revision:old.revision+1,text:'',updatedAt:instant()}
}
export function currentTurnText(s:ChatService,turnId:string){
  const row=s.db.prepare('SELECT document,request_json FROM chat_turns WHERE id=? AND owner_id=?').get(turnId,s.c.actor.id);if(!row)fail('NOT_FOUND')
  const turn=JSON.parse(String(row.document)),input=JSON.parse(String(row.request_json)) as TurnInput
  const ids=input.continuous?.messageIds??[turn.inputMessageId]
  const messages=ids.map(id=>{const message=s.projectedMessage(id);if(message.conversationId!==turn.conversationId||message.origin!=='human'||message.senderContactId!==s.human().id||message.sequence>input.inputSequence)fail('FORBIDDEN');return message})
  // These are this batch's actual user submissions, not instructions extracted
  // from history, files, profiles, a model answer, or another user's text.
  return messages.map(message=>message.text??'').join('\n')
}
export function supersedeTurn(s:ChatService,id:string,replacement?:string){
  const row=s.db.prepare('SELECT * FROM chat_turns WHERE id=? AND owner_id=?').get(id,s.c.actor.id);if(!row)return
  const input=JSON.parse(String(row.request_json)) as TurnInput,turn=s.materializedTurn(row)
  if(!['queued','running','waiting_input'].includes(turn.status))return
  if(input.continuous){input.continuous={...input.continuous,text:'',revision:input.continuous.revision+1,updatedAt:instant(),...(replacement?{supersededBy:replacement}:{})};s.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=?').run(JSON.stringify(input),id)}
  turn.status='cancelled';turn.failure='INPUT_CHANGED';turn.version++;turn.updatedAt=instant();s.saveTurn(turn)
  s.db.prepare('UPDATE chat_turns SET fence=fence+1,lease_owner=NULL,lease_until=NULL WHERE id=?').run(id)
  abortChatCall(id)
}
export function turnProgress(s:ChatService,id:string){
  const turn=s.turn(id),row=s.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(id)!,input=JSON.parse(String(row.request_json)) as TurnInput,c=input.continuous
  let phase:'queued'|'streaming'|'final'|'superseded'|'stopped'=turn.status==='succeeded'||turn.status==='waiting_input'&&turn.outputMessageId?'final':turn.status==='queued'?'queued':turn.status==='running'?'streaming':'stopped'
  if(c?.supersededBy)phase='superseded'
  let authorized=true
  try{s.checkTurnInput(id);currentTurnText(s,id)}catch{authorized=false;if(phase!=='superseded')phase='stopped'}
  const final=authorized&&phase==='final'&&turn.outputMessageId?s.projectedMessage(turn.outputMessageId):null
  return AgentTurnProgress.parse({turnId:id,conversationId:turn.conversationId,inputMessageIds:c?.messageIds??[turn.inputMessageId],revision:(c?.revision??0)+turn.version,phase,text:authorized&&phase==='streaming'?c?.text??'':final?.text??'',finalMessageId:final?.id??null,supersededByTurnId:c?.supersededBy??null,updatedAt:c&&c.updatedAt>turn.updatedAt?c.updatedAt:turn.updatedAt})
}
export function saveChatDelta(s:ChatService,id:string,fence:number,text:string){
  const row=s.db.prepare('SELECT * FROM chat_turns WHERE id=? AND owner_id=?').get(id,s.c.actor.id)
  if(!row||row.status!=='running'||row.fence!==fence)return false
  const {input}=s.checkTurnInput(id)
  if(!input.continuous||text.length>8000)return false
  input.continuous={...input.continuous,text,revision:input.continuous.revision+1,updatedAt:instant()}
  s.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=? AND fence=? AND status=\'running\'').run(JSON.stringify(input),id,fence)
  return true
}
