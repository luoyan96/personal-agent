/** Presentation projections only. The frozen contracts adapter owns authorization,
 * persistence, IDs, status translation and command idempotency. No API DTOs here. */
import { escapeHtml as e } from './view-model';
import { bytesToSize, getFileType, formatConversationTime, formatMessageTime } from './openim/common';
import { ContactPanel, openMemoryPanel } from './contact-panel';
import { ChatReadQueue } from './chat-read-queue';
import type { ConversationWorkflowView } from './chat-workflow-types';

export interface ContactView {
  id: string; name: string; identity: string; owner: string; availability: string;
  icon: 'user' | 'robot';
  canMention?:boolean;
  canOpenDirect?:boolean; directHint?:string;
  role?:string; introduction?:string; capabilityDescription?:string; personality?:string; profileVersion?:number;
  relationship?:string; relationshipVersion?:number; relationshipRequestId?:string|null;
  mine?:boolean; canRequest?:boolean; canRemove?:boolean; canEdit?:boolean; canManagePrivateMemory?:boolean;
}
export interface ProfileInput {displayName:string;introduction:string;capabilityDescription:string;personality:string}
export interface ContactRequestView {id:string;requester:string;target:string;status:string;version:number;canAccept:boolean;canDecline:boolean;canRevoke:boolean}
export interface MemoryView {id:string;content:string;source:string|null;version:number;status:string;updatedAt:string;canEdit:boolean;canRevoke:boolean}
export interface MemoryScope {kind:'private_agent'|'conversation';id:string;label:string;canManage:boolean}
export interface ChatCardView {
  title: string; detail: string; status: string;
  kind: 'invitation' | 'run' | 'result' | 'error';
  actions?: { id: string; label: string }[];
}
export interface MessageView {
  id: string; sender: string; identity: string; own: boolean; text: string;
  time: string; createdAt?: string; card?: ChatCardView;
  cards?: ChatCardView[]; senderIcon?: 'user' | 'robot';
}
export interface ConversationView {
  id: string; title: string; subtitle: string; preview: string; pinned: boolean;
  group: boolean; messages: MessageView[]; members: ContactView[];
  canSend: boolean;
  fixed?: boolean; lastMessageAt?: string; unreadCount?: number; icon?: 'user' | 'robot'; displayedThroughSequence?:number;
  sendTargets?: {id:string;label:string}[];
  contextChoices?: {key:string;label:string;requiresKey?:string}[];
  uploadTasks?: {id:string;label:string;version:number}[];
  profileContactId?:string; canManageMemory?:boolean;
  workflow?:ConversationWorkflowView;
}
export interface ChatSnapshot {
  contacts: ContactView[]; conversations: ConversationView[];
  notice: string;
  contactRequests?:ContactRequestView[];
  invitations?: {id:string;title:string;detail:string;status:string;actions:{id:string;label:string}[]}[];
}
export interface MentionSelection { contactId: string; name: string; start: number; end: number }
export type ChatDraftEntries = [string, {text: string; mentions: MentionSelection[]}][];
export interface ChatSource {
  read(signal: AbortSignal): Promise<ChatSnapshot>;
  send?(conversationId: string, text: string, mentions: MentionSelection[], signal: AbortSignal, target?:string,contextKeys?:string[]): Promise<void>;
  act?(conversationId: string, messageId: string, actionId: string, signal: AbortSignal): Promise<string|void>;
  openContact?(contactId: string, signal: AbortSignal): Promise<string>;
  pollIntervalMs?: number;
  discardPending?():void;
  dispose?():void;
  uploadText?(conversationId:string,taskId:string,filename:string,text:string,signal:AbortSignal,expectedTaskVersion:number):Promise<void>;
  markRead?(conversationId:string, throughSequence:number, signal:AbortSignal):Promise<number>;
  setPinned?(conversationId:string,pinned:boolean,signal:AbortSignal):Promise<void>;
  hasPending?():boolean;
  saveProfile?(id:string,input:ProfileInput,expectedVersion:number,signal:AbortSignal):Promise<void>;
  createAgent?(input:ProfileInput,signal:AbortSignal):Promise<string>;
  requestContact?(id:string,signal:AbortSignal):Promise<void>;
  removeContact?(id:string,expectedVersion:number,signal:AbortSignal):Promise<void>;
  decideContactRequest?(id:string,decision:'accept'|'decline',expectedVersion:number,signal:AbortSignal):Promise<void>;
  revokeContactRequest?(id:string,expectedVersion:number,signal:AbortSignal):Promise<void>;
  readMemories?(scope:MemoryScope,signal:AbortSignal):Promise<MemoryView[]>;
  saveMemory?(scope:MemoryScope,content:string,source:string|null,signal:AbortSignal,id?:string,expectedVersion?:number):Promise<void>;
  revokeMemory?(id:string,expectedVersion:number,signal:AbortSignal):Promise<void>;
  memoryHistory?(id:string,signal:AbortSignal):Promise<MemoryView[]>;
}
const icon = (name: string) => `<i class="ph ph-${name}" aria-hidden="true"></i>`;
const avatar = (name: string, title?:string) => `<span class="chat-avatar chat-avatar-${e(name)}">${name==='users'?'<img src="/openim/group.png" alt="">':name==='user'&&title?e(Array.from(title)[0]??''):icon(name)}</span>`;
function renderCard(card:ChatCardView,messageId:string) {
  const buttons=(card.actions??[]).map(a=>`<button type="button" data-card-message="${e(messageId)}" data-card-action="${e(a.id)}">${e(a.label)}</button>`).join('');
  // All invitation/confirmation controls follow the complete immutable payload.
  // Compacting history never permits a blind confirmation of hidden scope.
  const review=card.kind==='invitation'&&!!buttons;
  return `<section class="chat-card chat-card-${card.kind}" aria-label="${e(card.title)}"><div class="chat-card-heading">${icon(({invitation:'users',run:'clock',result:'file-text',error:'warning-circle'})[card.kind])}<strong>${e(card.title)}</strong></div><span class="chat-status">${e(card.status)}</span><details class="chat-card-detail" data-card-detail="${e(messageId)}:${e(card.title)}"><summary>${review?'查看范围并回应':'查看详情'}</summary><p>${e(card.detail)}</p>${review?`<div class="chat-card-actions">${buttons}</div>`:''}</details>${review?'':`<div class="chat-card-actions">${buttons}</div>`}</section>`;
}
export function renderMessage(message: MessageView): string {
  const cards=message.cards??(message.card?[message.card]:[]);
  return `<article class="chat-message ${message.own ? 'chat-own' : ''}" data-message-id="${e(message.id)}">${avatar(message.senderIcon??(message.own?'user':'robot'),message.sender)}<div class="chat-message-copy"><div class="chat-sender">${e(message.sender)} <span>${e(message.identity)}</span> <time title="${e(message.time)}">${e(message.createdAt?formatMessageTime(message.createdAt):message.time)}</time></div><div class="chat-bubble">${e(message.text)}${cards.map(card=>renderCard(card,message.id)).join('')}</div></div></article>`;
}

export function renderHistory(messages:MessageView[]):string {
  if(!messages.length)return `<div class="chat-empty">${icon('chat-circle-dots')}<h3>从这里开始对话</h3><p>提出你的需求，协作安排会在聊天中确认。</p></div>`;
  let previous=0;
  return messages.map(message=>{
    const timestamp=message.createdAt?Date.parse(message.createdAt):NaN;
    const separator=Number.isFinite(timestamp)&&(!previous||timestamp-previous>5*60000)?`<div class="chat-time-divider"><time datetime="${e(message.createdAt!)}">${e(formatMessageTime(message.createdAt!))}</time></div>`:'';
    if(Number.isFinite(timestamp))previous=timestamp;
    return separator+renderMessage(message);
  }).join('');
}

export const demandTemplates=[
  {id:'literature',label:'文献梳理',text:'我想梳理【研究问题】相关的文献。\n已有资料与来源：【填写】\n希望交付：【文献清单 / 对比表 / 研究缺口】\n验收要求：【覆盖范围、引用与核对方式】\n希望参与的人或 Agent：【填写或请建议】\n时间要求：【填写，未知可留空】\n请先澄清缺少的信息，再提出可确认的协作安排。'},
  {id:'analysis',label:'数据分析',text:'我想围绕【研究问题】分析一组数据。\n数据、来源与可分享范围：【填写】\n分析目标与方法：【填写或请建议】\n希望交付：【图表 / 分析报告 / 可复现步骤】\n验收要求：【填写】\n希望参与的人或 Agent：【填写或请建议】\n时间要求：【填写，未知可留空】\n请先核对资料和实际可用能力，再提出可确认的协作安排。'},
  {id:'writing',label:'论文修改',text:'我想修改【论文 / 章节名称】。\n已有稿件与可分享范围：【填写】\n本次修改重点：【论证 / 结构 / 表达 / 引用】\n希望交付：【修订稿与修改说明】\n验收要求：【填写】\n希望参与的人或 Agent：【填写或请建议】\n时间要求：【填写，未知可留空】\n请先澄清修改要求，再提出可确认的协作安排。'},
] as const;
export function applyDemandTemplate(current:string,id:string):string|undefined {return current.length?undefined:demandTemplates.find(t=>t.id===id)?.text;}
const templateButtons=()=>`<div class="chat-template-buttons">${demandTemplates.map(t=>`<button type="button" data-demand-template="${t.id}">${icon(({literature:'books',analysis:'chart-line',writing:'note-pencil'})[t.id])}${t.label}</button>`).join('')}</div>`;
export function renderConversationHistory(conversation?:ConversationView):string {
  if(conversation?.messages.length)return renderHistory(conversation.messages);
  if(conversation?.fixed)return `<section class="chat-demand-start"><span class="chat-start-avatar">${icon('robot')}</span><span class="chat-start-label">需求与协作</span><h3>从一个具体需求开始</h3><p>说清楚要完成什么、希望交付什么，以及怎样验收。${e(conversation.subtitle.split(' · ')[0]??'')}可以帮助你澄清需求、核对人和 AI 的协作建议。</p>${templateButtons()}<small>选择模板后，在输入框里补充和修改，再发送。</small><div class="chat-start-steps"><span>表达需求</span>${icon('caret-right')}<span>核对安排</span>${icon('caret-right')}<span>承接与交付</span>${icon('caret-right')}<span>人工验收</span></div></section>`;
  return `<div class="chat-empty">${icon(conversation?.group?'users':'chat-circle-dots')}<h3>${conversation?.group?'在群里沟通与协作':conversation?'开始这段对话':'正在读取会话'}</h3><p>${conversation?.group?'成员加入、任务承接和 AI 执行分别确认。':conversation?'发送消息，说明需要讨论或帮助的事情。':'会话读取成功后显示真实记录。'}</p></div>`;
}
export interface WorkflowPanelState {open:boolean;taskIds:Set<string>}
export function renderWorkflow(workflow:ConversationWorkflowView|undefined,state:WorkflowPanelState):string {
  if(!workflow)return '';
  const labels={accept:'确认与承接',work:'执行与交付',review:'人工验收',done:'已完成',cancelled:'已取消',restricted:'授权摘要'};
  const tasks=workflow.tasks.map(task=>`<details class="chat-workflow-task" data-workflow-task="${e(task.id)}" ${state.taskIds.has(task.id)?'open':''}><summary><span><strong>${e(task.title)}</strong><small>${e(labels[task.stage])}</small></span><span class="chat-workflow-status stage-${task.stage}">${e(task.status)}</span></summary><div class="chat-workflow-task-body">${task.goal?`<p><span>目标</span>${e(task.goal)}</p>`:''}<p><span>已接受承接者</span>${e(task.assignees.join('、')||(task.stage==='restricted'?'按当前授权查看':'尚无已接受的承接记录'))}</p>${task.acceptanceCriteria?`<p><span>验收要求</span>${e(task.acceptanceCriteria)}</p>`:''}${task.runStatus?`<p><span>AI 运行</span>${e(task.runStatus)}</p>`:''}${task.latestDelivery?`<div class="chat-workflow-delivery"><strong>交付 v${task.latestDelivery.revision} · ${e(task.latestDelivery.status)}</strong><p>${e(task.latestDelivery.summary)}</p></div>`:''}<div class="chat-workflow-next"><span>下一步</span><p>${e(task.nextStep)}</p>${task.actionLabel&&/^#\/tasks\/[^?#\s]+$/u.test(task.href)?`<a href="${e(task.href)}">${e(task.actionLabel)} ${icon('arrow-up-right')}</a>`:''}</div></div></details>`).join('');
  return `<div class="chat-workflow-summary"><div>${icon('list-checks')}<strong>${workflow.totalTasks?`已完成 ${workflow.completedTasks} / 可查看 ${workflow.totalTasks} 项`:'暂无可读取的关联任务'}</strong></div><button type="button" data-workflow-toggle aria-expanded="${state.open}">${state.open?'收起协作':'查看协作'} ${icon(state.open?'caret-up':'caret-down')}</button></div><section class="chat-workflow-panel" aria-label="群协作进展" ${state.open?'':'hidden'}><div class="chat-workflow-members"><span>已加入 ${workflow.joinedMembers}</span><span>待加入 ${workflow.invitedMembers}</span>${workflow.restrictedTasks?`<span>授权摘要 ${workflow.restrictedTasks} 项</span>`:''}<small>加入群不代表接受任务。AI 候选成果提交后仍需验收。</small></div><div class="chat-workflow-tasks">${tasks||'<p class="chat-workflow-empty">接受任务邀请后，可查看获准的任务详情。群成员加入与任务承接分别确认。</p>'}</div></section>`;
}

const draftKey=(ownerId:string)=>`research-chat-drafts:v1:${ownerId}`;
export function clearStoredChatDrafts(ownerId?:string) {if(ownerId)try{sessionStorage.removeItem(draftKey(ownerId));}catch{ /* storage unavailable */ }}

export class ChatView {
  private snapshot: ChatSnapshot = { contacts: [], conversations: [], notice: '正在读取会话…' };
  private activeId?: string;
  private tab = 'chats';
  private search = '';
  private draft = '';
  private mentions: MentionSelection[] = [];
  private pending = false;
  private composing = false;
  private showMembers = false;
  private contactId?:string;
  private contactPanel?:ContactPanel;
  private contactFilter='mine';
  private mobileDetail = false;
  private mentionIndex = 0;
  private candidates: ContactView[] = [];
  private mentionStart = -1;
  private controller = new AbortController();
  private disposed = false;
  private readVersion = 0;
  private readQueue=new ChatReadQueue();
  private timer?:ReturnType<typeof setInterval>;
  private sendTarget='';
  private sendMode='chat';
  private workflowPanels=new Map<string,WorkflowPanelState>();
  private demandTemplatesOpen=false;
  private selectedContext=new Set<string>();
  private markingRead=false;
  private editRange?:{start:number;end:number};
  private draftMap = new Map<string, {text: string; mentions: MentionSelection[]}>();
  constructor(private root: HTMLElement, private source: ChatSource, drafts: ChatDraftEntries = [], private ownerId?:string) {
    let restored:ChatDraftEntries=[];
    if(ownerId)try {const raw=JSON.parse(sessionStorage.getItem(draftKey(ownerId))??'[]');if(Array.isArray(raw))restored=raw.filter((row:unknown):row is ChatDraftEntries[number]=>Array.isArray(row)&&typeof row[0]==='string'&&typeof row[1]?.text==='string'&&Array.isArray(row[1]?.mentions)&&row[1].mentions.every((m:Record<string,unknown>)=>typeof m.contactId==='string'&&typeof m.name==='string'&&Number.isInteger(m.start)&&Number.isInteger(m.end)));}catch{/* ignore malformed or unavailable tab storage */}
    this.draftMap=new Map(structuredClone([...restored,...drafts]));
    this.draft=this.draftMap.get('')?.text??'';
  }
  exportDrafts(): ChatDraftEntries {
    this.draftMap.set(this.activeId??'',{text:this.draft,mentions:this.mentions});
    this.persistDrafts();
    return structuredClone([...this.draftMap]);
  }
  private persistDrafts() {if(this.ownerId)try{this.draftMap.set(this.activeId??'',{text:this.draft,mentions:this.mentions});sessionStorage.setItem(draftKey(this.ownerId),JSON.stringify([...this.draftMap].filter(([,d])=>d.text)));}catch{/* typing stays usable without storage */}}
  async mount() { this.render(); await this.refresh(); }
  dispose() { this.disposed = true; this.contactPanel?.dispose();clearInterval(this.timer); this.controller.abort(); this.source.dispose?.(); this.draftMap.clear();this.workflowPanels.clear(); this.draft = ''; this.mentions = []; this.snapshot = {contacts:[],conversations:[],notice:''}; }
  private active() { return this.snapshot.conversations.find(c => c.id === this.activeId); }
  private async refresh(background=false) {
    if(this.disposed||this.pending&&background)return;
    await this.readQueue.run(background,()=>this.readSnapshot(background));
  }
  private async readSnapshot(background=false) {
    if(this.disposed)return;
    const version=++this.readVersion;
    try {
      const next = await this.source.read(this.controller.signal);
      if (this.disposed || version!==this.readVersion) return;
      const previousActiveId=this.activeId;
      this.snapshot = next;
      const nextId=next.conversations.find(c => c.pinned)?.id ?? next.conversations[0]?.id;
      if (!next.conversations.some(c => c.id === this.activeId) && nextId!==this.activeId) this.select(nextId, next.conversations.find(c=>c.id===nextId)?.pinned??false);
      // A read must not replace an open material form or the current message
      // editor. Keep the original task version until that form is submitted.
      if(background||this.activeId&&this.activeId===previousActiveId)this.renderLive();else this.render();
      void this.markActiveRead();
      if(!this.timer&&this.source.pollIntervalMs&&this.snapshot.conversations.length)this.timer=setInterval(()=>{if(!document.hidden&&!this.composing&&!this.pending)void this.refresh(true);},this.source.pollIntervalMs);
    } catch (error) { if(version===this.readVersion)this.fail(error); }
  }
  private fail(error: unknown) {
    if (this.disposed) return;
    this.snapshot = {contacts:[],conversations:[],notice:error instanceof Error ? error.message : '会话读取失败，请重试。'};
    this.activeId = undefined;
    this.render();
  }
  private select(id?: string, detail = true) {
    this.draftMap.set(this.activeId??'', {text:this.draft,mentions:this.mentions});
    this.activeId = id;
    const stored = this.draftMap.get(id??'');
    this.draft = stored?.text ?? ''; this.mentions = stored?.mentions ?? [];
    this.mobileDetail = detail; this.showMembers = false; this.contactId=undefined; this.sendTarget=''; this.sendMode='chat'; this.selectedContext.clear(); this.persistDrafts();this.render();void this.markActiveRead();
  }
  private async markActiveRead() {
    const active=this.active();
    if(!active||!this.source.markRead||this.markingRead||this.tab!=='chats'||document.hidden||matchMedia('(max-width:600px)').matches&&!this.mobileDetail||!this.root.querySelector('.chat-history'))return;
    const history=this.root.querySelector<HTMLElement>('.chat-history')!;
    if(history.scrollHeight-history.scrollTop-history.clientHeight>30)return;
    this.markingRead=true;
    try{const unread=await this.source.markRead(active.id,active.displayedThroughSequence??0,this.controller.signal);if(!this.disposed&&this.activeId===active.id){this.active()!.unreadCount=unread;this.renderList();}}
    catch(error){if(!this.disposed){const notice=this.root.querySelector<HTMLElement>('.chat-input-status');if(notice)notice.textContent=error instanceof Error?error.message:'已读状态保存失败，下次刷新会重试。';}}
    finally{this.markingRead=false;}
  }
  private renderList() {
    const list = this.root.querySelector<HTMLElement>('.chat-list-content');
    if (!list) return;
    const matches = (text: string) => text.toLocaleLowerCase().includes(this.search.toLocaleLowerCase());
    if (this.tab === 'contacts') {
      const contacts = this.snapshot.contacts.filter(c => (this.contactFilter==='directory'||c.mine)&&matches(c.name + c.identity + c.owner+(c.capabilityDescription??'')+(c.introduction??'')));
      list.innerHTML = contacts.map(c => `<button type="button" class="chat-contact ${this.contactId===c.id?'chat-selected':''}" data-contact="${e(c.id)}" aria-pressed="${this.contactId===c.id}">${avatar(c.icon,c.name)}<span class="chat-conversation-copy"><strong>${e(c.name)}</strong><small>${e(c.identity)} · ${e(c.owner)}</small></span></button>`).join('') || '<p class="chat-list-empty">暂无匹配联系人</p>';
      list.querySelectorAll<HTMLButtonElement>('[data-contact]').forEach(button => button.onclick = () => {this.contactId=button.dataset.contact;this.mobileDetail=true;this.render();});
    } else {
      const conversations = [...this.snapshot.conversations].sort((a,b) => Number(b.fixed)-Number(a.fixed)||Number(b.pinned)-Number(a.pinned)).filter(c => c.fixed || matches(c.title + c.preview));
      list.innerHTML = conversations.map(c => {const localDraft=c.id===this.activeId?this.draft:this.draftMap.get(c.id)?.text;return `<button type="button" class="chat-contact ${c.id === this.activeId ? 'chat-selected' : ''} ${c.pinned?'chat-pinned':''}" data-conversation="${e(c.id)}" aria-pressed="${c.id === this.activeId}"><span class="chat-list-avatar">${avatar(c.group?'users':c.icon??'robot',c.title)}${c.unreadCount?`<span class="chat-unread" aria-label="${c.unreadCount} 条未读">${c.unreadCount>99?'99+':c.unreadCount}</span>`:''}</span><span class="chat-conversation-copy"><span class="chat-conversation-title"><strong>${e(c.title)}</strong><time>${e(formatConversationTime(c.lastMessageAt))}</time></span><span class="chat-conversation-preview">${localDraft?`<em>[草稿]</em> ${e(localDraft)}`:e(c.preview)}</span></span></button>`;}).join('') || `<button type="button" class="chat-contact chat-selected" data-personal>${avatar('robot')}<span><strong>我的科研助理</strong><small>个人 AI · 会话待接通</small></span>${icon('push-pin')}</button><p class="chat-list-empty">会话服务接通后显示真实历史</p>`;
      list.querySelectorAll<HTMLButtonElement>('[data-conversation]').forEach(button => button.onclick = () => this.select(button.dataset.conversation));
      list.querySelector<HTMLButtonElement>('[data-personal]')?.addEventListener('click', () => {this.mobileDetail = true;this.render();});
    }
  }
  private bindCards() {
    this.root.querySelectorAll<HTMLButtonElement>('[data-card-action]').forEach(b=>{b.disabled=!this.source.act||this.pending;b.onclick=()=>void this.act(b.dataset.cardMessage!,b.dataset.cardAction!);});
  }
  private renderInvitations() {
    const panel=this.root.querySelector<HTMLElement>('.chat-invitations');
    if(!panel)return;
    panel.innerHTML=(this.snapshot.invitations??[]).map(i=>renderCard({kind:'invitation',title:i.title,detail:i.detail,status:i.status,actions:i.actions},`invitation:${i.id}`)).join('');
    panel.hidden=!(this.snapshot.invitations?.length);
  }
  private renderLive() {
    if(this.tab==='contacts'){this.renderList();this.contactPanel?.sync(this.snapshot);this.renderInvitations();return;}
    const active=this.active();
    if(!active){this.render();return;}
    this.renderList();this.renderInvitations();
    this.root.querySelector('.chat-heading h2')!.textContent=active.title;
    this.root.querySelector('.chat-heading p')!.textContent=active.subtitle;
    const notice=this.root.querySelector('.chat-notice')!;
    notice.querySelector('span')!.textContent=this.snapshot.notice; (notice as HTMLElement).hidden=!this.snapshot.notice;
    const history=this.root.querySelector<HTMLElement>('.chat-history')!,scroll=history.scrollTop,atBottom=history.scrollHeight-scroll-history.clientHeight<30;
    const content=renderConversationHistory(active);
    if(history.dataset.content!==content){const opened=[...history.querySelectorAll<HTMLDetailsElement>('details[open]')].map(d=>d.dataset.cardDetail);history.innerHTML=content;history.dataset.content=content;history.querySelectorAll<HTMLDetailsElement>('details').forEach(d=>d.open=opened.includes(d.dataset.cardDetail));history.scrollTop=atBottom?history.scrollHeight:scroll;}
    this.renderMemberLinks();this.renderWorkflowPanel();this.bindDemandTemplates();
    if(this.sendTarget&&!active.sendTargets?.some(c=>c.id===this.sendTarget)){this.sendTarget='';const target=this.root.querySelector<HTMLSelectElement>('[data-send-target]');if(target)target.value='';}
    const target=this.root.querySelector<HTMLSelectElement>('[data-send-target]');
    if(target){const options=`<option value="">请选择已加入的 AI</option>${(active.sendTargets??[]).map(c=>`<option value="${e(c.id)}">${e(c.label)}</option>`).join('')}`;if(target.innerHTML!==options){target.innerHTML=options;target.value=this.sendTarget;}}
    this.bindCards();this.updateSendButton();
    const uploadOpen=this.root.querySelector<HTMLButtonElement>('[data-upload-open]');
    if(uploadOpen)uploadOpen.disabled=!this.source.uploadText||!active.uploadTasks?.length||this.pending;
    this.renderContextChoices();
  }
  private renderContextChoices() {
    const panel=this.root.querySelector<HTMLElement>('[data-context-choices]');if(!panel)return;
    const choices=this.active()?.contextChoices??[];
    for(const key of this.selectedContext)if(!choices.some(c=>c.key===key)){this.selectedContext.delete(key);this.root.querySelector<HTMLElement>('.chat-input-status')!.textContent='所选材料权限或版本已变化，请重新选择。';}
    const html=choices.map(c=>`<label><input type="checkbox" data-context-key="${e(c.key)}" ${this.selectedContext.has(c.key)?'checked':''}>${e(c.label)}</label>`).join('')||'<p>暂无获准提供给 AI 的任务与文本材料。</p>';
    if(panel.dataset.content!==html){panel.innerHTML=html;panel.dataset.content=html;}
    panel.querySelectorAll<HTMLInputElement>('input').forEach(input=>input.onchange=()=>{
      const key=input.dataset.contextKey!,choice=choices.find(c=>c.key===key)!;
      if(input.checked){const proposed=new Set(this.selectedContext);proposed.add(key);if(choice.requiresKey)proposed.add(choice.requiresKey);if(proposed.size>20){input.checked=false;this.root.querySelector<HTMLElement>('.chat-input-status')!.textContent='最多选择 20 个引用，包括材料所属任务。';return;}this.selectedContext=proposed;}
      else {this.selectedContext.delete(key);for(const c of choices)if(c.requiresKey===key)this.selectedContext.delete(c.key);}
      this.renderContextChoices();
    });
  }
  private updateSendButton() {
    this.root.querySelector<HTMLButtonElement>('[data-chat-send]')!.disabled=!this.active()?.canSend||!this.source.send||this.pending||!this.draft.trim()||(this.active()?.group&&this.sendMode!=='chat'&&!this.sendTarget)||false;
    this.root.querySelector<HTMLButtonElement>('[data-chat-send]')!.textContent=this.pending?'发送中…':'发送';
    this.root.querySelectorAll<HTMLButtonElement>('[data-demand-template]').forEach(button=>button.disabled=!!this.draft.length||this.pending||this.composing);
    const hint=this.root.querySelector<HTMLElement>('[data-template-hint]');if(hint)hint.textContent=this.draft.length?'已有草稿；清空后可选择模板。':'仅填入输入框，补充后再发送。';
    const discard=this.root.querySelector<HTMLButtonElement>('[data-discard-pending]');if(discard){discard.hidden=!this.source.hasPending?.();discard.disabled=this.pending;}
  }
  private async openContact(id: string) {
    const contact = this.snapshot.contacts.find(c => c.id === id);
    if (!contact) return;
    if (this.source.openContact && contact.canOpenDirect!==false && !this.pending) {
      this.pending = true;
      try { const conversationId = await this.source.openContact(id,this.controller.signal); if(this.disposed)return; await this.refresh(); this.tab = 'chats'; this.select(conversationId); }
      catch(error) {if(!this.disposed){const status=this.root.querySelector<HTMLElement>('[data-profile-status]');if(status)status.textContent=error instanceof Error?error.message:'私聊打开失败。';throw error;}} finally {this.pending=false;if(!this.disposed){const input=this.root.querySelector<HTMLTextAreaElement>('#chat-input');if(input){input.disabled=false;this.bindCards();this.updateSendButton();}}}
    } else {
      const info = this.root.querySelector<HTMLElement>('[data-contact-info]')!;
      info.hidden = false; info.textContent = `${contact.name} · ${contact.identity} · ${contact.owner} · ${contact.availability}。${contact.directHint??'私聊入口待接通。'}`;
    }
  }
  private bindNavigation() {
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.onclick=()=>{this.tab=b.dataset.tab!;this.mobileDetail=false;this.search='';this.render();});
    this.root.querySelector<HTMLInputElement>('.chat-search input')!.oninput=event=>{this.search=(event.target as HTMLInputElement).value;this.renderList();};
    this.root.querySelector<HTMLButtonElement>('.chat-back')?.addEventListener('click',()=>{this.mobileDetail=false;this.render();});
  }
  private showContact(id:string){this.contactId=id;this.tab='contacts';this.mobileDetail=true;this.render();}
  private renderContactDetail() {
    this.contactPanel=new ContactPanel(this.root.querySelector<HTMLElement>('.chat-main')!,this.source,this.controller.signal,this.snapshot,this.contactId,()=>this.refresh(),id=>this.openContact(id),()=>{this.mobileDetail=false;this.render();});
  }
  private renderMemberLinks(){const panel=this.root.querySelector<HTMLElement>('.chat-members');if(!panel)return;panel.innerHTML=(this.active()?.members??[]).map(c=>`<button type="button" data-member-profile="${e(c.id)}">${e(c.name)} · ${e(c.identity)} · ${e(c.availability)}</button>`).join('');panel.querySelectorAll<HTMLButtonElement>('[data-member-profile]').forEach(b=>b.onclick=()=>this.showContact(b.dataset.memberProfile!));}
  private renderWorkflowPanel(){
    const active=this.active(),host=this.root.querySelector<HTMLElement>('.chat-workflow');if(!host)return;
    host.hidden=!active?.group||!active.workflow;if(host.hidden){host.innerHTML='';return;}
    let state=this.workflowPanels.get(active!.id);if(!state){state={open:false,taskIds:new Set()};this.workflowPanels.set(active!.id,state);}
    const scroll=host.querySelector<HTMLElement>('.chat-workflow-panel')?.scrollTop??0,html=renderWorkflow(active!.workflow,state);
    if(host.dataset.content!==html){host.innerHTML=html;host.dataset.content=html;const panel=host.querySelector<HTMLElement>('.chat-workflow-panel');if(panel)panel.scrollTop=scroll;}
    const current=state;
    host.querySelector<HTMLButtonElement>('[data-workflow-toggle]')!.onclick=()=>{current.open=!current.open;this.renderWorkflowPanel();};
    host.querySelectorAll<HTMLDetailsElement>('[data-workflow-task]').forEach(details=>details.ontoggle=()=>{if(details.open)current.taskIds.add(details.dataset.workflowTask!);else current.taskIds.delete(details.dataset.workflowTask!);});
  }
  private bindDemandTemplates(){
    this.root.querySelectorAll<HTMLButtonElement>('[data-demand-template]').forEach(button=>button.onclick=()=>{
      if(this.pending||this.composing||!this.active()?.fixed)return;
      const template=applyDemandTemplate(this.draft,button.dataset.demandTemplate!);if(template===undefined)return;
      const input=this.root.querySelector<HTMLTextAreaElement>('#chat-input')!;input.value=template;this.updateInput(input);input.focus();input.setSelectionRange(0,0);
    });
    const templates=this.root.querySelector<HTMLDetailsElement>('[data-demand-options]');if(templates)templates.ontoggle=()=>this.demandTemplatesOpen=templates.open;
  }
  private render() {
    if (this.disposed) return;
    this.contactPanel?.dispose();this.contactPanel=undefined;
    const active = this.active();
    const previousHistory=this.root.querySelector<HTMLElement>('.chat-history');
    const sameHistory=!!previousHistory&&previousHistory.dataset.conversation===this.activeId;
    const previousScroll=sameHistory?previousHistory!.scrollTop:undefined;
    const wasAtBottom=sameHistory&&previousHistory!.scrollHeight-previousHistory!.scrollTop-previousHistory!.clientHeight<30;
    const opened=sameHistory?[...previousHistory!.querySelectorAll<HTMLDetailsElement>('details[open]')].map(d=>d.dataset.cardDetail):[];
    this.root.innerHTML = `<section class="chat-window ${this.mobileDetail ? 'chat-detail-open' : ''}" aria-label="科研聊天"><nav class="chat-rail" aria-label="聊天导航"><button type="button" data-my-profile aria-label="我的资料" class="chat-self-avatar">${avatar('user',this.snapshot.contacts.find(c=>c.icon==='user'&&c.canEdit)?.name)}</button><button type="button" data-tab="chats" aria-label="会话" aria-pressed="${this.tab === 'chats'}"><img src="/openim/nav_bar_message${this.tab==='chats'?'_active':''}.png" alt=""><span>聊天</span></button><button type="button" data-tab="contacts" aria-label="通讯录" aria-pressed="${this.tab === 'contacts'}"><img src="/openim/nav_bar_contact${this.tab==='contacts'?'_active':''}.png" alt=""><span>通讯录</span></button><a href="#/work" aria-label="任务与协作">${icon('squares-four')}<span>任务</span></a></nav><aside class="chat-list" aria-label="${this.tab === 'chats' ? '会话列表' : '通讯录'}"><div class="chat-list-top"><h1>${this.tab === 'chats' ? '会话' : '通讯录'}</h1><label class="chat-search">${icon('magnifying-glass')}<input aria-label="搜索会话或联系人" placeholder="搜索" value="${e(this.search)}"></label></div><div class="chat-list-content"></div><p data-contact-info class="chat-contact-info" role="status" hidden></p></aside><section class="chat-main" aria-label="聊天区域"><div class="chat-heading"><button type="button" class="chat-back" aria-label="返回会话列表">${icon('arrow-left')}</button><div><h2 data-chat-profile ${active?.profileContactId?'role="button" tabindex="0" title="查看联系人资料"':''}>${e(active?.title ?? '我的科研助理')}</h2><p>${e(active?.subtitle ?? '你的个人智能体 · AI 身份与归属待服务确认')}</p></div>${active&&!active.fixed&&this.source.setPinned?`<button type="button" data-chat-pin aria-label="${active.pinned?'取消置顶':'置顶会话'}" title="${active.pinned?'取消置顶':'置顶会话'}">${icon('push-pin')}</button>`:''}<button type="button" data-chat-refresh aria-label="刷新会话" title="刷新会话">${icon('arrow-clockwise')}</button>${active?.group ? `<button type="button" data-members aria-label="查看群成员" aria-expanded="${this.showMembers}">${icon('users')}</button>` : ''}</div><div class="chat-workflow" hidden></div><div class="chat-members" ${this.showMembers ? '' : 'hidden'}>${(active?.members ?? []).map(c => `<span>${e(c.name)} · ${e(c.identity)} · ${e(c.owner)} · ${e(c.availability)}</span>`).join('')}</div><div class="chat-notice" role="status" ${this.snapshot.notice?'':'hidden'}><span>${e(this.snapshot.notice)}</span></div><div class="chat-history" role="log" aria-label="聊天消息">${renderConversationHistory(active)}</div><div class="chat-composer"><div class="chat-mention-list" role="listbox" aria-label="选择 @联系人" hidden></div><label for="chat-input" class="chat-input-label">消息</label><textarea id="chat-input" rows="3" placeholder="${active?.group?'发送消息，输入 @ 选择成员':active?.fixed?'告诉助理你想完成什么…':'发送消息…'}" aria-describedby="chat-hint" aria-controls="chat-mentions">${e(this.draft)}</textarea><div class="chat-composer-bottom"><small id="chat-hint">Enter 发送 · Shift + Enter 换行</small><button type="button" data-chat-send ${!active?.canSend || !this.source.send || this.pending || !this.draft.trim() ? 'disabled' : ''}>${this.pending ? '发送中…' : '发送'}</button></div><p class="chat-input-status" role="status">${!active?.canSend || !this.source.send ? '发送待接通 · 输入不会触发执行' : ''}</p></div></section></section>`;
    this.renderList();
    this.bindNavigation();
    this.root.querySelector<HTMLButtonElement>('[data-my-profile]')!.onclick=()=>{const own=this.snapshot.contacts.find(c=>c.icon==='user'&&c.canEdit);if(own)this.showContact(own.id);};
    if(this.tab==='contacts'){this.root.querySelector('.chat-list-top')!.insertAdjacentHTML('beforeend',`<div class="contact-tabs"><button type="button" data-contact-filter="mine" aria-pressed="${this.contactFilter==='mine'}">我的联系人</button><button type="button" data-contact-filter="directory" aria-pressed="${this.contactFilter==='directory'}">发现</button></div><div class="contact-tools"><button type="button" data-contact-requests>请求${this.snapshot.contactRequests?.filter(r=>r.status==='pending').length?' ('+this.snapshot.contactRequests.filter(r=>r.status==='pending').length+')':''}</button>${this.source.createAgent?'<button type="button" data-agent-create>创建 Agent</button>':''}</div>`);this.root.querySelectorAll<HTMLButtonElement>('[data-contact-filter]').forEach(b=>b.onclick=()=>{this.contactFilter=b.dataset.contactFilter!;this.render();});this.root.querySelector<HTMLButtonElement>('[data-contact-requests]')!.onclick=()=>this.showContact('requests');this.root.querySelector<HTMLButtonElement>('[data-agent-create]')?.addEventListener('click',()=>this.showContact('create'));this.root.querySelector('.chat-list')!.insertAdjacentHTML('beforeend','<section class="chat-invitations" aria-label="群邀请" hidden></section>');this.renderInvitations();this.renderContactDetail();return;}
    this.root.querySelector('.chat-composer')!.insertAdjacentHTML('afterbegin','<small class="chat-bound-mentions" data-bound-mentions></small>');
    this.renderBoundMentions();
    this.root.querySelector('.chat-list')!.insertAdjacentHTML('beforeend','<section class="chat-invitations" aria-label="群邀请" hidden></section>');
    this.renderInvitations();
    if(active?.group) {
      this.root.querySelector('.chat-composer')!.insertAdjacentHTML('afterbegin',`<details class="chat-context"><summary>材料与授权（仅勾选内容给 AI）</summary><div data-context-choices></div><button type="button" data-upload-open ${!this.source.uploadText||!active.uploadTasks?.length?'disabled':''}>上传文本材料</button></details>`);
      this.renderContextChoices();
      this.root.querySelector('.chat-main')!.insertAdjacentHTML('beforeend',`<dialog class="chat-upload" aria-label="上传任务文本材料"><form data-chat-upload><h3>上传任务文本材料</h3><p>仅保存到所选任务。发送前勾选材料，才提供给 AI。</p><label>关联任务<select name="upload-task" required>${(active.uploadTasks??[]).map(t=>`<option value="${e(t.id)}@${t.version}">${e(t.label)} · v${t.version}</option>`).join('')}</select></label><label>文件名<input name="upload-filename" required maxlength="200" placeholder="材料.txt"></label><label>文本内容<textarea name="upload-text" required maxlength="200000" rows="6"></textarea></label><p data-upload-size>0 B · UTF-8 文本</p><p data-upload-error role="status"></p><div class="chat-card-actions"><button type="button" data-upload-close>关闭</button><button type="submit">上传到此任务</button></div></form></dialog>`);
      const dialog=this.root.querySelector<HTMLDialogElement>('.chat-upload')!;
      const uploadText=dialog.querySelector<HTMLTextAreaElement>('[name=upload-text]')!,uploadName=dialog.querySelector<HTMLInputElement>('[name=upload-filename]')!;
      const updateSize=()=>dialog.querySelector<HTMLElement>('[data-upload-size]')!.textContent=`${bytesToSize(new TextEncoder().encode(uploadText.value).length)} · UTF-8 文本${uploadName.value?' · '+getFileType(uploadName.value):''}`;
      uploadText.oninput=updateSize;uploadName.oninput=updateSize;
      this.root.querySelector<HTMLButtonElement>('[data-upload-open]')!.onclick=()=>{dialog.querySelector<HTMLSelectElement>('[name=upload-task]')!.innerHTML=(this.active()?.uploadTasks??[]).map(t=>`<option value="${e(t.id)}@${t.version}">${e(t.label)} · v${t.version}</option>`).join('');dialog.showModal();};
      this.root.querySelector<HTMLButtonElement>('[data-upload-close]')!.onclick=()=>dialog.close();
      this.root.querySelector<HTMLFormElement>('[data-chat-upload]')!.onsubmit=event=>{event.preventDefault();void this.upload(dialog);};
      this.root.querySelector('.chat-composer')!.insertAdjacentHTML('afterbegin',`<div class="chat-send-options"><label>发送方式<select data-send-mode aria-label="发送方式"><option value="chat">普通聊天</option><option value="ask">请 AI 回复 / 提出安排</option></select></label><label>群内 AI<select data-send-target aria-label="群内 AI"><option value="">请选择已加入的 AI</option>${(active.sendTargets??[]).map(c=>`<option value="${e(c.id)}">${e(c.label)}</option>`).join('')}</select></label><details class="chat-send-explanation"><summary>发送说明</summary><p>普通聊天与 @不会执行任务。请求所选 AI 回复或提出安排；核对具体范围并确认后，才邀请、派发或执行。每次 AI 回复上限 12000 tokens / 120 秒。</p></details></div>`);
      const mode=this.root.querySelector<HTMLSelectElement>('[data-send-mode]')!,target=this.root.querySelector<HTMLSelectElement>('[data-send-target]')!;
      mode.value=this.sendMode;target.value=this.sendTarget;target.disabled=this.sendMode==='chat';
      mode.onchange=()=>{this.sendMode=mode.value;target.disabled=this.sendMode==='chat';this.updateSendButton();};
      target.onchange=()=>{this.sendTarget=target.value;this.updateSendButton();};
    }
    if(this.source.discardPending){this.root.querySelector('.chat-composer')!.insertAdjacentHTML('beforeend','<button type="button" class="chat-discard" data-discard-pending>放弃未决请求</button>');this.root.querySelector<HTMLButtonElement>('[data-discard-pending]')!.onclick=()=>{this.source.discardPending!();this.root.querySelector<HTMLElement>('.chat-input-status')!.textContent='已放弃本地重试记录；服务是否已执行需刷新核对。';this.updateSendButton();};}
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => b.onclick = () => {this.tab=b.dataset.tab!;this.mobileDetail=false;this.search='';this.render();});
    this.root.querySelector<HTMLInputElement>('.chat-search input')!.oninput = event => {this.search=(event.target as HTMLInputElement).value;this.renderList();};
    this.root.querySelector<HTMLButtonElement>('.chat-back')!.onclick=()=>{this.mobileDetail=false;this.render();};
    this.root.querySelector<HTMLButtonElement>('[data-members]')?.addEventListener('click',()=>{this.showMembers=!this.showMembers;this.render();});
    const profile=this.root.querySelector<HTMLElement>('[data-chat-profile]');if(active?.profileContactId&&profile){profile.onclick=()=>this.showContact(active.profileContactId!);profile.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();this.showContact(active.profileContactId!);}};}
    this.renderMemberLinks();this.renderWorkflowPanel();
    if(active?.fixed)this.root.querySelector('.chat-composer')!.insertAdjacentHTML('afterbegin',`<details class="chat-demand-tools" data-demand-options ${this.demandTemplatesOpen?'open':''}><summary>需求模板</summary>${templateButtons()}<small data-template-hint>仅填入输入框，补充后再发送。</small></details>`);
    this.bindDemandTemplates();
    if(active&&this.source.readMemories){this.root.querySelector('.chat-heading')!.insertAdjacentHTML('beforeend','<button type="button" data-conversation-memory title="会话共同记忆" aria-label="会话共同记忆"><i class="ph ph-notebook" aria-hidden="true"></i></button>');this.root.querySelector<HTMLButtonElement>('[data-conversation-memory]')!.onclick=()=>openMemoryPanel(this.root,this.source,{kind:'conversation',id:active.id,label:active.title,canManage:active.canManageMemory??false},this.controller.signal);}
    this.root.querySelector<HTMLButtonElement>('[data-chat-refresh]')!.onclick=()=>void this.refresh();
    this.root.querySelector<HTMLButtonElement>('[data-chat-pin]')?.addEventListener('click',()=>void this.pinActive());
    this.root.querySelector<HTMLButtonElement>('[data-chat-send]')!.onclick=()=>void this.send();
    const input=this.root.querySelector<HTMLTextAreaElement>('#chat-input')!;
    input.disabled=this.pending;
    input.addEventListener('compositionstart',()=>{this.composing=true;this.updateSendButton();});
    input.addEventListener('compositionend',()=>{this.composing=false;this.updateInput(input);});
    input.addEventListener('beforeinput',event=>{
      let start=input.selectionStart,end=input.selectionEnd;
      if(start===end&&event.inputType==='deleteContentBackward')start=Math.max(0,start-1);
      if(start===end&&event.inputType==='deleteContentForward')end=Math.min(input.value.length,end+1);
      this.editRange={start,end};
    });
    input.oninput=()=>this.updateInput(input);
    input.onkeydown=event=>{
      if(event.isComposing || this.composing || event.keyCode===229)return;
      if(this.candidates.length && ['ArrowDown','ArrowUp','Enter','Escape'].includes(event.key)) {
        event.preventDefault();
        if(event.key==='Escape') {this.closeMentions();return;}
        if(event.key==='Enter') {this.chooseMention(this.candidates[this.mentionIndex]!);return;}
        this.mentionIndex=(this.mentionIndex+(event.key==='ArrowDown'?1:-1)+this.candidates.length)%this.candidates.length;
        this.renderMentions();return;
      }
      if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void this.send();}
    };
    this.bindCards();this.updateSendButton();
    const history=this.root.querySelector<HTMLElement>('.chat-history');if(history){history.dataset.conversation=this.activeId??'';if(active)history.dataset.content=renderHistory(active.messages);history.querySelectorAll<HTMLDetailsElement>('details').forEach(d=>d.open=opened.includes(d.dataset.cardDetail));history.scrollTop=previousScroll!==undefined&&!wasAtBottom?previousScroll:history.scrollHeight;history.onscroll=()=>void this.markActiveRead();}
  }
  private updateInput(input: HTMLTextAreaElement,range?:{start:number;end:number}) {
    const previous=this.draft;
    this.draft=input.value;
    // Rebase untouched ID-bound mentions around a text edit; remove edited tokens.
    let prefix=0;while(prefix<previous.length&&prefix<this.draft.length&&previous[prefix]===this.draft[prefix])prefix++;
    let suffix=0;while(suffix<previous.length-prefix&&suffix<this.draft.length-prefix&&previous[previous.length-1-suffix]===this.draft[this.draft.length-1-suffix])suffix++;
    const edit=range??this.editRange;this.editRange=undefined;
    if(edit)prefix=edit.start;
    const oldEnd=edit?.end??previous.length-suffix,delta=this.draft.length-previous.length;
    this.mentions=this.mentions.flatMap(m=>m.end<=prefix?[m]:m.start>=oldEnd?[{...m,start:m.start+delta,end:m.end+delta}]:[]).filter(m=>this.draft.slice(m.start,m.end)===`@${m.name}`);
    this.renderBoundMentions();
    this.persistDrafts();this.renderList();
    this.updateSendButton();
    const before=this.draft.slice(0,input.selectionStart),match=before.match(/(?:^|\s)@([^@\n]*)$/u);
    this.mentionStart=match ? before.lastIndexOf('@') : -1;
    this.candidates=match ? (this.active()?.members ?? []).filter(c=>c.canMention!==false&&c.name.includes(match[1]??'')&&!this.mentions.some(m=>m.contactId===c.id)) : [];
    this.mentionIndex=0;this.renderMentions();
  }
  private closeMentions() {this.candidates=[];this.root.querySelector<HTMLElement>('.chat-mention-list')!.hidden=true;this.root.querySelector('#chat-input')!.removeAttribute('aria-activedescendant');}
  private renderMentions() {
    const menu=this.root.querySelector<HTMLElement>('.chat-mention-list')!;
    menu.id='chat-mentions';menu.hidden=!this.candidates.length;
    menu.innerHTML=this.candidates.map((c,i)=>`<button type="button" role="option" id="chat-mention-${i}" aria-selected="${i===this.mentionIndex}" data-mention-index="${i}"><strong>${e(c.name)}</strong><small>${e(c.identity)} · ${e(c.owner)} · ${e(c.availability)}</small></button>`).join('');
    const input=this.root.querySelector('#chat-input')!;
    if(this.candidates.length)input.setAttribute('aria-activedescendant',`chat-mention-${this.mentionIndex}`);else input.removeAttribute('aria-activedescendant');
    menu.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.onclick=()=>this.chooseMention(this.candidates[Number(b.dataset.mentionIndex)]!));
  }
  private chooseMention(contact: ContactView) {
    const input=this.root.querySelector<HTMLTextAreaElement>('#chat-input')!,start=this.mentionStart,end=input.selectionStart;
    input.value=this.draft.slice(0,start)+`@${contact.name} `+this.draft.slice(end);
    input.setSelectionRange(start+contact.name.length+2,start+contact.name.length+2);
    this.updateInput(input,{start,end});
    this.mentions.push({contactId:contact.id,name:contact.name,start,end:start+contact.name.length+1});this.mentions.sort((a,b)=>a.start-b.start);
    this.renderBoundMentions();this.persistDrafts();
    this.closeMentions();input.focus();
  }
  private renderBoundMentions() {
    const label=this.root.querySelector<HTMLElement>('[data-bound-mentions]');if(label)label.textContent=this.mentions.length?'已绑定联系人：'+this.mentions.map(m=>'@'+m.name).join('、'):'';
  }
  private async send() {
    const active=this.active();
    if(this.pending||!active?.canSend||!this.source.send||!this.draft.trim()||this.composing||active.group&&this.sendMode!=='chat'&&!this.sendTarget)return;
    const text=this.draft,mentions=structuredClone(this.mentions),id=active.id;
    this.pending=true;this.render();
    try {await this.source.send(id,text,mentions,this.controller.signal,active.group&&this.sendMode!=='chat'?this.sendTarget:undefined,[...this.selectedContext]);if(this.disposed)return;this.draftMap.delete(id);if(this.activeId===id){this.draft='';this.mentions=[];this.root.querySelector<HTMLTextAreaElement>('#chat-input')!.value='';}this.persistDrafts();await this.refresh();}
    catch(error) {if(!this.disposed){this.root.querySelector<HTMLElement>('.chat-input-status')!.textContent=error instanceof Error?error.message:'发送失败，输入已保留。';}}
    finally {this.pending=false;if(!this.disposed){const input=this.root.querySelector<HTMLTextAreaElement>('#chat-input')!;input.disabled=false;this.updateInput(input);this.root.querySelector<HTMLButtonElement>('[data-chat-send]')!.textContent='发送';this.root.querySelectorAll<HTMLButtonElement>('[data-card-action]').forEach(b=>b.disabled=!this.source.act);}}
  }
  private async upload(dialog:HTMLDialogElement) {
    const active=this.active();if(!active||!this.source.uploadText||this.pending)return;
    const form=dialog.querySelector<HTMLFormElement>('form')!,data=new FormData(form),[taskId,version]=String(data.get('upload-task')).split('@');
    this.pending=true;form.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=true);
    try {await this.source.uploadText(active.id,taskId!,String(data.get('upload-filename')),String(data.get('upload-text')),this.controller.signal,Number(version));if(this.disposed)return;dialog.close();await this.refresh();this.root.querySelector<HTMLElement>('.chat-input-status')!.textContent='文本材料已由服务保存；勾选后才会提供给 AI。';}
    catch(error){if(!this.disposed)dialog.querySelector<HTMLElement>('[data-upload-error]')!.textContent=error instanceof Error?error.message:'上传失败，文本已保留。';}
    finally {this.pending=false;form.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=false);if(!this.disposed){this.root.querySelector<HTMLTextAreaElement>('#chat-input')!.disabled=false;const uploadOpen=this.root.querySelector<HTMLButtonElement>('[data-upload-open]');if(uploadOpen)uploadOpen.disabled=!this.source.uploadText||!this.active()?.uploadTasks?.length;this.updateSendButton();}}
  }
  private async pinActive() {
    const active=this.active();if(!active||!this.source.setPinned||this.pending)return;
    this.pending=true;this.render();
    try{await this.source.setPinned(active.id,!active.pinned,this.controller.signal);await this.refresh();}
    catch(error){if(!this.disposed)this.snapshot.notice=error instanceof Error?error.message:'置顶保存失败，请刷新核对。';}
    finally{this.pending=false;if(!this.disposed)this.render();}
  }
  private async act(messageId: string, actionId: string) {
    const active=this.active();if(!this.source.act||this.pending)return;
    this.pending=true;this.render();
    try {const next=await this.source.act(active?.id??'',messageId,actionId,this.controller.signal);await this.refresh();if(next&&!this.disposed){this.tab='chats';this.select(next);}}
    catch(error){if(!this.disposed)this.snapshot.notice=error instanceof Error?error.message:'操作失败，请重新读取状态。';} finally {this.pending=false;if(!this.disposed)this.render();}
  }
}
