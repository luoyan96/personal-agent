import type {Contact,Conversation,ChatMessage,ChatAction,AgentTurn,RequestFor,ResponseFor,RouteName} from '@research-agent-platform/contracts';
import {ApiClient,ApiError,CommandSlot,Intent} from './api';
import type {ChatSource,ChatSnapshot,ContactView,ConversationView,MessageView,ChatCardView,MentionSelection} from './chat-view';
import {labels} from './contract-projection';

export const chatBudget={maxTokens:12000,maxSeconds:120};
const identityLabels:Record<Contact['identity']['kind'],string>={human:'真人',personal_agent:'个人 AI',public_agent:'公共 AI'};
const availabilityLabels:Record<Contact['availability']['status'],string>={available:'服务配置可用',unavailable:'不可用',disabled:'已停用'};
const reasonLabels:Record<NonNullable<Contact['availability']['reason']>,string>={platform_disabled:'平台模型已停用',lab_disabled:'实验室模型已停用',missing_credentials:'未配置模型凭据',capability_unavailable:'能力不可用',owner_authorization_required:'需主人授权',not_connected:'尚未接通'};
const memberLabels:Record<Conversation['members'][number]['status'],string>={invited:'待加入',joined:'已加入',declined:'已拒绝',revoked:'已撤权'};
const turnLabels:Record<AgentTurn['status'],string>={queued:'排队中',running:'生成中',waiting_input:'等待补充',succeeded:'回复已保存',unavailable:'模型不可用',failed:'生成失败',interrupted:'已中断，用量可能未知',cancelled:'已取消'};
const actionLabels:Record<ChatAction['status'],string>={proposed:'建议待确认',applied:'服务已执行此动作',dismissed:'已放弃',stale:'建议已失效'};
type Invitation=ResponseFor<'chatInvitations'>['data'][number];
const invitationLabels:Record<Invitation['status'],string>={pending:'待接受群邀请',accepted:'已加入群',declined:'已拒绝群邀请',revoked:'群邀请已撤回'};
const refText=(ref:{id:string;version:number})=>`${ref.id} · v${ref.version}`;
type Schedule=Extract<ChatAction['payload'],{kind:'invite_task'}>['schedule'];
function scheduleText(schedule:Schedule):string {
  const dated=(value:Schedule['suggested'])=>value?`${value.value.kind==='date'?value.value.date+' · '+value.value.timezone:value.value.at}（${value.confirmed?'已确认':'待确认'}）`:'未约定';
  return `建议时间：${dated(schedule.suggested)}\n硬性截止：${dated(schedule.hardDeadline)}\n承诺时间：${dated(schedule.committed)}\n预计人力：${schedule.estimatedHumanHours??'未约定'}${schedule.estimatedHumanHours===null?'':' 小时'}\n检查节点：${schedule.checkpoint?(schedule.checkpoint.kind==='date'?schedule.checkpoint.date+' · '+schedule.checkpoint.timezone:schedule.checkpoint.at):'未约定'}`;
}

export function contactProjection(contact:Contact, contacts:Contact[], members:{id:string;displayName:string}[],currentMemberId?:string):ContactView {
  const identity=contact.identity;
  const owner=identity.kind==='human'?'本实验室成员':`主人：${members.find(m=>m.id===identity.ownerMemberId)?.displayName ?? contacts.find(c=>c.identity.kind==='human'&&c.identity.memberId===identity.ownerMemberId)?.displayName ?? identity.ownerMemberId}`;
  return {id:contact.id,name:contact.displayName,identity:identityLabels[identity.kind],owner,icon:identity.kind==='human'?'user':'robot',canOpenDirect:identity.kind==='human'||identity.kind==='personal_agent'&&identity.ownerMemberId===currentMemberId,directHint:identity.kind==='public_agent'?'公共 AI 在任务群中使用。':identity.kind==='personal_agent'?'其他成员的个人 AI 需主人授权加入任务群，私人聊天仅限主人。':undefined,availability:identity.kind==='human'?'真人 · 在线与空闲状态未提供':`${availabilityLabels[contact.availability.status]}${contact.availability.reason?` · ${reasonLabels[contact.availability.reason]}`:''}`};
}

/** Complete immutable action payload, before any confirm control is displayed. */
export function actionDetail(action:ChatAction, contacts:Contact[]):string {
  const name=(id:string)=>`${contacts.find(c=>c.id===id)?.displayName??id}（${id}）`;
  const payload=action.payload;
  switch(payload.kind) {
    case 'create_group':return `群目标：${payload.title}\n方案：${refText(payload.plan)}\n成员：${payload.contactIds.map(name).join('、')}\n分享片段：${payload.sharedContext.selectedText??'无'}\n分享文件：${payload.sharedContext.artifactRefs.map(refText).join('、')||'无'}\n只分享上述片段与文件；加入群不代表接受任务。`;
    case 'invite_contact':return `邀请加入群：${name(payload.contactId)}\n群邀请与任务承接分别同意。不会分享个人助理历史。`;
    case 'invite_task':return `邀请承接：${name(payload.contactId)}\n任务：${refText(payload.task)}\n范围：${payload.scope}\n${scheduleText(payload.schedule)}\n对方接受前不记为承诺。`;
    case 'run_task':return `执行对象：${name(payload.contactId)}\n任务：${refText(payload.task)}\n能力：${refText(payload.capability)} · ${payload.capability.visibility}\n预算上限：${payload.budget.maxTokens} tokens / ${payload.budget.maxSeconds} 秒\n授权输入：${payload.inputArtifactRefs.map(refText).join('、')||'无'}\n候选成果需提交和指定版本验收。`;
  }
}

async function allPages<T>(fetchPage:(cursor?:string)=>Promise<{data:T[];nextCursor:string|null}>,signal:AbortSignal):Promise<T[]> {
  const result:T[]=[],seen=new Set<string>();let cursor:string|undefined;
  do {signal.throwIfAborted();const page=await fetchPage(cursor);signal.throwIfAborted();result.push(...page.data);cursor=page.nextCursor??undefined;if(cursor){if(seen.has(cursor)||seen.size>=100)throw new ApiError('INVALID_RESPONSE','分页响应无法继续，请重新读取。');seen.add(cursor);}}while(cursor);
  return result;
}

export class ChatApiSource implements ChatSource {
  readonly pollIntervalMs=5000;
  private personal?:ResponseFor<'personalConversation'>['data'];
  private contacts:Contact[]=[];
  private conversations=new Map<string,Conversation>();
  private actions=new Map<string,ChatAction>();
  private invitations=new Map<string,Invitation>();
  private turns=new Map<string,AgentTurn>();
  private links=new Map<string,string>();
  private taskRefs=new Map<string,{kind:'task';ref:{id:string;version:number}}[]>();
  private taskInvites=new Map<string,{assignmentVersion:number;taskVersion:number}>();
  private taskVersions=new Map<string,number>();
  private contextRefs=new Map<string,Map<string,NonNullable<RequestFor<'sendChatMessage'>['body']['context']>[number]>>();
  private runs=new Map<string,{run:ResponseFor<'getRun'>['data'];taskVersion:number}>();
  private personalSlot=new CommandSlot();
  private disposed=false;
  private isLabManager=false;
  constructor(private api:ApiClient,private ownerId:string,private members:{id:string;displayName:string}[],private securityFailure:(error:ApiError)=>void,private slot:CommandSlot=new CommandSlot()) {}
  dispose() {this.disposed=true;this.personal=undefined;this.contacts=[];this.conversations.clear();this.actions.clear();this.invitations.clear();this.turns.clear();this.links.clear();this.taskRefs.clear();this.taskInvites.clear();this.taskVersions.clear();this.contextRefs.clear();this.runs.clear();this.personalSlot.discard();}
  discardPending(){this.slot.discard();}
  private async execute<K extends RouteName>(route:K,body:RequestFor<K>['body'],params:RequestFor<K>['params'],signal:AbortSignal):Promise<ResponseFor<K>> {
    signal.throwIfAborted();
    const retained=this.slot.intent;
    if(retained&&(retained.route!==route||JSON.stringify(retained.body)!==JSON.stringify(body)||JSON.stringify(retained.params)!==JSON.stringify(params)))throw new ApiError('PENDING_INTENT','上一请求结果未确认，请重试同一内容或明确放弃原请求后再操作。');
    const intent=retained as Intent<K>|undefined ?? new Intent(route,body,params);
    try {return await this.slot.run(this.api,intent,signal);}catch(error){this.handleSecurity(error);throw error;}
  }
  private handleSecurity(error:unknown) {
    if(error instanceof ApiError&&['UNAUTHENTICATED','FORBIDDEN','NOT_FOUND'].includes(error.code)){this.dispose();this.securityFailure(error);}
  }
  async read(signal:AbortSignal):Promise<ChatSnapshot> {
    try {
      const auth=await this.api.read('session',{}, {},signal);
      if(auth.data.member.id!==this.ownerId)throw new ApiError('UNAUTHENTICATED','登录身份已变化，请重新进入聊天。');
      this.isLabManager=auth.data.isLabManager;
      if(!this.personal) {
        const intent=this.personalSlot.intent as Intent<'personalConversation'>|undefined??new Intent('personalConversation',{},{});
        this.personal=(await this.personalSlot.run(this.api,intent,signal)).data;
      }
      const [contacts,conversations,invitations]=await Promise.all([
        allPages<Contact>(cursor=>this.api.read('chatContacts',{}, {limit:100,...(cursor?{cursor}:{})},signal),signal),
        allPages<Conversation>(cursor=>this.api.read('chatConversations',{}, {limit:100,...(cursor?{cursor}:{})},signal),signal),
        allPages<Invitation>(cursor=>this.api.read('chatInvitations',{}, {limit:100,...(cursor?{cursor}:{})},signal),signal),
      ]);
      signal.throwIfAborted();if(this.disposed)throw new DOMException('Disposed','AbortError');
      this.contacts=contacts;
      const nextConversations=new Map<string,Conversation>(),nextActions=new Map<string,ChatAction>(),nextTaskRefs=new Map<string,{kind:'task';ref:{id:string;version:number}}[]>();
      const views:ConversationView[]=[];
      for(const listed of conversations) {
        const [detail,messages,actions]=await Promise.all([
          this.api.read('chatConversation',{id:listed.id},{},signal),
          allPages<ChatMessage>(cursor=>this.api.read('chatMessages',{id:listed.id},{limit:100,...(cursor?{cursor}:{})},signal),signal),
          allPages<ChatAction>(cursor=>this.api.read('chatActions',{id:listed.id},{limit:100,...(cursor?{cursor}:{})},signal),signal),
        ]);
        signal.throwIfAborted();if(this.disposed)throw new DOMException('Disposed','AbortError');
        const conversation=detail.data;nextConversations.set(conversation.id,conversation);actions.forEach(a=>nextActions.set(a.id,a));
        const refs:{kind:'task';ref:{id:string;version:number}}[]=[];
        const taskDetails=new Map<string,ResponseFor<'task'>['data']>();
        const taskIds=[...new Set([...conversation.taskIds,...messages.flatMap(m=>m.resources.filter(r=>r.kind==='task').map(r=>r.ref.id))])];
        for(const taskId of taskIds) {const response=await this.api.read('task',{id:taskId},{},signal),task='task' in response.data?response.data.task:response.data;taskDetails.set(taskId,response.data);if('task' in response.data&&refs.length<20)refs.push({kind:'task',ref:{id:task.id,version:task.version}});}
        nextTaskRefs.set(conversation.id,refs);
        const contexts:NonNullable<ConversationView['contextChoices']>=[],uploadTasks:NonNullable<ConversationView['uploadTasks']>=[],contextMap=new Map<string,NonNullable<RequestFor<'sendChatMessage'>['body']['context']>[number]>();
        for(const data of taskDetails.values()) {
          if(!('task' in data))continue;
          const task=data.task,key=`task:${task.id}:${task.version}`;this.taskVersions.set(task.id,task.version);
          contexts.push({key,label:`任务：${task.title} · v${task.version}`});contextMap.set(key,{kind:'task',ref:{id:task.id,version:task.version}});
          if(task.allowedActions.includes('upload'))uploadTasks.push({id:task.id,label:task.title,version:task.version});
          for(const artifact of data.artifacts??[])if(artifact.mediaType==='text/plain'&&artifact.accessStatus!=='revoked') {
            const artifactKey=`artifact:${artifact.id}:${artifact.version}`;
            contexts.push({key:artifactKey,label:`${artifact.filename} · v${artifact.version} · ${task.title}`,requiresKey:key});contextMap.set(artifactKey,{kind:'artifact',ref:{id:artifact.id,version:artifact.version}});
          }
        }
        this.contextRefs.set(conversation.id,contextMap);
        const projected:MessageView[]=[];
        for(const message of [...new Map(messages.map(m=>[m.id,m])).values()].sort((a,b)=>a.sequence-b.sequence))projected.push(await this.messageProjection(message,actions,taskDetails,signal));
        const joined=conversation.members.filter(m=>m.status==='joined').map(m=>contacts.find(c=>c.id===m.contactId)).filter((c):c is Contact=>!!c);
        views.push({id:conversation.id,title:conversation.title,subtitle:conversation.kind==='personal'?`个人 AI · 主人：${auth.data.member.displayName}`:conversation.kind==='group'?'任务群 · 加入群与任务承接分别确认':'真人私聊',preview:messages.at(-1)?.text??'暂无消息',pinned:conversation.kind==='personal'&&conversation.ownerMemberId===this.ownerId,group:conversation.kind==='group',canSend:conversation.allowedActions.includes('send'),messages:projected,members:conversation.members.map(m=>{const contact=contacts.find(c=>c.id===m.contactId);return {...(contact?contactProjection(contact,contacts,this.members,this.ownerId):{id:m.contactId,name:m.contactId,identity:'身份待确认',owner:'归属待确认',icon:'user' as const,availability:''}),availability:memberLabels[m.status],canMention:m.status==='joined'};}),sendTargets:joined.filter(c=>c.identity.kind!=='human').map(c=>({id:c.id,label:c.displayName})),contextChoices:contexts,uploadTasks});
      }
      signal.throwIfAborted();if(this.disposed)throw new DOMException('Disposed','AbortError');
      this.conversations=nextConversations;this.actions=nextActions;this.taskRefs=nextTaskRefs;this.invitations=new Map(invitations.map(i=>[i.id,i]));
      return {contacts:contacts.map(c=>contactProjection(c,contacts,this.members,this.ownerId)),conversations:views,notice:'消息与操作状态来自服务 · 群内 @不会自动执行任务',invitations:invitations.map(i=>({id:i.id,title:i.title,detail:`邀请联系人：${contacts.find(c=>c.id===i.invitedContactId)?.displayName??i.invitedContactId}\n邀请人：${this.members.find(m=>m.id===i.invitedByMemberId)?.displayName??i.invitedByMemberId}\n加入群不代表接受任务，也不分享个人助理历史。`,status:invitationLabels[i.status],actions:i.status==='pending'?[{id:`invitation:accept:${i.id}`,label:'接受群邀请'},{id:`invitation:decline:${i.id}`,label:'拒绝群邀请'}]:[]}))};
    } catch(error){this.handleSecurity(error);throw error;}
  }
  private async messageProjection(message:ChatMessage,actions:ChatAction[],taskDetails:Map<string,ResponseFor<'task'>['data']>,signal:AbortSignal):Promise<MessageView> {
    const contact=this.contacts.find(c=>c.id===message.senderContactId),cards:ChatCardView[]=[];
    for(const action of actions.filter(a=>a.sourceMessageId===message.id)) {
      let planDetail='',exact=true;
      if(action.payload.kind==='create_group') {
        const plan=(await this.api.read('getPlan',{id:action.payload.plan.id},{},signal)).data;
        if(plan.id!==action.payload.plan.id)throw new ApiError('INVALID_RESPONSE','方案响应与建议引用不符，未显示确认。');
        exact=plan.version===action.payload.plan.version&&(action.status!=='proposed'||plan.status==='draft');
        planDetail=`\n方案目标：${plan.goal}\n${plan.proposedItems.map((item,i)=>`分工 ${i+1}：${item.title}\n目标：${item.goal}\n交付：${item.deliverable}\n验收：${item.acceptanceCriteria}\n分配：${item.allocation.kind==='invitation'?'邀请 '+(new Map(this.members.map(m=>[m.id,m.displayName])).get(item.allocation.memberId)??item.allocation.memberId):item.allocation.kind==='self'?'本人承担':item.allocation.kind==='public_agent'?'公共 AI · '+(item.allocation.capability?refText(item.allocation.capability):'能力待确定'):'开放认领'}\n${scheduleText(item.schedule)}\n依赖：${item.dependencies.join('、')||'无'}\n输入引用：${item.inputArtifactIds.join('、')||'无'}\n预算：${item.budget?item.budget.maxTokens+' tokens / '+item.budget.maxSeconds+' 秒':'未设定'}`).join('\n\n')}\n待澄清：${plan.unresolvedQuestions.join('；')||'无'}${exact?'':'\n方案版本或状态已变化，请重新提出需求，不能确认旧建议。'}`;
      }
      cards.push({kind:'invitation',title:({create_group:'建立任务群建议',invite_contact:'加入群建议',invite_task:'任务承接邀请建议',run_task:'公共 AI 执行建议'})[action.payload.kind],detail:actionDetail(action,this.contacts)+planDetail+`\n建议有效期：${action.expiresAt}`,status:action.status==='proposed'&&!exact?'建议已失效':action.status==='applied'&&action.payload.kind==='create_group'?'任务群已建立':actionLabels[action.status],actions:action.allowedDecisions.filter(d=>d!=='confirm'||exact&&Date.parse(action.expiresAt)>Date.now()).map(decision=>({id:`decision:${decision}:${action.id}`,label:decision==='confirm'?'确认上述完整范围':'放弃此建议'}))});
    }
    if(message.turnId) {
      try {
        const turn=(await this.api.read('chatTurn',{id:message.turnId},{},signal)).data;this.turns.set(turn.id,turn);
        const turnActions=turn.allowedActions.flatMap(a=>a==='cancel'?[{id:`turn:cancel:${turn.id}`,label:'取消本次生成'}]:turn.remainingBudget?[{id:`turn:retry:${turn.id}`,label:`明确重试（剩余 ${turn.remainingBudget.maxTokens} tokens / ${turn.remainingBudget.maxSeconds} 秒）`}]:[]);
        if(turn.status==='unavailable'&&this.isLabManager){this.links.set('settings:lab:ai','/lab/settings');turnActions.push({id:'settings:lab:ai',label:'配置实验室模型'});}
        cards.push({kind:['failed','unavailable','interrupted'].includes(turn.status)?'error':'run',title:'个人智能体回复状态',detail:`${turn.failure??''}${turn.availability.reason?' · '+reasonLabels[turn.availability.reason]:''}\n总预算：${turn.budget.maxTokens} tokens / ${turn.budget.maxSeconds} 秒\n剩余额度：${turn.remainingBudget?turn.remainingBudget.maxTokens+' tokens / '+turn.remainingBudget.maxSeconds+' 秒':'未知或已耗尽，不能重试'}\n用量：${turn.usage?`${turn.usage.inputTokens??'未知'} 输入 / ${turn.usage.outputTokens??'未知'} 输出 tokens`:'未知'}\n生成回复不代表任务已完成。${turn.status==='unavailable'&&!this.isLabManager?'\n请联系实验室负责人检查模型设置。':''}`,status:turnLabels[turn.status],actions:turnActions});
      }catch(error){if(!(error instanceof ApiError&&error.code==='NOT_FOUND'))throw error;}
    }
    for(const resource of message.resources) {
      if(resource.kind==='task') {
        const data=taskDetails.get(resource.ref.id)??(await this.api.read('task',{id:resource.ref.id},{},signal)).data,task='task' in data?data.task:data;
        const linkId=`resource:task:${task.id}`;this.links.set(linkId,`/tasks/${task.id}`);
        const pending='pendingInvitation' in data?data.pendingInvitation:null;
        const decisions=pending&&task.allowedActions.includes('decide')?this.taskInvitationActions(pending.id,pending.version,task.version):[];
        cards.push({kind:pending?'invitation':'run',title:task.title,detail:`任务：${refText(resource.ref)}\n当前版本：${task.version}${pending?'\n邀请范围：'+pending.scope+'\n'+scheduleText(pending.schedule)+'\n接受任务与加入群分别确认。':''}`,status:pending?'待本人接受任务':'status' in task?labels[task.status]:'授权摘要',actions:[...decisions,{id:linkId,label:'查看任务与承接'}]});
      } else if(resource.kind==='run') {
        const run=(await this.api.read('getRun',{id:resource.ref.id},{},signal)).data;
        const data=taskDetails.get(run.taskId)??(await this.api.read('task',{id:run.taskId},{},signal)).data,task='task' in data?data.task:data;
        this.runs.set(run.id,{run,taskVersion:task.version});
        const linkId=`resource:run:${run.id}`;this.links.set(linkId,`/tasks/${run.taskId}`);
        const candidate=run.candidate;
        const candidateText=candidate?`\n候选：${candidate.title}\n${candidate.items.map(item=>`要求：${item.requirement}\n判断：${item.assessment==='gap'?'存在缺口':'有输入材料支持'}${item.gap?'\n缺口：'+item.gap:''}\n${item.citations.map(c=>`引用 ${c.artifactId}：${c.quote}`).join('\n')}`).join('\n\n')}\n限制：${candidate.limitations.join('；')||'未报告'}\n候选不等于提交或验收。`:'';
        cards.push({kind:run.status==='succeeded'?'result':'run',title:'公共 AI 运行',detail:`运行 ${refText(resource.ref)}\n当前版本 ${run.version} · 绑定任务 v${run.taskVersion} / 当前 v${task.version}${run.failure?'\n'+run.failure:''}${candidateText}`,status:`${run.status}${run.status==='succeeded'?run.candidateDeliverableId?' · 已提交交付，验收以交付记录为准':' · 候选成果仍需提交与验收':''}`,actions:[...(run.allowedActions.includes('cancel')?[{id:`publicrun:cancel:${run.id}`,label:'取消此公共运行'}]:[]),...(run.allowedActions.includes('submit_candidate')?[{id:`candidate:submit:${run.id}`,label:'确认提交此候选为交付'}]:[]),{id:linkId,label:'查看运行与成果'}]});
        const delivery='task' in data?data.deliverables.find(d=>d.id===run.candidateDeliverableId):undefined;
        if(delivery)cards.push({kind:'result',title:`已提交交付 v${delivery.revision}`,detail:delivery.summary,status:delivery.review?delivery.review.decision==='accepted'?'指定版本已验收':'需修改':'待人工验收',actions:[{id:linkId,label:'查看此版本与验收'}]});
      } else if(resource.kind==='plan') {
        // A private plan is navigable only from its authorized private projection.
        const linkId=`resource:plan:${resource.ref.id}`;this.links.set(linkId,`/plans/${resource.ref.id}`);
        cards.push({kind:'result',title:'协作方案',detail:refText(resource.ref),status:'打开后重新校验权限与版本',actions:[{id:linkId,label:'查看方案'}]});
      } else {
        let found=false;
        for(const data of taskDetails.values()) {
          if(!('task' in data)) {
            if(resource.kind==='assignment'&&data.pendingInvitation?.id===resource.ref.id){const pending=data.pendingInvitation;cards.push({kind:'invitation',title:`${data.title} · 任务邀请`,detail:`邀请范围：${pending.scope}\n${scheduleText(pending.schedule)}\n接受后记录此范围与时间；加入群本身没有接受任务。`,status:'待本人承接',actions:data.allowedActions.includes('decide')?this.taskInvitationActions(pending.id,pending.version,data.version):[]});found=true;break;}
            continue;
          }
          const linkId=`resource:task:${data.task.id}`;this.links.set(linkId,`/tasks/${data.task.id}`);
          if(resource.kind==='deliverable') {
            const delivery=data.deliverables.find(d=>d.id===resource.ref.id);if(!delivery)continue;
            cards.push({kind:'result',title:`${data.task.title} · 交付 v${delivery.revision}`,detail:`引用 ${refText(resource.ref)} · 当前记录 v${delivery.version}\n${delivery.summary}`,status:delivery.review?delivery.review.decision==='accepted'?'指定版本已验收':'需修改':'待人工验收',actions:[{id:linkId,label:'查看交付与验收'}]});found=true;break;
          }
          if(resource.kind==='assignment') {
            const assignment=data.assignments.find(a=>a.id===resource.ref.id);if(!assignment)continue;
            const states:Record<typeof assignment.status,string>={pending:'待承接，尚无承诺',accepted:'已接受任务',declined:'已拒绝任务',withdrawn:'已退出',transfer_pending:'等待转交接受',transferred:'已转交',cancelled:'已取消'};
            const ownPending=assignment.status==='pending'&&assignment.memberId===this.ownerId&&data.task.allowedActions.includes('decide');
            cards.push({kind:'invitation',title:'任务承接记录',detail:`引用 ${refText(resource.ref)} · 当前记录 v${assignment.version}\n${assignment.commitment?.scope??'尚未记录承诺'}\n群成员加入与任务承接分别确认。`,status:states[assignment.status],actions:[...(ownPending?this.taskInvitationActions(assignment.id,assignment.version,data.task.version):[]),{id:linkId,label:'查看或回应任务邀请'}]});found=true;break;
          }
          if(resource.kind==='artifact') {
            const artifact=data.artifacts?.find(a=>a.id===resource.ref.id);if(!artifact)continue;
            cards.push({kind:'result',title:artifact.filename,detail:`引用 ${refText(resource.ref)} · 当前记录 v${artifact.version}`,status:artifact.accessStatus==='available'?'当前可访问':'当前不可访问',actions:artifact.accessStatus==='available'?[{id:linkId,label:'在任务中查看附件'}]:[]});found=true;break;
          }
        }
        if(!found)cards.push({kind:'result',title:({assignment:'任务承接记录',deliverable:'交付版本',artifact:'授权附件'})[resource.kind],detail:refText(resource.ref),status:'服务授权引用 · 当前未读取到可检查的详情'});
      }
    }
    return {id:message.id,sender:contact?.displayName??(message.origin==='service'?'服务回执':'身份待确认'),identity:contact?identityLabels[contact.identity.kind]:'服务',senderIcon:contact?.identity.kind==='human'?'user':'robot',own:contact?.identity.kind==='human'&&contact.identity.memberId===this.ownerId,text:message.text??'',time:new Date(message.createdAt).toLocaleString('zh-CN'),cards};
  }
  private taskInvitationActions(id:string,assignmentVersion:number,taskVersion:number) {
    this.taskInvites.set(id,{assignmentVersion,taskVersion});
    return [{id:`taskinvitation:accepted:${id}`,label:'接受此范围与时间'},{id:`taskinvitation:declined:${id}`,label:'拒绝此任务邀请'}];
  }
  async send(id:string,text:string,mentions:MentionSelection[],signal:AbortSignal,target?:string,contextKeys:string[]=[]) {
    const conversation=this.conversations.get(id);if(!conversation?.allowedActions.includes('send'))throw new ApiError('FORBIDDEN','当前不能向此会话发送消息。');
    const agentId=conversation.kind==='personal'?this.personal?.agent.id:target;
    if(agentId&&!conversation.members.some(m=>m.contactId===agentId&&m.status==='joined'))throw new ApiError('VALIDATION_ERROR','请重新选择群内已加入的 AI。');
    const context:RequestFor<'sendChatMessage'>['body']['context']=[];
    for(const key of new Set(contextKeys)) {const resource=this.contextRefs.get(id)?.get(key);if(!resource)throw new ApiError('FORBIDDEN','所选材料权限或版本已变化，请重新读取。');context.push(resource);}
    const body:RequestFor<'sendChatMessage'>['body']={text,mentions:mentions.map(({contactId,start,end})=>({contactId,start,end})).sort((a,b)=>a.start-b.start),intent:agentId?'ask_agent':'chat',agentContactId:agentId??null,budget:agentId?chatBudget:null,context:agentId&&conversation.kind==='group'?context:[]};
    await this.execute('sendChatMessage',body,{id},signal);
  }
  async openContact(id:string,signal:AbortSignal) {return (await this.execute('createDirectConversation',{contactId:id},{},signal)).data.id;}
  async uploadText(conversationId:string,taskId:string,filename:string,text:string,signal:AbortSignal,expectedTaskVersion:number) {
    const conversation=this.conversations.get(conversationId),version=this.taskVersions.get(taskId);
    if(!conversation?.taskIds.includes(taskId)||!version)throw new ApiError('FORBIDDEN','此群没有可上传材料的任务。');
    if(version!==expectedTaskVersion)throw new ApiError('VERSION_CONFLICT','上传任务版本已变化，请重新核对任务后上传。');
    const bytes=new TextEncoder().encode(text);if(!bytes.length||bytes.length>10485760)throw new ApiError('VALIDATION_ERROR','文本大小需在 1 字节至 10 MiB。');
    let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    await this.execute('upload',{taskId,expectedVersion:version,filename,mediaType:'text/plain',contentBase64:btoa(binary)},{},signal);
  }
  async act(conversationId:string,_messageId:string,actionId:string,signal:AbortSignal):Promise<string|void> {
    const path=this.links.get(actionId);if(path){location.hash=path;return;}
    const [kind,decision,id]=actionId.split(':');if(!id)throw new ApiError('VALIDATION_ERROR','操作标识无效。');
    if(kind==='decision') {
      const action=this.actions.get(id),conversation=action&&this.conversations.get(action.conversationId);
      if(!action||!conversation||(decision!=='confirm'&&decision!=='dismiss')||!action.allowedDecisions.includes(decision))throw new ApiError('INVALID_STATE','建议权限或状态已变化，请刷新。');
      const response=await this.execute('decideChatAction',{expectedVersion:action.version,expectedConversationVersion:conversation.version,decision},{id},signal);
      return response.data.conversationId;
    }
    if(kind==='invitation') {
      const invitation=this.invitations.get(id);if(!invitation||(decision!=='accept'&&decision!=='decline'))throw new ApiError('INVALID_STATE','邀请状态已变化，请刷新。');
      await this.execute('decideChatInvitation',{expectedVersion:invitation.version,decision},{id},signal);
      return decision==='accept'?invitation.conversationId:conversationId;
    }
    if(kind==='taskinvitation') {
      const pending=this.taskInvites.get(id);if(!pending||(decision!=='accepted'&&decision!=='declined'))throw new ApiError('INVALID_STATE','任务邀请已变化，请重新读取。');
      await this.execute('invitationDecision',{expectedVersion:pending.assignmentVersion,expectedTaskVersion:pending.taskVersion,decision,comment:null},{id},signal);
    }
    if(kind==='candidate') {
      const current=this.runs.get(id);if(!current||decision!=='submit'||!current.run.allowedActions.includes('submit_candidate'))throw new ApiError('INVALID_STATE','候选权限或状态已变化，请重新读取。');
      await this.execute('submitCandidate',{expectedVersion:current.run.version,expectedTaskVersion:current.taskVersion},{id},signal);
    }
    if(kind==='publicrun') {
      const current=this.runs.get(id);if(!current||decision!=='cancel'||!current.run.allowedActions.includes('cancel'))throw new ApiError('INVALID_STATE','当前公共运行不能取消，请重新读取。');
      await this.execute('cancelRun',{expectedVersion:current.run.version,reason:'用户在任务群中明确取消此运行。'},{id},signal);
    }
    if(kind==='turn') {
      const turn=this.turns.get(id);if(!turn)throw new ApiError('INVALID_STATE','请重新读取生成状态。');
      if(decision==='cancel'&&turn.allowedActions.includes('cancel'))await this.execute('cancelChatTurn',{expectedVersion:turn.version},{id},signal);
      else if(decision==='retry'&&turn.allowedActions.includes('retry')&&turn.remainingBudget)await this.execute('retryChatTurn',{expectedVersion:turn.version,budget:turn.remainingBudget},{id},signal);
      else throw new ApiError('VALIDATION_ERROR','操作无效。');
    }
  }
}
