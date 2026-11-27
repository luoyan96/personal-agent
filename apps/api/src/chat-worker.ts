import { currentHabit } from './feedback-queue.js'
import {assistantReplyText,assistantStickerFallback,GroupAssistantOutput} from '@research-agent-platform/contracts'
import {groupAssistantSystem,groupPublicContext} from './group-assistant-context.js'
import {queueGroupNotice} from './group-notices.js'
import { skillContext,skillSystem } from './skills.js'
import { lifecycleReceipt } from '@research-agent-platform/constitution'
import { conversationRulesContext, layerCounts } from './constitution-context.js'
import { retrieveResearchContext, researchLibrarySystem, researchReadReceipt } from './research-chat-context.js'
import type { AgentResearchContext } from '@research-agent-platform/contracts'
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { AgentTurn, ChatActionPayload, PlanInput, Title, Text, Id, SharedContext, ModelUsage } from '@research-agent-platform/contracts'
import { ChatService, type TurnInput } from './chat.js'
import { transaction } from './database.js'
import { serviceFor, callHarness } from './execution-worker.js'
import type { ModelCall, ModelResult } from './execution-worker.js'
import { personalModelKey, personalModelRuntime } from './personal-models.js'
import { instant } from './ai.js'
import type { Config } from './config.js'
import { ApiError } from './errors.js'
import { chatModelSystem, chatInputTokenBound, chatReplyTokenReserve, dailyChatSystem } from './chat-model-input.js'
import { queueTopicCuration, topicIndexWanted } from './topic-curator-queue.js'
import { fitTopicIndex, topicReference, topicIndexReceipt, topicReceipt, topicSystem } from './topic-context.js'
import { fileChatSystem,fileReadMetadata,selectFileExcerpts } from './agent-files.js'
import { AgentCreationOutput, agentCreationSystem, applyAgentCreation, legacyTurnDocument } from './agent-creation.js'
import { externalForChat } from './agent-connections.js'
import { callExternalAgent, externalAgentSystem, type ExternalAgentCall } from './external-agent-client.js'
import { currentTurnText,registerChatCall,saveChatDelta } from './continuous-chat.js'
import { personalMemoryContext } from './personal-memories.js'
import { personalAssistantSystem,PersonalAssistantOutput,assistantCandidates,assistantPeople,assistantTeamAgents,rankedAssistantCandidates,assistantComplexRequest,delegateWork,AssistantBudgetError,assistantProjectSystem,assistantProjectCompactSystem,assistantProjectDecisionSystem,assistantProjectEntrySources,minimalProjectEntrySources,admitProjectEntrySources } from './personal-assistant.js'
import {createAssistantProject,resolveAssistantProjectDecision} from './assistant-projects.js'
import {projectExecutionInput,projectExecutionSystem} from './assistant-project-actions.js'
import {intakeRecoverySystem,queueIntakeOutputRecovery} from './intake-output-recovery.js'
import { assistantStickerSystem, readAssistantStickerReply } from './assistant-sticker.js'
import {createWork,recordAssistantAnswerWork} from './workspace.js'
import {recentDialogue,olderDialogue,dialogueTaskState,packDialogueLayers,saveDialogueSelection,dialogueSources,memoryContextSources,dialogueContextSystem,type DialogueLayers} from './dialogue-context.js'
import { modelAgentProfile } from './agent-roles.js'
import { isDatabaseBusy, waitForWorkerDatabase } from './worker-database.js'

// Local model protocol: validated JSON, no model-side tools or business authority.
export const ChatModelOutput = z.strictObject({
  answer: Text, waitingInput: z.boolean(),
  group: z.strictObject({ title: Title, plan: PlanInput, contactIds: z.array(Id).min(1).max(99), sharedContext: SharedContext }).nullable(),
  actions: z.array(ChatActionPayload).max(5),
})
function service(db: DatabaseSync, owner: string, config: Config,turnId?:string) { const context=turnId?db.prepare('SELECT lab_id FROM chat_turn_lab_contexts WHERE turn_id=?').get(turnId):null;return new ChatService(serviceFor(db, owner, config,context?String(context.lab_id):undefined).c, config) }
export function reconcileChat(db: DatabaseSync, config: Config) {
  for (const row of db.prepare("SELECT * FROM chat_turns WHERE status IN ('queued','running')").all()) {
    const turn = AgentTurn.parse(JSON.parse(String(row.document)))
    let failure: AgentTurn['failure'] = null
    try {
      const s = service(db, String(row.owner_id), config,String(row.id))
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
// Re-evaluate conversational style from the dialogue actually selected for this turn.
const dialogueStyle = 'Adapt reply length, tone and approach to the sender’s latest feedback.'

function topicMemoryTurn(input: TurnInput) {
  return input.dailyChat && !input.externalConsent && !input.fileSource && !input.skill &&
    !input.purpose && !input.scheduledFollowupId && !input.assistantMode &&
    !input.projectExecution && !input.intakeOutputLimitRecovery
}

export class ChatWorker {
  readonly owner = randomUUID()
  constructor(readonly db: DatabaseSync, readonly config: Config, readonly call: ModelCall = callHarness, readonly externalCall:ExternalAgentCall=callExternalAgent,readonly clock:()=>number=Date.now) {}
  async tick() {
    const job = await waitForWorkerDatabase(() => transaction(this.db, () => {
      reconcileChat(this.db, this.config)
      const row = this.db.prepare("SELECT * FROM chat_turns WHERE status='queued' AND (json_extract(request_json,'$.continuous.dueAt') IS NULL OR json_extract(request_json,'$.continuous.dueAt')<=?) ORDER BY rowid LIMIT 1").get(this.clock())
      if (!row) return null
      const s = service(this.db, String(row.owner_id), this.config,String(row.id)), { turn, input, group } = s.checkTurnInput(String(row.id))
      // 规则按会话归属取：群聊用群所属课题组，私聊与个人会话只有平台规则。开关关闭即恢复旧行为。
      let conversationRules:ReturnType<typeof conversationRulesContext>|null=null
      try{conversationRules=(this.config.constitutionRules||group.kind==='group')&&!input.externalAgent?conversationRulesContext(this.db,{id:group.id,kind:group.kind,labId:group.labId},s.c.actor.id):null}
      catch(error){if(!(error instanceof Error)||error.message!=='BUDGET_EXCEEDED')throw error;turn.status='failed';turn.failure='BUDGET_EXCEEDED';turn.version++;turn.updatedAt=instant();s.saveTurn(turn);return null}
      const rulesSuffix=conversationRules?.text?`\n${conversationRules.text}`:''
      if(conversationRules?.text)console.log(`CHAT_RULES conversation=${group.id} kind=${group.kind} scope=${conversationRules.ruleScope} bytes=${conversationRules.bytes} rules=${conversationRules.ruleIds.join(',')} layers=${layerCounts(conversationRules.rules)} omitted=${conversationRules.omitted.length}`)
      const allProjectSources=input.assistantProjectEntry?assistantProjectEntrySources(s,turn,input):undefined
      let shownProjectSpecialistIds:string[]=[],shownProjectHumanIds:string[]=[]
      let projectSources=allProjectSources?minimalProjectEntrySources(allProjectSources,input):undefined
      const projectDecisionSuffix=()=> (input.assistantMode==='coordinate'||input.fileSource)&&projectSources?.projects.some(p=>p.commitments.some(c=>['blocked','waiting'].includes(c.status)))?'\n'+assistantProjectDecisionSystem:''
      let system:string,prompt:string,assistantStickers=false
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
      } else if(input.projectExecution){
        system=projectExecutionSystem
        prompt=JSON.stringify(projectExecutionInput(s,input))
      } else if(input.intakeOutputLimitRecovery){
        // Retry only the typed interpretation, with current input lossless and
        // no optional old transcript competing with the residual root budget.
        const prior=JSON.parse(String(this.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(input.intakeOutputLimitRecovery.previousTurnId)!.request_json)) as typeof input
        const allowed=prior.projectEntryInventory!,current=currentTurnText(s,turn.id),agentContext=s.directory.modelContext(turn.agentContactId,group.id),personal=personalMemoryContext(s,agentContext.agent,group,current)
        const full={...allProjectSources!,localSpecialists:rankedAssistantCandidates(s,current).filter(c=>allowed.specialistIds.includes(c.id)).map(c=>({id:c.id,displayName:c.displayName,introduction:c.profile.introduction,capabilityDescription:c.profile.capabilityDescription})),humans:assistantPeople(s).filter(c=>allowed.humanIds.includes(c.id)),messages:allProjectSources!.messages.filter(m=>allowed.messageIds.includes(m.id)),fileMessageIds:allProjectSources!.fileMessageIds.filter(id=>allowed.fileMessageIds.includes(id)),existingTasks:allProjectSources!.existingTasks.filter(t=>allowed.taskIds.includes(t.id)),projects:allProjectSources!.projects.filter(p=>allowed.projects.some(old=>old.id===p.id)).map(p=>({...p,commitments:p.commitments.filter(c=>allowed.projects.find(old=>old.id===p.id)!.commitmentIds.includes(c.id))}))}
        projectSources=minimalProjectEntrySources(full,input)
        system=intakeRecoverySystem+rulesSuffix
        const context=input.context.map(ref=>{
          s.checkResource(ref,group.id,true)
          if(ref.kind==='task')return {...ref,data:s.c.task(ref.ref.id)}
          if(ref.kind==='plan')return {...ref,data:s.c.plan(ref.ref.id)}
          if(ref.kind==='artifact')return {...ref,data:s.ai.readTexts(s.ai.inputRefs([ref.ref.id]))[0]}
          if(ref.kind==='run')return {...ref,data:s.ai.projectedRun(ref.ref.id)}
          if(ref.kind==='deliverable')return {...ref,data:s.c.deliverable(ref.ref.id)}
          return {...ref,data:s.c.assignment(ref.ref.id).model}
        })
        const serialize=()=>JSON.stringify({currentRequest:current,requestedAgent:{id:agentContext.agent.id,displayName:agentContext.agent.displayName,profile:Object.fromEntries(Object.entries(modelAgentProfile(agentContext.agent)).filter(([key,value])=>key!=='version'&&value!==''))},...(personal.records.length?{personalMemories:personal.records}:{}),...(personal.omitted?{personalMemoriesOmitted:true}:{}),...(agentContext.memories.length?{memories:agentContext.memories}:{}),...(context.length?{context}:{}),projectEntrySources:projectSources})
        admitProjectEntrySources(full,projectSources,()=>input.budget.maxTokens-chatInputTokenBound(system,serialize())>=1024)
        prompt=serialize();input.agentContextFingerprint=agentContext.fingerprint
        input.memoryContextSources=memoryContextSources(s,personal.records,agentContext.memories)
        saveDialogueSelection(s,turn.id,input,{messages:recentDialogue(s,group.id,input.inputSequence,input.continuous?.messageIds??[turn.inputMessageId]).filter(m=>(input.continuous?.messageIds??[turn.inputMessageId]).includes(m.id)),notes:{method:'source_quotes',scope:'current_conversation',summary:[],recalled:[]},tasks:[]},true)
      } else if(input.assistantMode==='coordinate'){
        const current=currentTurnText(s,turn.id),agentContext=s.directory.modelContext(turn.agentContactId,group.id),personal=personalMemoryContext(s,agentContext.agent,group,current),complex=assistantComplexRequest(current)
        input.memoryContextSources=memoryContextSources(s,personal.records,agentContext.memories)
        if(personal.records.length||agentContext.memories.length)console.log(`CHAT_MEMORY conversation=${group.id} ${lifecycleReceipt({preference:personal.records.length+agentContext.memories.length,turn:1})} omitted=${personal.omitted}`)
        const required=new Set(input.continuous?.messageIds??[turn.inputMessageId]),recent=recentDialogue(s,group.id,input.inputSequence,[...required]),notes=olderDialogue(s,group.id,input.inputSequence,recent,current),tasks=dialogueTaskState(s,group,current)
        let layers:DialogueLayers={messages:[],notes:{method:'source_quotes',scope:'current_conversation',summary:[],recalled:[]},tasks:[]}
        system=personalAssistantSystem+'\n'+dialogueStyle+(complex?'\nComplex work: JSON {kind:"team",title:string,contactIds:[listed_ID]}. Save only a proposal. Owner confirms group creation; humans and Agent owners accept independently. No automatic execution or material sharing.':'')
        if(input.assistantProjectEntry)system+='\n'+assistantProjectCompactSystem
        system+=rulesSuffix
        const baseSystem=system,contextSystem=(selection:DialogueLayers)=>baseSystem+projectDecisionSuffix()+(selection.notes.summary.length||selection.notes.recalled.length||selection.tasks.length?'\n'+dialogueContextSystem:'\nAnswer currentRequest only; forwarded names may differ from the sender.')
        system=contextSystem(layers)
        const candidates=rankedAssistantCandidates(s,current),shown:typeof candidates=[]
        const serialize=(selection=layers)=>JSON.stringify({currentRequest:current,...(input.assistantProjectEntry?{projectEntrySources:projectSources}:{}),requestedAgent:{id:agentContext.agent.id,displayName:agentContext.agent.displayName,profile:Object.fromEntries(Object.entries(modelAgentProfile(agentContext.agent)).filter(([key,value])=>key!=='version'&&value!==''))},...(personal.records.length?{personalMemories:personal.records}:{}),...(personal.omitted?{personalMemoriesOmitted:true}:{}),...(agentContext.memories.length?{memories:agentContext.memories}:{}),localSpecialists:shown,...(shown.length<candidates.length?{specialistsOmitted:true}:{}),...(complex?{labId:s.c.actor.labId,collaboratingHumans:assistantPeople(s),collaboratingAgents:assistantTeamAgents(s)}:{}),...(selection.messages.some(m=>!required.has(m.id))?{recentDialogue:selection.messages.filter(m=>!required.has(m.id))}:{}),...(selection.notes.summary.length||selection.notes.recalled.length?{dialogueContext:selection.notes}:{}),...(selection.tasks.length?{taskState:selection.tasks.map(t=>t.value)}:{})})
        prompt=serialize()
        const replyReserve=chatReplyTokenReserve(system,prompt,input.budget.maxTokens)
        for(const candidate of candidates){if(shown.length>=3)break;shown.push(candidate);const trial=serialize();if(input.budget.maxTokens-chatInputTokenBound(system,trial)>=replyReserve)prompt=trial;else shown.pop()}
        // Persisted decisions need their IDs and protocol before optional old
        // dialogue consumes the small coordinate allowance.
        if(allProjectSources&&projectSources)admitProjectEntrySources({...allProjectSources,localSpecialists:[],humans:[],existingTasks:[],fileMessageIds:[],messages:[],projects:allProjectSources.projects.filter(p=>p.commitments.some(c=>['blocked','waiting'].includes(c.status)))},projectSources,()=>input.budget.maxTokens-chatInputTokenBound(contextSystem(layers),serialize())>=replyReserve)
        layers=packDialogueLayers(recent,required,notes,tasks,trial=>input.budget.maxTokens-chatInputTokenBound(contextSystem(trial),serialize(trial))>=replyReserve,true)
        if(allProjectSources&&projectSources)admitProjectEntrySources(allProjectSources,projectSources,()=>input.budget.maxTokens-chatInputTokenBound(contextSystem(layers),serialize())>=replyReserve)
        shownProjectSpecialistIds=shown.map(c=>c.id);shownProjectHumanIds=complex?assistantPeople(s).map(c=>c.id):[]
        system=contextSystem(layers);prompt=serialize();input.agentContextFingerprint=agentContext.fingerprint
        saveDialogueSelection(s,turn.id,input,layers,layers.messages.length<input.inputSequence)
        this.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=?').run(JSON.stringify(input),turn.id)
      } else {
      // Snapshot the context and bounded message window; normal chat never creates a job.
      let remainingText=32000
      const messages = input.dailyChat?recentDialogue(s,group.id,input.inputSequence,input.continuous?.messageIds??[turn.inputMessageId],input.fileSource?.messageId):this.db.prepare('SELECT id FROM chat_messages WHERE conversation_id=? AND sequence<=? ORDER BY sequence DESC LIMIT ?').all(group.id, input.inputSequence,20).flatMap(r => {
        try { const m = s.projectedMessage(String(r.id));if(!input.dailyChat&&(m.text?.length??0)>remainingText)return [];remainingText-=m.text?.length??0;return [{ id:m.id,sequence:m.sequence,origin: m.origin, text: m.text, senderContactId: m.senderContactId,mentions:m.mentions,resources:m.resources }] } catch { return [] }
      }).reverse()
      let context: unknown[]
      try { context = input.context.map(ref => {
        s.checkResource(ref, group.id, true)
        if (ref.kind === 'task') {const task=s.c.task(ref.ref.id);return {...ref,data:group.kind==='group'?{title:task.title,status:task.status}:task}}
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
      const candidates=input.dailyChat?group.members.filter(m=>m.status==='joined').map(m=>m.contactId).filter(id=>id!==turn.agentContactId):this.db.prepare('SELECT id FROM chat_contacts WHERE lab_id=? AND id<>? ORDER BY id').all(s.c.actor.labId,turn.agentContactId).map(r=>String(r.id))
      const contacts = candidates.flatMap(id => { try { const contact=s.contact(id);return [group.kind==='group'?{id:contact.id,displayName:contact.displayName,identity:contact.identity,availability:{status:contact.availability.status},profile:{}}:publicContact(contact)] } catch { return [] } }).slice(0, 100)
      const agentContext=s.directory.modelContext(turn.agentContactId,group.id),requestedAgent=(({availability:_availability,...value})=>value)(publicContact({...agentContext.agent,profile:modelAgentProfile(agentContext.agent)}))
      const personal=personalMemoryContext(s,agentContext.agent,group,currentTurnText(s,turn.id))
      input.memoryContextSources=memoryContextSources(s,personal.records,agentContext.memories)
      if(personal.records.length||agentContext.memories.length)console.log(`CHAT_MEMORY conversation=${group.id} ${lifecycleReceipt({preference:personal.records.length+agentContext.memories.length,turn:1})} omitted=${personal.omitted}`)
      input.agentContextFingerprint=agentContext.fingerprint
      this.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=?').run(JSON.stringify(input),turn.id)
      const habits = !input.consultationVersion && (group.kind === 'group' || !personal.fingerprint)
        ? currentHabit(this.db, s.c.actor.id, group.kind === 'group' ? group.id : '').content : ''
      const contactColumns=['id','displayName','identity','availability','profile']
      const selectedTasks=input.context.filter(ref=>ref.kind==='task').map(ref=>s.c.task(ref.ref.id))
      system=group.kind==='group'?groupAssistantSystem:input.dailyChat?dailyChatSystem:chatModelSystem({group:group.kind==='personal'&&agentContext.agent.profile.role==='coordinator',inviteContact:false,inviteTask:false,runTask:false})
      if (input.dailyChat && !input.scheduledFollowupId) {
        system += '\n' + dialogueStyle
      }
      if(input.scheduledFollowupId)system+='\nThe latest service message is an explicitly owner-authorized scheduled instruction. Execute that instruction within the provided conversation text only, and return the result conversationally. It does not grant web browsing, tools, filesystem access, business mutations, contact creation, or further scheduling. State any missing inputs/access plainly; never claim to have performed actions outside this scope.'
      if(input.assistantMode==='coordinate')system=personalAssistantSystem+'\n'+chatModelSystem({group:true,inviteContact:false,inviteTask:false,runTask:false}).split('\n').filter(line=>/^(Ref=|Group=|Item=|S=|s=string)/.test(line)).join('\n')
      if(input.assistantProjectEntry)system+='\n'+(input.fileSource?assistantProjectCompactSystem:assistantProjectSystem)
      const selectedSkill=input.skill?skillContext(s,input.skill,turn.agentContactId):undefined
      if(selectedSkill)system+=skillSystem
      const library=retrieveResearchContext(s,input,currentTurnText(s,turn.id))
      assistantStickers=Boolean(input.assistantProjectEntry&&input.dailyChat&&!input.workTaskId&&!input.scheduledFollowupId&&!input.fileSource&&!input.context.length&&!library)
      let libraryExcerpts:AgentResearchContext['excerpts']=[]
      if(library)system+='\n'+researchLibrarySystem
      const document=input.fileSource?s.fileDocument(input.fileSource.messageId,group.id):undefined
      if(document)system+=fileChatSystem
      const notes=input.dailyChat?olderDialogue(s,group.id,input.inputSequence,messages,currentTurnText(s,turn.id),input.fileSource?.messageId):undefined,tasks=input.dailyChat&&group.kind!=='group'&&!input.consultationVersion?dialogueTaskState(s,group,currentTurnText(s,turn.id)):[]
      let layers:DialogueLayers={messages:[],notes:{method:'source_quotes',scope:'current_conversation',summary:[],recalled:[]},tasks:[]}
      system+=rulesSuffix
      const baseSystem=system,contextSystem=(selection:DialogueLayers)=>baseSystem+projectDecisionSuffix()+(selection.notes.summary.length||selection.notes.recalled.length||selection.tasks.length?'\n'+dialogueContextSystem:'')
      system=contextSystem(layers)
      // Lossless rows: budget selection may omit an oldest DAILY message, never
      // trim a retained message/profile/memory. Collaboration keeps its window.
      const serialize=(selected:typeof messages,earlierMessagesOmitted=false,read=document?fileReadMetadata(document):undefined,fileExcerpts:unknown[]=[],selection=layers)=>{
        const senderIds=[...new Set([...group.members.map(m=>m.contactId),...selected.map(m=>m.senderContactId).filter((id):id is string=>id!==null)])]
        const conversation={kind:group.kind,title:group.title,memberColumns:['sender','role','status'],members:group.members.map(m=>[senderIds.indexOf(m.contactId),m.role,m.status]),...(group.taskIds.length?{taskIds:group.taskIds}:{})}
        const currentIds=input.continuous?.messageIds??[turn.inputMessageId]
        const messageColumns=[...(input.dailyChat?['id']:[]),'origin','sender','text',...(selected.some(m=>m.mentions.length)?['mentions']:[]),...(selected.some(m=>m.resources.length)?['resources']:[])]
        // IDs locate the complete current batch; optional old rows need no
        // duplicate UUIDs. Source quotes carry their own durable provenance.
        const messageRows=selected.map(m=>messageColumns.map(key=>key==='id'?currentIds.includes(m.id)?m.id:null:key==='sender'?m.senderContactId===null?null:senderIds.indexOf(m.senderContactId):m[key as keyof typeof m]))
        return JSON.stringify({...(input.assistantProjectEntry?{projectEntrySources:projectSources}:{}),...(habits ? { senderWorkPreferences: habits } : {}),...(group.kind==='group'?{groupContext:groupPublicContext(s,group)}:{}),...(input.dailyChat?{currentRequest:{messageIds:currentIds}}:{}),...(selectedSkill?{selectedSkill}:{}),...(library?{researchLibrary:{retrieval:library.retrieval,limitation:library.limitation,excerpts:libraryExcerpts.map((e,i)=>({label:`R${i+1}`,...e}))}}:{}),...(!input.dailyChat||selectedSkill?{ownerId:s.c.actor.id,labId:s.c.actor.labId}:{}),requestedAgent,conversation,contactColumns,contacts:contacts.map(c=>contactColumns.map(key=>c[key as keyof typeof c])),senderIds,messageColumns,messages:messageRows,...(agentContext.memories.length?{memories:agentContext.memories}:{}),...(personal.records.length?{personalMemories:personal.records}:{}),...(personal.omitted?{personalMemoriesOmitted:true}:{}),...(input.assistantMode==='coordinate'?{currentRequest:s.projectedMessage(turn.inputMessageId).text,localSpecialists:assistantCandidates(s),collaboratingHumans:assistantPeople(s),collaboratingAgents:assistantTeamAgents(s)}:{}),...(context.length?{context}:{}),...(earlierMessagesOmitted?{earlierMessagesOmitted:true}:{}),...(read?{fileRead:read,fileExcerpts}:{}),...(selection.notes.summary.length||selection.notes.recalled.length?{dialogueContext:selection.notes}:{}),...(selection.tasks.length?{taskState:selection.tasks.map(t=>t.value)}:{})})
      }
      prompt=serialize(messages)
      if(input.dailyChat){
        const current=messages.find(m=>m.id===turn.inputMessageId)
        if(!current){turn.status='failed';turn.failure='INPUT_CHANGED';turn.version++;turn.updatedAt=instant();s.saveTurn(turn);return null}
        const required=new Set(input.continuous?.messageIds??[current.id]);const currentBatch=messages.filter(m=>required.has(m.id))
        if(currentBatch.length!==required.size){turn.status='failed';turn.failure='INPUT_CHANGED';turn.version++;turn.updatedAt=instant();s.saveTurn(turn);return null}
        const base=serialize(currentBatch,input.inputSequence>currentBatch.length)
        const minimumOutput=chatReplyTokenReserve(system,base,input.budget.maxTokens)
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
        if(library){
          // Current file reading has priority; bounded library passages use the
          // same saved budget before optional old dialogue. Never cut a passage
          // while retaining its old page/range provenance.
          for(const excerpt of library.excerpts){
            libraryExcerpts.push(excerpt)
            if(input.budget.maxTokens-chatInputTokenBound(system,serialize(currentBatch,true,read,excerpts))<desiredOutput)libraryExcerpts.pop()
          }
          input.librarySnapshot={...library.snapshot,citations:libraryExcerpts.map(e=>e.citation)}
          input.libraryRead=researchReadReceipt(library,libraryExcerpts);turn.libraryRead=input.libraryRead
        }
        // Reference-bearing candidate/project inventory takes precedence over
        // optional old dialogue; current input and file excerpts remain intact.
        if(allProjectSources&&projectSources)admitProjectEntrySources(allProjectSources,projectSources,()=>input.budget.maxTokens-chatInputTokenBound(contextSystem(layers),serialize(currentBatch,input.inputSequence>currentBatch.length,read,excerpts,layers))>=desiredOutput)
        layers=packDialogueLayers(messages,required,notes!,tasks,trial=>input.budget.maxTokens-chatInputTokenBound(contextSystem(trial),serialize(trial.messages,trial.messages.length<input.inputSequence,read,excerpts,trial))>=desiredOutput)
        if(allProjectSources&&projectSources)admitProjectEntrySources(allProjectSources,projectSources,()=>input.budget.maxTokens-chatInputTokenBound(contextSystem(layers),serialize(layers.messages,layers.messages.length<input.inputSequence,read,excerpts,layers))>=desiredOutput)
        system=contextSystem(layers)
        const omitted=layers.messages.length<input.inputSequence
        prompt=serialize(layers.messages,omitted,read,excerpts)
        saveDialogueSelection(s,turn.id,input,layers,omitted)
      }
      }
      if(projectSources)input.projectEntryInventory={specialistIds:[...new Set([...shownProjectSpecialistIds,...(projectSources.localSpecialists??[]).map(c=>c.id)])],humanIds:[...new Set([...shownProjectHumanIds,...(projectSources.humans??[]).map(c=>c.id)])],messageIds:projectSources.messages.map(m=>m.id),fileMessageIds:projectSources.fileMessageIds,taskIds:projectSources.existingTasks.map(t=>t.id),projects:projectSources.projects.map(p=>({id:p.id,commitmentIds:p.commitments.map(c=>c.id)}))}
      if(projectSources)input.dialogueSources=dialogueSources(s,[...new Set([...(input.dialogueSources??[]).map(source=>source.id),...projectSources.messages.map(message=>message.id)])])
      // Topic context is optional. Keep existing sources and the reply reserve
      // in place, and never include it in group, remote, tool or scheduled work.
      if(!external && topicMemoryTurn(input)) {
        const indexWanted=topicIndexWanted(this.db,group.id)
        const reference=topicReference(s,turn.agentContactId,group.kind,{now:this.clock(),includeIndex:indexWanted})
        if(reference?.topic){
          const withTopic=JSON.stringify({...JSON.parse(prompt),currentTopic:reference.topic})
          const topicInstructions=system+'\n'+topicSystem
          if(withTopic.length<=100000&&input.budget.maxTokens-chatInputTokenBound(topicInstructions,withTopic)>=chatReplyTokenReserve(system,prompt,input.budget.maxTokens)){
            prompt=withTopic;system=topicInstructions;console.log(`${topicReceipt(reference.topic)} index=${indexWanted?'on':'off'} conversation=${group.id}`)
          }
        }
        if(reference?.index){
          const fitted=fitTopicIndex(system,prompt,reference.index,input.budget.maxTokens)
          if(fitted){prompt=fitted.prompt;system=fitted.system;console.log(`${topicIndexReceipt(fitted)} conversation=${group.id}`)}
          else console.log(`CHAT_TOPIC mode=index-skip entries=${reference.index.entries.length} budget=${input.budget.maxTokens} conversation=${group.id}`)
        }
      }
      // Use only spare budget after selecting context and allowing the full ordinary reply.
      if(assistantStickers){
        const stickerSystem=system+'\n'+assistantStickerSystem
        const replyReserve=Math.min(4096,input.budget.maxTokens-chatInputTokenBound(system,prompt))
        assistantStickers=input.budget.maxTokens-chatInputTokenBound(stickerSystem,prompt)>=replyReserve
        if(assistantStickers)system=stickerSystem
      }
      const inputTokenBound=chatInputTokenBound(system,prompt),remainingOutput=input.budget.maxTokens-inputTokenBound
      const admitted=prompt.length <= (input.skill?256000:100000) && remainingOutput>=(input.intakeOutputLimitRecovery?1024:64)
      // Counts only, private to the requester-side runtime. Never copy prompt,
      // quoted text, model output, keys or other members' private receipts.
      input.modelInputDiagnostic={budgetMaxTokens:input.budget.maxTokens,inputTokenBound,maxOutputTokens:admitted?Math.min(4096,remainingOutput):0,admitted}
      this.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=?').run(JSON.stringify(input),turn.id)
      if (!admitted) {
        turn.status = 'failed'; turn.failure = 'BUDGET_EXCEEDED'; turn.version++; turn.updatedAt = instant(); s.saveTurn(turn); return null
      }
      const selected=personalModelRuntime(this.db,s.c.actor,this.config)
      let apiKey: string
      try {
        if (input.consultationVersion && selected.source !== 'personal') throw new ApiError('MODEL_UNAVAILABLE')
        apiKey = external?.apiKey??personalModelKey(this.db,s.c.actor,this.config)
      } catch {
        turn.status = 'unavailable'; turn.failure = 'MODEL_UNAVAILABLE'; turn.version++; turn.updatedAt = instant(); s.saveTurn(turn); return null
      }
      const fence = Number(row.fence) + 1
      turn.status = 'running'; turn.version++; turn.updatedAt = instant(); s.saveTurn(turn)
      this.db.prepare('UPDATE chat_turns SET fence=?,lease_owner=?,lease_until=? WHERE id=?').run(fence, this.owner, Date.now() + 15000, turn.id)
      this.db.prepare('INSERT INTO chat_attempts VALUES (?,?,?,NULL)').run(turn.id, row.root_id!, instant())
      // Bounded file/project text work needs visible output: provider-default
      // reasoning can otherwise consume the entire 4096-token output cap.
      return { id: turn.id, ownerId: String(row.owner_id), fence, input,assistantStickers,externalEndpoint:external?.endpoint, modelInput: { provider:selected.provider,...(selected.provider==='deepseek'&&input.dailyChat&&(input.fileSource||input.projectExecution||input.intakeOutputLimitRecovery)?{reasoningEffort:'off' as const}:{}),system, prompt, model:external?.model??selected.model, maxTokens: Math.min(4096,remainingOutput), timeoutMs: input.budget.maxSeconds * 1000 }, credential: { apiKey } }
    }))
    if (!job) return false
    const controller = new AbortController(), started = Date.now(),unregister=registerChatCall(job.id,controller)
    const lease = setInterval(() => {
      try { transaction(this.db, () => { reconcileChat(this.db, this.config); const row = this.db.prepare('SELECT status,fence FROM chat_turns WHERE id=?').get(job.id)!; if (row.status !== 'running' || row.fence !== job.fence) controller.abort(); else this.db.prepare('UPDATE chat_turns SET lease_until=? WHERE id=?').run(Date.now() + 15000, job.id) }) } catch (error) { if (!isDatabaseBusy(error)) controller.abort() }
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
      try{transaction(this.db,()=>{if(!saveChatDelta(service(this.db,job.ownerId,this.config,job.id),job.id,job.fence,draft))controller.abort()});lastPublished=Date.now()}catch(error){if(!isDatabaseBusy(error))controller.abort()}
    }:undefined
    let result: ModelResult
    try { result = await Promise.race([job.externalEndpoint?this.externalCall({endpoint:job.externalEndpoint,model:job.modelInput.model,apiKey:job.credential.apiKey,text:job.modelInput.prompt,maxTokens:job.modelInput.maxTokens,timeoutMs:job.modelInput.timeoutMs},controller.signal):this.call(job.modelInput, controller.signal, job.credential,onDelta), expired]) } catch { result = { text: '', failure: 'MODEL_FAILED', inputTokens: null, outputTokens: null, elapsedMs: Date.now() - started } }
    finally { unregister(); if (timeout) clearTimeout(timeout) }
    try { await waitForWorkerDatabase(() => transaction(this.db, () => {
      const usage = ModelUsage.parse({ inputTokens: result.inputTokens, outputTokens: result.outputTokens, elapsedMs: result.elapsedMs, cost: null, currency: null })
      // Actual returned usage survives cancellation even when output is fenced.
      this.db.prepare('UPDATE chat_attempts SET usage_json=? WHERE turn_id=?').run(JSON.stringify(usage), job.id)
      const diagnostic=(stage:string,errorCategory?:string)=>{
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
      const s = service(this.db, job.ownerId, this.config,job.id), { turn, group } = s.checkTurnInput(job.id)
      turn.usage = usage
      if (result.failure) { turn.status = 'failed'; turn.failure = result.failure==='OUTPUT_LIMIT'?'BUDGET_EXCEEDED':'MODEL_FAILED';diagnostic(result.failure==='OUTPUT_LIMIT'?'output_limit':'provider_error') }
      else if (result.inputTokens===null||result.outputTokens===null) { turn.status='failed';turn.failure='MODEL_FAILED';diagnostic('usage_missing') }
      else if (result.inputTokens + result.outputTokens > job.input.budget.maxTokens || result.outputTokens>job.modelInput.maxTokens || result.elapsedMs > job.input.budget.maxSeconds * 1000) { turn.status = 'failed'; turn.failure = 'BUDGET_EXCEEDED';diagnostic('usage_limit') }
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
          const stickerReply = job.input.dailyChat && group.kind !== 'group' && !job.input.assistantMode && !job.externalEndpoint
            ? readAssistantStickerReply(result.text) : undefined
          const stickerId = job.assistantStickers ? stickerReply?.id : undefined
          const stickerText = stickerReply && (stickerReply.answer ?? (stickerId
            ? assistantStickerFallback(stickerId) : '这张大肥鱼表情暂时发不了。'))
          const projectOutput=!stickerReply&&job.input.assistantProjectEntry&&/^\s*\{/.test(result.text)?JSON.parse(result.text):null
          const coordinated=['project','project_decision','reply'].includes(projectOutput?.kind)?PersonalAssistantOutput.parse(projectOutput):job.input.assistantMode==='coordinate'?PersonalAssistantOutput.parse(JSON.parse(result.text)):null
          if(coordinated?.kind==='project_decision'){
            const sources=job.input.projectEntryInventory!,p=sources.projects.find(p=>p.id===coordinated.projectId)
            if(!job.input.assistantProjectEntry||!currentTurnText(s,turn.id).includes(coordinated.authorizationEvidence)||!p?.commitmentIds.includes(coordinated.commitmentId))throw new Error('INVALID_MODEL_OUTPUT')
            outputStage='persistence'
            const project=resolveAssistantProjectDecision(s,coordinated.projectId,{turnId:turn.id,messageId:turn.inputMessageId},coordinated)
            turn.assistantReceipt={kind:'work_task',taskId:project.workTaskId,conversationId:group.id,status:'ready'}
            const message=s.message(group.id,{senderContactId:turn.agentContactId,origin:'service',text:`已将这次决定记入“${project.title}”，按你的补充继续推进；后续实际结果会回到这段聊天。`,mentions:[],resources:[],actionIds:[],turnId:turn.id})
            turn.status='succeeded';turn.outputMessageId=message.id;turn.failure=null
          }else if(coordinated?.kind==='project'){
            const p=coordinated.project,sources=job.input.projectEntryInventory!,current=currentTurnText(s,turn.id)
            if(!job.input.assistantProjectEntry||!current.includes(p.authorizationEvidence)||p.sourceMessageIds.some(id=>!sources.messageIds.includes(id))||p.sourceFileMessageIds.some(id=>!sources.fileMessageIds.includes(id))||p.existingTaskIds.some(id=>!sources.taskIds.includes(id))||p.commitments.some(c=>c.existingTaskId&&!sources.taskIds.includes(c.existingTaskId)))throw new Error('INVALID_MODEL_OUTPUT')
            // Choosing self while eligible options were shown needs a model
            // explanation of the scope mismatch or the owner's explicit choice.
            // The server never guesses specialty from names or keyword lists.
            if(p.commitments.some(c=>c.kind==='agent'&&(!c.contactId||c.contactId===turn.agentContactId))&&sources.specialistIds.length&&!p.coordinatorFallbackReason)throw new Error('INVALID_MODEL_OUTPUT')
            if(p.commitments.some(c=>c.contactId&&c.contactId!==turn.agentContactId&&!(c.kind==='agent'?sources.specialistIds:sources.humanIds).includes(c.contactId)))throw new Error('INVALID_MODEL_OUTPUT')
            outputStage='persistence'
            const project=createAssistantProject(s,p,{turnId:turn.id,conversationId:group.id,messageId:turn.inputMessageId})
            turn.assistantReceipt={kind:'work_task',taskId:project.workTaskId,conversationId:group.id,status:'ready'}
            const assignments=project.commitments.map(c=>`${s.contact(c.contactId??turn.agentContactId).displayName}：${c.title}${c.dueDate?`（${c.dueDate}）`:c.dueAt?`（${c.dueAt}）`:''}`).join('\n')
            const message=s.message(group.id,{senderContactId:turn.agentContactId,origin:'service',text:`已记录“${p.title}”的目标和分工，并开始持续跟进。${project.dueDate?`日期为 ${project.dueDate}（${project.timeZone}），按当天结束检查进度，具体时刻未指定。`:project.dueAt?`约定时间为 ${project.dueAt}。`:'尚未指定日期。'}\n${assignments}\n实际结果与需要你决定的事项会回到这段聊天。${p.commitments.some(c=>c.kind==='human')?'真人分工尚未代表对方接受，未向他人发送消息。':''}`,mentions:[],resources:[],actionIds:[],turnId:turn.id})
            turn.status='succeeded';turn.outputMessageId=message.id;turn.failure=null
          }else{
          if(coordinated?.kind==='collaborate'&&!assistantComplexRequest(s.projectedMessage(turn.inputMessageId).text??''))throw new Error('INVALID_MODEL_OUTPUT')
          if(coordinated?.kind==='team'){
            if(!assistantComplexRequest(currentTurnText(s,turn.id)))throw new Error('INVALID_MODEL_OUTPUT')
            const allowed=[...assistantPeople(s),...assistantTeamAgents(s)].map(c=>c.id)
            if(coordinated.contactIds.some(id=>!allowed.includes(id)))throw new Error('INVALID_MODEL_OUTPUT')
            outputStage='persistence'
            const work=createWork(s,{title:coordinated.title,goal:currentTurnText(s,turn.id),contactIds:coordinated.contactIds,agentContactId:null},{turnId:turn.id,conversationId:group.id,messageId:turn.inputMessageId})
            turn.assistantReceipt={kind:'work_task',taskId:work.id,conversationId:null,status:'proposed'}
            const message=s.message(group.id,{senderContactId:turn.agentContactId,origin:'service',text:`已保存“${work.title}”协作任务建议。确认后才会创建群并直接加入所选成员；任务承接仍需各自接受，尚未执行或完成。`,mentions:[],resources:[],actionIds:[],turnId:turn.id})
            turn.status='succeeded';turn.outputMessageId=message.id;turn.failure=null
          }else if(coordinated?.kind==='delegate'){
            outputStage='persistence'
            turn.assistantReceipt=delegateWork(s,turn,job.input,coordinated,{tokens:result.inputTokens!+result.outputTokens!,seconds:result.elapsedMs/1000})
            const receipt=turn.assistantReceipt
            const message=s.message(group.id,{senderContactId:turn.agentContactId,origin:'service',text:`已将本条需求提交到你的“${receipt.displayName}”专属聊天。${receipt.status==='queued'?'请求已排队，实际回复和交付尚未完成。':'当前模型不可用，可打开同一聊天查看状态。'}`,mentions:[],resources:[],actionIds:[],turnId:turn.id})
            turn.outputMessageId=message.id;turn.failure=null
          }else{
          const groupOutput=group.kind==='group'?GroupAssistantOutput.parse(JSON.parse(result.text)):null
          const output = groupOutput?{answer:groupOutput.answer,waitingInput:false,group:null,actions:[]}:coordinated?.kind==='reply'?{answer:coordinated.answer,waitingInput:false,group:null,actions:[]}:coordinated?.kind==='collaborate'?{answer:coordinated.answer,waitingInput:false,group:coordinated.group,actions:[]}:job.input.dailyChat?{answer:Text.parse(stickerText??(job.input.assistantProjectEntry?assistantReplyText(result.text):result.text)),waitingInput:false,group:null,actions:[]}:ChatModelOutput.parse(JSON.parse(result.text))
          if(job.input.dailyChat&&!output.answer.trim())throw new Error('INVALID_MODEL_OUTPUT')
          if(job.input.libraryRead){
            const allowed=new Set(job.input.libraryRead.sources.map(source=>source.label))
            if([...output.answer.matchAll(/\[(R\d+)\]/g)].some(match=>!allowed.has(match[1]!)))throw new Error('INVALID_MODEL_OUTPUT')
          }
          if (output.waitingInput && (output.group || output.actions.length)) throw new Error('INVALID_MODEL_OUTPUT')
          const payloads = [...output.actions]
          for (const payload of payloads) {
            if (payload.kind === 'create_group') throw new Error('INVALID_MODEL_OUTPUT')
            if ('task' in payload && !job.input.context.some(r => r.kind === 'task' && r.ref.id === payload.task.id && r.ref.version === payload.task.version)) throw new Error('INVALID_MODEL_OUTPUT')
            if (payload.kind === 'run_task' && payload.inputArtifactRefs.some(ref => !job.input.context.some(r => r.kind === 'artifact' && r.ref.id === ref.id && r.ref.version === ref.version))) throw new Error('INVALID_MODEL_OUTPUT')
          }
          if (output.group) {
            if (group.kind !== 'personal' || s.contact(turn.agentContactId).profile.role!=='coordinator' || output.group.plan.labId !== s.c.labId) throw new Error('INVALID_MODEL_OUTPUT')
            for (const ref of output.group.sharedContext.artifactRefs) if (!job.input.context.some(r => r.kind === 'artifact' && r.ref.id === ref.id && r.ref.version === ref.version)) throw new Error('INVALID_MODEL_OUTPUT')
            if(coordinated&&output.group.sharedContext.selectedText!==null&&output.group.sharedContext.selectedText!==s.projectedMessage(turn.inputMessageId).text)throw new Error('INVALID_MODEL_OUTPUT')
            if(coordinated){const allowed=assistantPeople(s).map(c=>c.id);if(output.group.contactIds.some(id=>!allowed.includes(id)))throw new Error('INVALID_MODEL_OUTPUT')}
            const created = s.c.handlers.createPlan({ params: {}, query: {}, headers: {}, body: output.group.plan }) as { data: { id: string; version: number } }
            this.db.prepare('INSERT INTO chat_plan_sources VALUES (?,?)').run(created.data.id,turn.id)
            payloads.push({ kind: 'create_group', title: output.group.title, plan: { id: created.data.id, version: created.data.version }, contactIds: output.group.contactIds, sharedContext: output.group.sharedContext })
          }
          for (const payload of payloads) s.validatePayload(payload, group.id)
          if(groupOutput)for(const request of groupOutput.requests)queueGroupNotice(s,group.id,turn.inputMessageId,turn.agentContactId,request)
          outputStage='persistence'
          const message = s.message(group.id, { senderContactId: turn.agentContactId, origin: 'model', text: output.answer, mentions: [], resources: [], actionIds: [], turnId: turn.id })
          // Keep the transport metadata private and bound to this exact canonical message.
          if (stickerId) this.db.prepare("UPDATE chat_turns SET request_json=json_set(request_json,'$.assistantSticker',json(?)) WHERE id=?")
            .run(JSON.stringify({ messageId: message.id, id: stickerId }), turn.id)
          const actions = payloads.map(payload => s.addAction(turn, message.id, payload)); message.actionIds = actions.map(a => a.id)
          this.db.prepare('UPDATE chat_messages SET document=? WHERE id=?').run(JSON.stringify(message), message.id)
          turn.status = output.waitingInput ? 'waiting_input' : 'succeeded'; turn.outputMessageId = message.id; turn.failure = null
          // New replies classify deliverables. Pre-classifier outputs preserve the
          // original explicit-work route; ordinary chat is never in that route.
          if(coordinated?.kind==='reply'&&job.input.assistantMode==='coordinate'&&(coordinated.recordWork??true))turn.assistantReceipt=recordAssistantAnswerWork(s,turn.id,group.id,turn.agentContactId,currentTurnText(s,turn.id),message.id)
          if(coordinated?.kind==='collaborate'){const payload=payloads.find(p=>p.kind==='create_group')!;if(payload.kind==='create_group')turn.assistantReceipt={kind:'collaborate',planId:payload.plan.id,actionIds:actions.map(a=>a.id)}}
          }
          }
          }
          this.db.exec('RELEASE chat_model_output')
        } catch(error) { this.db.exec('ROLLBACK TO chat_model_output; RELEASE chat_model_output');diagnostic(outputStage,error instanceof z.ZodError?'schema':error instanceof ApiError?'business':(error as {code?:unknown})?.code==='ERR_SQLITE_ERROR'?'sqlite':'unknown'); turn.status = 'failed'; turn.failure = error instanceof ApiError&&(error.code==='GROUP_NOTICE_LIMIT'||error.code==='GROUP_ASSIGN_NOT_AVAILABLE')?error.code:error instanceof AssistantBudgetError?'BUDGET_EXCEEDED':(job.input.purpose==='create_agent'||job.input.assistantMode==='coordinate')&&error instanceof ApiError&&error.code==='RATE_LIMITED'?'AGENT_LIMIT_REACHED':outputStage==='persistence'?'MODEL_FAILED':'INVALID_MODEL_OUTPUT'; turn.outputMessageId = null;delete turn.assistantReceipt;if(job.input.purpose==='create_agent')turn.createdAgent=null }
      }
      turn.version++; turn.updatedAt = instant(); s.saveTurn(turn)
      this.db.prepare('UPDATE chat_turns SET lease_owner=NULL,lease_until=NULL WHERE id=?').run(turn.id)
      if(turn.status==='succeeded'&&!job.externalEndpoint&&topicMemoryTurn(job.input)){try{const c=s.contact(turn.agentContactId);if(group.kind==='personal'&&c.identity.kind==='personal_agent'&&c.identity.ownerMemberId===s.c.actor.id&&personalModelRuntime(this.db,s.c.actor,this.config).source==='personal')queueTopicCuration(this.db,s.c.actor.id,c.id,group.id,turn.id)}catch{}}
      if(result.failure==='OUTPUT_LIMIT')queueIntakeOutputRecovery(s,turn.id)
    })) } finally { clearInterval(lease) }
    return true
  }
}
