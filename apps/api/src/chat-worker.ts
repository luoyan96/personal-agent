import {skillContext,skillSystem} from './skills.js'
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { AgentTurn, ChatActionPayload, PlanInput, Title, Text, Id, SharedContext, ModelUsage } from '@research-agent-platform/contracts'
import { ChatService } from './chat.js'
import { transaction } from './database.js'
import { serviceFor, callHarness } from './execution-worker.js'
import type { ModelCall, ModelResult } from './execution-worker.js'
import { personalModelKey, personalModelRuntime } from './personal-models.js'
import { instant } from './ai.js'
import type { Config } from './config.js'
import { ApiError } from './errors.js'
import { chatModelSystem, chatInputTokenBound, dailyChatSystem } from './chat-model-input.js'
import { fileChatSystem,fileReadMetadata,selectFileExcerpts } from './agent-files.js'
import { AgentCreationOutput, agentCreationSystem, applyAgentCreation, legacyTurnDocument } from './agent-creation.js'
import { externalForChat } from './agent-connections.js'
import { callExternalAgent, externalAgentSystem, type ExternalAgentCall } from './external-agent-client.js'
import { currentTurnText,registerChatCall,saveChatDelta } from './continuous-chat.js'
import { personalMemoryContext } from './personal-memories.js'
import { personalAssistantSystem,PersonalAssistantOutput,assistantCandidates,assistantPeople,assistantTeamAgents,rankedAssistantCandidates,assistantComplexRequest,delegateWork,AssistantBudgetError } from './personal-assistant.js'
import {createWork,recordAssistantAnswerWork} from './workspace.js'
import {recentDialogue,olderDialogue,dialogueTaskState,packDialogueLayers,saveDialogueSelection,memoryContextSources,dialogueContextSystem,type DialogueLayers} from './dialogue-context.js'

// Local model protocol: validated JSON, no model-side tools or business authority.
export const ChatModelOutput = z.strictObject({
  answer: Text, waitingInput: z.boolean(),
  group: z.strictObject({ title: Title, plan: PlanInput, contactIds: z.array(Id).min(1).max(99), sharedContext: SharedContext }).nullable(),
  actions: z.array(ChatActionPayload).max(5),
})
function service(db: DatabaseSync, owner: string, config: Config) { return new ChatService(serviceFor(db, owner, config).c, config) }
export function reconcileChat(db: DatabaseSync, config: Config) {
  for (const row of db.prepare("SELECT * FROM chat_turns WHERE status IN ('queued','running')").all()) {
    const turn = AgentTurn.parse(JSON.parse(String(row.document)))
    let failure: AgentTurn['failure'] = null
    try {
      const s = service(db, String(row.owner_id), config)
      const { group } = s.checkTurnInput(turn.id)
      if (s.joinedAgent(group,turn.agentContactId).availability.status !== 'available') failure = 'MODEL_UNAVAILABLE'
    } catch (error) { failure = error instanceof ApiError && error.code==='VERSION_CONFLICT' ? 'INPUT_CHANGED' : 'AUTHORITY_CHANGED' }
    if (!failure && row.status === 'running' && Number(row.lease_until) <= Date.now()) failure = 'LEASE_EXPIRED_USAGE_UNCERTAIN'
    if (failure) {
      turn.status = failure === 'MODEL_UNAVAILABLE' ? 'unavailable' : failure === 'LEASE_EXPIRED_USAGE_UNCERTAIN' ? 'interrupted' : 'cancelled'
      turn.failure = failure; turn.version++; turn.updatedAt = instant()
      db.prepare('UPDATE chat_turns SET status=?,document=?,fence=fence+1,lease_owner=NULL,lease_until=NULL WHERE id=?').run(turn.status, JSON.stringify(legacyTurnDocument(turn)), turn.id)
    }
  }
}
export class ChatWorker {
  readonly owner = randomUUID()
  constructor(readonly db: DatabaseSync, readonly config: Config, readonly call: ModelCall = callHarness, readonly externalCall:ExternalAgentCall=callExternalAgent,readonly clock:()=>number=Date.now) {}
  async tick() {
    const job = transaction(this.db, () => {
      reconcileChat(this.db, this.config)
      const row = this.db.prepare("SELECT * FROM chat_turns WHERE status='queued' AND (json_extract(request_json,'$.continuous.dueAt') IS NULL OR json_extract(request_json,'$.continuous.dueAt')<=?) ORDER BY rowid LIMIT 1").get(this.clock())
      if (!row) return null
      const s = service(this.db, String(row.owner_id), this.config), { turn, input, group } = s.checkTurnInput(String(row.id))
      let system:string,prompt:string
      const external=input.externalAgent?externalForChat(s,turn.agentContactId):null
      if(input.externalAgent&&!external)throw new ApiError('FORBIDDEN')
      if(external){
        if(!input.externalConsent||!input.dailyChat||input.fileSource||input.context.length||group.kind!=='direct')throw new ApiError('FORBIDDEN')
        const current=s.projectedMessage(turn.inputMessageId);if(current.origin!=='human'||current.senderContactId!==s.human().id)throw new ApiError('FORBIDDEN')
        system=externalAgentSystem;prompt=current.text!
      }else if(turn.purpose==='create_agent') {
        // This new operation is authorized by exactly this owner's imperative,
        // not by any past message, profile, memory or proposed business action.
        system=agentCreationSystem
        prompt=JSON.stringify({request:currentTurnText(s,turn.id)})
      } else if(input.assistantMode==='coordinate'){
        const current=currentTurnText(s,turn.id),agentContext=s.directory.modelContext(turn.agentContactId,group.id),personal=personalMemoryContext(s,agentContext.agent,group,current),complex=assistantComplexRequest(current)
        input.memoryContextSources=memoryContextSources(s,personal.records,agentContext.memories)
        const required=new Set(input.continuous?.messageIds??[turn.inputMessageId]),recent=recentDialogue(s,group.id,input.inputSequence,[...required]),notes=olderDialogue(s,group.id,input.inputSequence,recent,current),tasks=dialogueTaskState(s,group,current)
        let layers:DialogueLayers={messages:[],notes:{method:'source_quotes',scope:'current_conversation',summary:[],recalled:[]},tasks:[]}
        system=personalAssistantSystem+(complex?'\nComplex work: JSON {kind:"team",title:string,contactIds:[listed_ID]}. Save only a proposal. Owner confirms group creation; humans and Agent owners accept independently. No automatic execution or material sharing.':'')
        const baseSystem=system,contextSystem=(selection:DialogueLayers)=>baseSystem+(selection.notes.summary.length||selection.notes.recalled.length||selection.tasks.length?'\n'+dialogueContextSystem:'')
        const candidates=rankedAssistantCandidates(s,current),shown:typeof candidates=[]
        const serialize=(selection=layers)=>JSON.stringify({currentRequest:current,requestedAgent:{id:agentContext.agent.id,displayName:agentContext.agent.displayName,profile:Object.fromEntries(Object.entries(agentContext.agent.profile).filter(([key,value])=>key!=='version'&&value!==''))},...(personal.records.length?{personalMemories:personal.records}:{}),...(personal.omitted?{personalMemoriesOmitted:true}:{}),...(agentContext.memories.length?{memories:agentContext.memories}:{}),localSpecialists:shown,...(shown.length<candidates.length?{specialistsOmitted:true}:{}),...(complex?{labId:s.c.actor.labId,collaboratingHumans:assistantPeople(s),collaboratingAgents:assistantTeamAgents(s)}:{}),...(selection.messages.some(m=>!required.has(m.id))?{recentDialogue:selection.messages.filter(m=>!required.has(m.id))}:{}),...(selection.notes.summary.length||selection.notes.recalled.length?{dialogueContext:selection.notes}:{}),...(selection.tasks.length?{taskState:selection.tasks.map(t=>t.value)}:{})})
        prompt=serialize()
        for(const candidate of candidates){if(shown.length>=3)break;shown.push(candidate);const trial=serialize();if(input.budget.maxTokens-chatInputTokenBound(system,trial)>=512)prompt=trial;else shown.pop()}
        layers=packDialogueLayers(recent,required,notes,tasks,trial=>input.budget.maxTokens-chatInputTokenBound(contextSystem(trial),serialize(trial))>=512)
        system=contextSystem(layers);prompt=serialize();input.agentContextFingerprint=agentContext.fingerprint
        saveDialogueSelection(s,turn.id,input,layers,layers.messages.length<input.inputSequence)
        this.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=?').run(JSON.stringify(input),turn.id)
      } else {
      // Snapshot the context and bounded message window; normal chat never creates a job.
      let remainingText=32000
      const messages = input.dailyChat?recentDialogue(s,group.id,input.inputSequence,input.continuous?.messageIds??[turn.inputMessageId]):this.db.prepare('SELECT id FROM chat_messages WHERE conversation_id=? AND sequence<=? ORDER BY sequence DESC LIMIT ?').all(group.id, input.inputSequence,20).flatMap(r => {
        try { const m = s.projectedMessage(String(r.id));if(!input.dailyChat&&(m.text?.length??0)>remainingText)return [];remainingText-=m.text?.length??0;return [{ id:m.id,sequence:m.sequence,origin: m.origin, text: m.text, senderContactId: m.senderContactId,mentions:m.mentions,resources:m.resources }] } catch { return [] }
      }).reverse()
      let context: unknown[]
      try { context = input.context.map(ref => {
        s.checkResource(ref, group.id, true)
        if (ref.kind === 'task') return { ...ref, data: s.c.task(ref.ref.id) }
        if (ref.kind === 'plan') return { ...ref, data: s.c.plan(ref.ref.id) }
        if (ref.kind === 'artifact') return { ...ref, data: s.ai.readTexts(s.ai.inputRefs([ref.ref.id]))[0] }
        if (ref.kind === 'run') return { ...ref, data: s.ai.projectedRun(ref.ref.id) }
        if (ref.kind === 'deliverable') return { ...ref, data: s.c.deliverable(ref.ref.id) }
        return { ...ref, data: s.c.assignment(ref.ref.id).model }
      }) } catch {
        turn.status='failed';turn.failure='INPUT_CHANGED';turn.version++;turn.updatedAt=instant();s.saveTurn(turn);return null
      }
      // Human-authored profile facts stay intact. Versions remain in the server
      // fingerprint, not repeated as readonly metadata in the model directory.
      const publicContact = (contact:ReturnType<typeof s.contact>) => ({id:contact.id,displayName:contact.displayName,identity:contact.identity,availability:{status:contact.availability.status,...(contact.availability.reason?{reason:contact.availability.reason}:{})},profile:Object.fromEntries(Object.entries(contact.profile).filter(([key,value])=>key!=='version'&&value!==''))})
      const candidates=input.dailyChat?group.members.map(m=>m.contactId).filter(id=>id!==turn.agentContactId):this.db.prepare('SELECT id FROM chat_contacts WHERE lab_id=? AND id<>? ORDER BY id').all(s.c.actor.labId,turn.agentContactId).map(r=>String(r.id))
      const contacts = candidates.flatMap(id => { try { return [publicContact(s.contact(id))] } catch { return [] } }).slice(0, 100)
      const agentContext=s.directory.modelContext(turn.agentContactId,group.id),requestedAgent=publicContact(agentContext.agent)
      const personal=personalMemoryContext(s,agentContext.agent,group,currentTurnText(s,turn.id))
      input.memoryContextSources=memoryContextSources(s,personal.records,agentContext.memories)
      input.agentContextFingerprint=agentContext.fingerprint
      this.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=?').run(JSON.stringify(input),turn.id)
      const contactColumns=['id','displayName','identity','availability','profile']
      const selectedTasks=input.context.filter(ref=>ref.kind==='task').map(ref=>s.c.task(ref.ref.id))
      system=input.dailyChat?dailyChatSystem:chatModelSystem({group:group.kind==='personal'&&agentContext.agent.profile.role==='coordinator',inviteContact:group.kind==='group'&&group.ownerMemberId===s.c.actor.id,inviteTask:group.kind==='group'&&group.ownerMemberId===s.c.actor.id&&selectedTasks.some(task=>task.initiatorId===s.c.actor.id),runTask:group.kind==='group'&&selectedTasks.some(task=>task.leadId===s.c.actor.id)})
      if(input.scheduledFollowupId)system+='\nThe latest service message is an explicitly owner-authorized scheduled instruction. Execute that instruction within the provided conversation text only, and return the result conversationally. It does not grant web browsing, tools, filesystem access, business mutations, contact creation, or further scheduling. State any missing inputs/access plainly; never claim to have performed actions outside this scope.'
      if(input.assistantMode==='coordinate')system=personalAssistantSystem+'\n'+chatModelSystem({group:true,inviteContact:false,inviteTask:false,runTask:false}).split('\n').filter(line=>/^(Ref=|Group=|Item=|Schedule=)/.test(line)).join('\n')
      const selectedSkill=input.skill?skillContext(s,input.skill,turn.agentContactId):undefined
      if(selectedSkill)system+=skillSystem
      const document=input.fileSource?s.fileDocument(input.fileSource.messageId,group.id):undefined
      if(document)system+=fileChatSystem
      const notes=input.dailyChat?olderDialogue(s,group.id,input.inputSequence,messages,currentTurnText(s,turn.id)):undefined,tasks=input.dailyChat?dialogueTaskState(s,group,currentTurnText(s,turn.id)):[]
      let layers:DialogueLayers={messages:[],notes:{method:'source_quotes',scope:'current_conversation',summary:[],recalled:[]},tasks:[]}
      const baseSystem=system,contextSystem=(selection:DialogueLayers)=>baseSystem+(selection.notes.summary.length||selection.notes.recalled.length||selection.tasks.length?'\n'+dialogueContextSystem:'')
      // Lossless rows: budget selection may omit an oldest DAILY message, never
      // trim a retained message/profile/memory. Collaboration keeps its window.
      const serialize=(selected:typeof messages,earlierMessagesOmitted=false,read=document?fileReadMetadata(document):undefined,fileExcerpts:unknown[]=[],selection=layers)=>{
        const senderIds=[...new Set([...group.members.map(m=>m.contactId),...selected.map(m=>m.senderContactId).filter((id):id is string=>id!==null)])]
        const conversation={kind:group.kind,title:group.title,memberColumns:['sender','role','status'],members:group.members.map(m=>[senderIds.indexOf(m.contactId),m.role,m.status]),...(group.taskIds.length?{taskIds:group.taskIds}:{})}
        const messageColumns=['origin','sender','text',...(selected.some(m=>m.mentions.length)?['mentions']:[]),...(selected.some(m=>m.resources.length)?['resources']:[])]
        const messageRows=selected.map(m=>messageColumns.map(key=>key==='sender'?m.senderContactId===null?null:senderIds.indexOf(m.senderContactId):m[key as keyof typeof m]))
        return JSON.stringify({...(selectedSkill?{selectedSkill}:{}),ownerId:s.c.actor.id,labId:s.c.actor.labId,requestedAgent,conversation,contactColumns,contacts:contacts.map(c=>contactColumns.map(key=>c[key as keyof typeof c])),senderIds,messageColumns,messages:messageRows,...(agentContext.memories.length?{memories:agentContext.memories}:{}),...(personal.records.length?{personalMemories:personal.records}:{}),...(personal.omitted?{personalMemoriesOmitted:true}:{}),...(input.assistantMode==='coordinate'?{currentRequest:s.projectedMessage(turn.inputMessageId).text,localSpecialists:assistantCandidates(s),collaboratingHumans:assistantPeople(s),collaboratingAgents:assistantTeamAgents(s)}:{}),...(context.length?{context}:{}),...(earlierMessagesOmitted?{earlierMessagesOmitted:true}:{}),...(read?{fileRead:read,fileExcerpts}:{}),...(selection.notes.summary.length||selection.notes.recalled.length?{dialogueContext:selection.notes}:{}),...(selection.tasks.length?{taskState:selection.tasks.map(t=>t.value)}:{})})
      }
      prompt=serialize(messages)
      if(input.dailyChat){
        const current=messages.find(m=>m.id===turn.inputMessageId)
        if(!current){turn.status='failed';turn.failure='INPUT_CHANGED';turn.version++;turn.updatedAt=instant();s.saveTurn(turn);return null}
        const required=new Set(input.continuous?.messageIds??[current.id]);const currentBatch=messages.filter(m=>required.has(m.id))
        if(currentBatch.length!==required.size){turn.status='failed';turn.failure='INPUT_CHANGED';turn.version++;turn.updatedAt=instant();s.saveTurn(turn);return null}
        const base=serialize(currentBatch,input.inputSequence>currentBatch.length)
        const minimumOutput=input.budget.maxTokens-chatInputTokenBound(system,base)>=512?512:64
        let read=document?fileReadMetadata(document):undefined,excerpts:unknown[]=[],desiredOutput=minimumOutput
        if(document){
          // Select the best authorized file content with only the complete
          // current batch. Old history may use spare room, never displace that
          // content or reduce the bounded reply allowance.
          const result=selectFileExcerpts(document,input.fileSource,currentTurnText(s,turn.id),system,(read,excerpts)=>serialize(currentBatch,input.inputSequence>currentBatch.length,read,excerpts),input.budget.maxTokens)
          desiredOutput=Math.min(4096,input.budget.maxTokens-chatInputTokenBound(system,result.prompt));read=result.read;excerpts=result.excerpts
          if(!result.read.ranges.length){turn.status='failed';turn.failure='BUDGET_EXCEEDED';turn.version++;turn.updatedAt=instant();s.saveTurn(turn);return null}
          input.fileRead=result.read;turn.fileRead=result.read
          this.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=?').run(JSON.stringify(input),turn.id)
        }
        layers=packDialogueLayers(messages,required,notes!,tasks,trial=>input.budget.maxTokens-chatInputTokenBound(contextSystem(trial),serialize(trial.messages,trial.messages.length<input.inputSequence,read,excerpts,trial))>=desiredOutput)
        system=contextSystem(layers)
        const omitted=layers.messages.length<input.inputSequence
        prompt=serialize(layers.messages,omitted,read,excerpts)
        saveDialogueSelection(s,turn.id,input,layers,omitted)
      }
      }
      const remainingOutput=input.budget.maxTokens-chatInputTokenBound(system,prompt)
      if (prompt.length > (input.skill?256000:100000) || remainingOutput<64) {
        turn.status = 'failed'; turn.failure = 'BUDGET_EXCEEDED'; turn.version++; turn.updatedAt = instant(); s.saveTurn(turn); return null
      }
      let apiKey: string
      try { apiKey = external?.apiKey??personalModelKey(this.db, s.c.actor, this.config) } catch {
        turn.status = 'unavailable'; turn.failure = 'MODEL_UNAVAILABLE'; turn.version++; turn.updatedAt = instant(); s.saveTurn(turn); return null
      }
      const fence = Number(row.fence) + 1
      turn.status = 'running'; turn.version++; turn.updatedAt = instant(); s.saveTurn(turn)
      this.db.prepare('UPDATE chat_turns SET fence=?,lease_owner=?,lease_until=? WHERE id=?').run(fence, this.owner, Date.now() + 15000, turn.id)
      this.db.prepare('INSERT INTO chat_attempts VALUES (?,?,?,NULL)').run(turn.id, row.root_id!, instant())
      const selected=personalModelRuntime(this.db,s.c.actor,this.config)
      // File reading needs a plain reply within the existing output allowance.
      // Only this DeepSeek path changes the provider's documented default.
      return { id: turn.id, ownerId: String(row.owner_id), fence, input,externalEndpoint:external?.endpoint, modelInput: { provider:selected.provider,...(selected.provider==='deepseek'&&input.dailyChat&&input.fileSource?{reasoningEffort:'off' as const}:{}),system, prompt, model:external?.model??selected.model, maxTokens: Math.min(4096,remainingOutput), timeoutMs: input.budget.maxSeconds * 1000 }, credential: { apiKey } }
    })
    if (!job) return false
    const controller = new AbortController(), started = Date.now(),unregister=registerChatCall(job.id,controller)
    const lease = setInterval(() => {
      try { transaction(this.db, () => { reconcileChat(this.db, this.config); const row = this.db.prepare('SELECT status,fence FROM chat_turns WHERE id=?').get(job.id)!; if (row.status !== 'running' || row.fence !== job.fence) controller.abort(); else this.db.prepare('UPDATE chat_turns SET lease_until=? WHERE id=?').run(Date.now() + 15000, job.id) }) } catch { controller.abort() }
    }, job.input.continuous?200:3000)
    let timeout: ReturnType<typeof setTimeout> | undefined
    const expired = new Promise<ModelResult>(resolve => { timeout = setTimeout(() => { controller.abort(); resolve({ text: '', failure: 'TIMEOUT', inputTokens: null, outputTokens: null, elapsedMs: Date.now() - started }) }, job.modelInput.timeoutMs) })
    let draft='',lastPublished=0
    // Plain local daily replies only. JSON workflows, tools and provider
    // reasoning never enter this provisional channel, even if malformed.
    const onDelta=job.input.continuous&&job.input.dailyChat&&!job.input.purpose&&!job.input.assistantMode&&!job.input.externalAgent?(text:string)=>{
      if(controller.signal.aborted||typeof text!=='string')return
      draft+=text
      if(draft.length>8000||/^[\s]*[\[{`]/.test(draft)||Date.now()-lastPublished<80)return
      try{transaction(this.db,()=>{if(!saveChatDelta(service(this.db,job.ownerId,this.config),job.id,job.fence,draft))controller.abort()});lastPublished=Date.now()}catch{controller.abort()}
    }:undefined
    let result: ModelResult
    try { result = await Promise.race([job.externalEndpoint?this.externalCall({endpoint:job.externalEndpoint,model:job.modelInput.model,apiKey:job.credential.apiKey,text:job.modelInput.prompt,maxTokens:job.modelInput.maxTokens,timeoutMs:job.modelInput.timeoutMs},controller.signal):this.call(job.modelInput, controller.signal, job.credential,onDelta), expired]) } catch { result = { text: '', failure: 'MODEL_FAILED', inputTokens: null, outputTokens: null, elapsedMs: Date.now() - started } }
    finally { unregister();clearInterval(lease); if (timeout) clearTimeout(timeout) }
    transaction(this.db, () => {
      const usage = ModelUsage.parse({ inputTokens: result.inputTokens, outputTokens: result.outputTokens, elapsedMs: result.elapsedMs, cost: null, currency: null })
      // Actual returned usage survives cancellation even when output is fenced.
      this.db.prepare('UPDATE chat_attempts SET usage_json=? WHERE turn_id=?').run(JSON.stringify(usage), job.id)
      const diagnostic=(stage:string,errorCategory?:string)=>{
        if(!job.input.fileSource&&!job.input.externalAgent)return
        // Private operational metadata only: never retain provider text or keys.
        const input=JSON.parse(String(this.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(job.id)!.request_json))
        const text=typeof result.text==='string'?result.text:''
        input.modelOutputDiagnostic={stage,returnedTextLength:text.length,trimEmpty:!text.trim(),maxOutputTokens:job.modelInput.maxTokens,reasoningEffort:job.modelInput.reasoningEffort??'default',...(result.finishReason?{finishReason:result.finishReason}:{}),...(result.failure?{failure:result.failure}:{}),...(errorCategory?{errorCategory}:{})}
        this.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=?').run(JSON.stringify(input),job.id)
      }
      diagnostic('returned')
      reconcileChat(this.db, this.config)
      const row = this.db.prepare('SELECT * FROM chat_turns WHERE id=?').get(job.id)!
      if (row.status !== 'running' || row.fence !== job.fence || row.lease_owner !== this.owner) {
        const input=JSON.parse(String(row.request_json))
        if(input.continuous?.supersededBy&&(result.inputTokens===null||result.outputTokens===null)){
          const stopped=AgentTurn.parse(JSON.parse(String(row.document)));stopped.status='interrupted';stopped.failure='LEASE_EXPIRED_USAGE_UNCERTAIN';stopped.version++;stopped.updatedAt=instant()
          this.db.prepare('UPDATE chat_turns SET status=?,document=? WHERE id=?').run(stopped.status,JSON.stringify(legacyTurnDocument(stopped)),job.id)
        }
        return
      }
      const s = service(this.db, job.ownerId, this.config), { turn, group } = s.checkTurnInput(job.id)
      turn.usage = usage
      if (result.failure) { turn.status = 'failed'; turn.failure = result.failure==='OUTPUT_LIMIT'?'BUDGET_EXCEEDED':'MODEL_FAILED';diagnostic(result.failure==='OUTPUT_LIMIT'?'output_limit':'provider_error') }
      else if (result.inputTokens===null||result.outputTokens===null) { turn.status='failed';turn.failure='MODEL_FAILED' }
      else if (result.inputTokens + result.outputTokens > job.input.budget.maxTokens || result.outputTokens>job.modelInput.maxTokens || result.elapsedMs > job.input.budget.maxSeconds * 1000) { turn.status = 'failed'; turn.failure = 'BUDGET_EXCEEDED' }
      else {
        // Savepoint guarantees invalid output cannot leave partial plans/actions/messages.
        this.db.exec('SAVEPOINT chat_model_output')
        let outputStage='validation'
        try {
          if(job.input.purpose==='create_agent') {
            const output=AgentCreationOutput.parse(JSON.parse(result.text))
            let text:string
            if(output.kind==='clarify') {turn.status='waiting_input';turn.createdAgent=null;text=output.question}
            else {
              turn.createdAgent=applyAgentCreation(s,turn.id,output.profile);turn.status='succeeded'
              text=turn.createdAgent.reused?`已找到你已有的联系人“${turn.createdAgent.displayName}”，可以打开专属聊天。`:`已保存联系人“${turn.createdAgent.displayName}”，可以打开专属聊天。`
            }
            const message=s.message(group.id,{senderContactId:turn.agentContactId,origin:'service',text,mentions:[],resources:[],actionIds:[],turnId:turn.id})
            turn.outputMessageId=message.id;turn.failure=null;s.saveTurn(turn)
          } else {
          const coordinated=job.input.assistantMode==='coordinate'?PersonalAssistantOutput.parse(JSON.parse(result.text)):null
          if(coordinated?.kind==='collaborate'&&!assistantComplexRequest(s.projectedMessage(turn.inputMessageId).text??''))throw new Error('INVALID_MODEL_OUTPUT')
          if(coordinated?.kind==='team'){
            if(!assistantComplexRequest(currentTurnText(s,turn.id)))throw new Error('INVALID_MODEL_OUTPUT')
            const allowed=[...assistantPeople(s),...assistantTeamAgents(s)].map(c=>c.id)
            if(coordinated.contactIds.some(id=>!allowed.includes(id)))throw new Error('INVALID_MODEL_OUTPUT')
            outputStage='persistence'
            const work=createWork(s,{title:coordinated.title,goal:currentTurnText(s,turn.id),contactIds:coordinated.contactIds,agentContactId:null},{turnId:turn.id,conversationId:group.id,messageId:turn.inputMessageId})
            turn.assistantReceipt={kind:'work_task',taskId:work.id,conversationId:null,status:'proposed'}
            const message=s.message(group.id,{senderContactId:turn.agentContactId,origin:'service',text:`已保存“${work.title}”协作任务建议。确认后才会创建群和发送邀请；其他参与者仍需自行接受，尚未执行或完成。`,mentions:[],resources:[],actionIds:[],turnId:turn.id})
            turn.status='succeeded';turn.outputMessageId=message.id;turn.failure=null
          }else if(coordinated?.kind==='delegate'){
            outputStage='persistence'
            turn.assistantReceipt=delegateWork(s,turn,job.input,coordinated,{tokens:result.inputTokens!+result.outputTokens!,seconds:result.elapsedMs/1000})
            const receipt=turn.assistantReceipt
            const message=s.message(group.id,{senderContactId:turn.agentContactId,origin:'service',text:`已将本条需求提交到你的“${receipt.displayName}”专属聊天。${receipt.status==='queued'?'请求已排队，实际回复和交付尚未完成。':'当前模型不可用，可打开同一聊天查看状态。'}`,mentions:[],resources:[],actionIds:[],turnId:turn.id})
            turn.outputMessageId=message.id;turn.failure=null
          }else{
          const output = coordinated?.kind==='reply'?{answer:coordinated.answer,waitingInput:false,group:null,actions:[]}:coordinated?.kind==='collaborate'?{answer:coordinated.answer,waitingInput:false,group:coordinated.group,actions:[]}:job.input.dailyChat?{answer:Text.parse(result.text),waitingInput:false,group:null,actions:[]}:ChatModelOutput.parse(JSON.parse(result.text))
          if(job.input.dailyChat&&!output.answer.trim())throw new Error('INVALID_MODEL_OUTPUT')
          if (output.waitingInput && (output.group || output.actions.length)) throw new Error('INVALID_MODEL_OUTPUT')
          const payloads = [...output.actions]
          for (const payload of payloads) {
            if (payload.kind === 'create_group') throw new Error('INVALID_MODEL_OUTPUT')
            if ('task' in payload && !job.input.context.some(r => r.kind === 'task' && r.ref.id === payload.task.id && r.ref.version === payload.task.version)) throw new Error('INVALID_MODEL_OUTPUT')
            if (payload.kind === 'run_task' && payload.inputArtifactRefs.some(ref => !job.input.context.some(r => r.kind === 'artifact' && r.ref.id === ref.id && r.ref.version === ref.version))) throw new Error('INVALID_MODEL_OUTPUT')
          }
          if (output.group) {
            if (group.kind !== 'personal' || s.contact(turn.agentContactId).profile.role!=='coordinator' || output.group.plan.labId !== s.c.actor.labId) throw new Error('INVALID_MODEL_OUTPUT')
            for (const ref of output.group.sharedContext.artifactRefs) if (!job.input.context.some(r => r.kind === 'artifact' && r.ref.id === ref.id && r.ref.version === ref.version)) throw new Error('INVALID_MODEL_OUTPUT')
            if(coordinated&&output.group.sharedContext.selectedText!==null&&output.group.sharedContext.selectedText!==s.projectedMessage(turn.inputMessageId).text)throw new Error('INVALID_MODEL_OUTPUT')
            if(coordinated){const allowed=[turn.agentContactId,...assistantCandidates(s).map(c=>c.id),...assistantPeople(s).map(c=>c.id)];if(output.group.contactIds.some(id=>!allowed.includes(id)))throw new Error('INVALID_MODEL_OUTPUT')}
            const created = s.c.handlers.createPlan({ params: {}, query: {}, headers: {}, body: output.group.plan }) as { data: { id: string; version: number } }
            this.db.prepare('INSERT INTO chat_plan_sources VALUES (?,?)').run(created.data.id,turn.id)
            payloads.push({ kind: 'create_group', title: output.group.title, plan: { id: created.data.id, version: created.data.version }, contactIds: output.group.contactIds, sharedContext: output.group.sharedContext })
          }
          for (const payload of payloads) s.validatePayload(payload, group.id)
          outputStage='persistence'
          const message = s.message(group.id, { senderContactId: turn.agentContactId, origin: 'model', text: output.answer, mentions: [], resources: [], actionIds: [], turnId: turn.id })
          const actions = payloads.map(payload => s.addAction(turn, message.id, payload)); message.actionIds = actions.map(a => a.id)
          this.db.prepare('UPDATE chat_messages SET document=? WHERE id=?').run(JSON.stringify(message), message.id)
          turn.status = output.waitingInput ? 'waiting_input' : 'succeeded'; turn.outputMessageId = message.id; turn.failure = null
          if(coordinated?.kind==='reply')turn.assistantReceipt=recordAssistantAnswerWork(s,turn.id,group.id,turn.agentContactId,currentTurnText(s,turn.id),message.id)
          if(coordinated?.kind==='collaborate'){const payload=payloads.find(p=>p.kind==='create_group')!;if(payload.kind==='create_group')turn.assistantReceipt={kind:'collaborate',planId:payload.plan.id,actionIds:actions.map(a=>a.id)}}
          }
          }
          this.db.exec('RELEASE chat_model_output')
        } catch(error) { this.db.exec('ROLLBACK TO chat_model_output; RELEASE chat_model_output');diagnostic(outputStage,error instanceof z.ZodError?'schema':error instanceof ApiError?'business':(error as {code?:unknown})?.code==='ERR_SQLITE_ERROR'?'sqlite':'unknown'); turn.status = 'failed'; turn.failure = error instanceof AssistantBudgetError?'BUDGET_EXCEEDED':(job.input.purpose==='create_agent'||job.input.assistantMode==='coordinate')&&error instanceof ApiError&&error.code==='RATE_LIMITED'?'AGENT_LIMIT_REACHED':outputStage==='persistence'?'MODEL_FAILED':'INVALID_MODEL_OUTPUT'; turn.outputMessageId = null;delete turn.assistantReceipt;if(job.input.purpose==='create_agent')turn.createdAgent=null }
      }
      turn.version++; turn.updatedAt = instant(); s.saveTurn(turn)
      this.db.prepare('UPDATE chat_turns SET lease_owner=NULL,lease_until=NULL WHERE id=?').run(turn.id)
    })
    return true
  }
}
