/** Presentation projections only. The frozen contracts adapter owns authorization,
 * persistence, IDs, status translation and command idempotency. No API DTOs here. */
import { escapeHtml as e } from './view-model';

export interface ContactView {
  id: string; name: string; identity: string; owner: string; availability: string;
  icon: 'user' | 'robot';
}
export interface ChatCardView {
  title: string; detail: string; status: string;
  kind: 'invitation' | 'run' | 'result' | 'error';
  actions?: { id: string; label: string }[];
}
export interface MessageView {
  id: string; sender: string; identity: string; own: boolean; text: string;
  time: string; card?: ChatCardView;
}
export interface ConversationView {
  id: string; title: string; subtitle: string; preview: string; pinned: boolean;
  group: boolean; messages: MessageView[]; members: ContactView[];
  canSend: boolean;
}
export interface ChatSnapshot {
  contacts: ContactView[]; conversations: ConversationView[];
  notice: string;
}
export interface MentionSelection { contactId: string; name: string; start: number; end: number }
export type ChatDraftEntries = [string, {text: string; mentions: MentionSelection[]}][];
export interface ChatSource {
  read(signal: AbortSignal): Promise<ChatSnapshot>;
  send?(conversationId: string, text: string, mentions: MentionSelection[], signal: AbortSignal): Promise<void>;
  act?(conversationId: string, messageId: string, actionId: string, signal: AbortSignal): Promise<void>;
  openContact?(contactId: string, signal: AbortSignal): Promise<string>;
}
const icon = (name: string) => `<i class="ph ph-${name}" aria-hidden="true"></i>`;
const avatar = (name: string) => `<span class="chat-avatar">${icon(name)}</span>`;
export function renderMessage(message: MessageView): string {
  const card = message.card;
  return `<article class="chat-message ${message.own ? 'chat-own' : ''}" data-message-id="${e(message.id)}">${avatar(message.own ? 'user' : 'robot')}<div class="chat-message-copy"><div class="chat-sender">${e(message.sender)} <span>${e(message.identity)}</span> <time>${e(message.time)}</time></div><div class="chat-bubble">${e(message.text)}${card ? `<section class="chat-card chat-card-${card.kind}" aria-label="${e(card.title)}"><div class="chat-card-heading">${icon(({invitation:'users',run:'clock',result:'file-text',error:'warning-circle'})[card.kind])}<strong>${e(card.title)}</strong></div><p>${e(card.detail)}</p><span class="chat-status">${e(card.status)}</span><div class="chat-card-actions">${(card.actions ?? []).map(a => `<button type="button" data-card-message="${e(message.id)}" data-card-action="${e(a.id)}">${e(a.label)}</button>`).join('')}</div></section>` : ''}</div></div></article>`;
}

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
  private mobileDetail = false;
  private mentionIndex = 0;
  private candidates: ContactView[] = [];
  private mentionStart = -1;
  private controller = new AbortController();
  private disposed = false;
  private readVersion = 0;
  private draftMap = new Map<string, {text: string; mentions: MentionSelection[]}>();
  constructor(private root: HTMLElement, private source: ChatSource, drafts: ChatDraftEntries = []) {
    this.draftMap=new Map(structuredClone(drafts));
    this.draft=this.draftMap.get('')?.text??'';
  }
  exportDrafts(): ChatDraftEntries {
    this.draftMap.set(this.activeId??'',{text:this.draft,mentions:this.mentions});
    return structuredClone([...this.draftMap]);
  }
  async mount() { this.render(); await this.refresh(); }
  dispose() { this.disposed = true; this.controller.abort(); this.draftMap.clear(); this.draft = ''; this.mentions = []; this.snapshot = {contacts:[],conversations:[],notice:''}; }
  private active() { return this.snapshot.conversations.find(c => c.id === this.activeId); }
  private async refresh() {
    const version=++this.readVersion;
    try {
      const next = await this.source.read(this.controller.signal);
      if (this.disposed || version!==this.readVersion) return;
      this.snapshot = next;
      const nextId=next.conversations.find(c => c.pinned)?.id ?? next.conversations[0]?.id;
      if (!next.conversations.some(c => c.id === this.activeId) && nextId!==this.activeId) this.select(nextId, false);
      this.render();
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
    this.mobileDetail = detail; this.showMembers = false; this.render();
  }
  private renderList() {
    const list = this.root.querySelector<HTMLElement>('.chat-list-content');
    if (!list) return;
    const matches = (text: string) => text.toLocaleLowerCase().includes(this.search.toLocaleLowerCase());
    if (this.tab === 'contacts') {
      const contacts = this.snapshot.contacts.filter(c => matches(c.name + c.identity + c.owner));
      list.innerHTML = contacts.map(c => `<button type="button" class="chat-contact" data-contact="${e(c.id)}">${avatar(c.icon)}<span><strong>${e(c.name)}</strong><small>${e(c.identity)} · ${e(c.owner)}</small><small>${e(c.availability)}</small></span></button>`).join('') || '<p class="chat-list-empty">暂无匹配联系人</p>';
      list.querySelectorAll<HTMLButtonElement>('[data-contact]').forEach(button => button.onclick = () => void this.openContact(button.dataset.contact!));
    } else {
      const conversations = [...this.snapshot.conversations].sort((a,b) => Number(b.pinned)-Number(a.pinned)).filter(c => c.pinned || matches(c.title + c.preview));
      list.innerHTML = conversations.map(c => `<button type="button" class="chat-contact ${c.id === this.activeId ? 'chat-selected' : ''}" data-conversation="${e(c.id)}" aria-pressed="${c.id === this.activeId}">${avatar(c.group ? 'users' : 'robot')}<span><strong>${e(c.title)}</strong><small>${e(c.preview)}</small></span>${c.pinned ? icon('push-pin') : ''}</button>`).join('') || `<button type="button" class="chat-contact chat-selected" data-personal>${avatar('robot')}<span><strong>我的科研助理</strong><small>个人 AI · 会话待接通</small></span>${icon('push-pin')}</button><p class="chat-list-empty">会话服务接通后显示真实历史</p>`;
      list.querySelectorAll<HTMLButtonElement>('[data-conversation]').forEach(button => button.onclick = () => this.select(button.dataset.conversation));
      list.querySelector<HTMLButtonElement>('[data-personal]')?.addEventListener('click', () => {this.mobileDetail = true;this.render();});
    }
  }
  private async openContact(id: string) {
    const contact = this.snapshot.contacts.find(c => c.id === id);
    if (!contact) return;
    if (this.source.openContact && !this.pending) {
      this.pending = true;
      try { const conversationId = await this.source.openContact(id,this.controller.signal); if(this.disposed)return; await this.refresh(); this.tab = 'chats'; this.select(conversationId); }
      catch(error) {this.fail(error);} finally {this.pending=false;}
    } else {
      const info = this.root.querySelector<HTMLElement>('[data-contact-info]')!;
      info.hidden = false; info.textContent = `${contact.name} · ${contact.identity} · ${contact.owner} · ${contact.availability}。私聊入口待接通。`;
    }
  }
  private render() {
    if (this.disposed) return;
    const active = this.active();
    this.root.innerHTML = `<section class="chat-window ${this.mobileDetail ? 'chat-detail-open' : ''}" aria-label="科研聊天"><nav class="chat-rail" aria-label="聊天导航">${avatar('user')}<button type="button" data-tab="chats" aria-label="会话" aria-pressed="${this.tab === 'chats'}">${icon('chat-circle')}<span>聊天</span></button><button type="button" data-tab="contacts" aria-label="通讯录" aria-pressed="${this.tab === 'contacts'}">${icon('address-book')}<span>通讯录</span></button><a href="#/work" aria-label="任务与协作">${icon('squares-four')}<span>任务</span></a></nav><aside class="chat-list" aria-label="${this.tab === 'chats' ? '会话列表' : '通讯录'}"><div class="chat-list-top"><h1>${this.tab === 'chats' ? '会话' : '通讯录'}</h1><label class="chat-search">${icon('magnifying-glass')}<input aria-label="搜索会话或联系人" placeholder="搜索" value="${e(this.search)}"></label></div><div class="chat-list-content"></div><p data-contact-info class="chat-contact-info" role="status" hidden></p></aside><section class="chat-main" aria-label="聊天区域"><div class="chat-heading"><button type="button" class="chat-back" aria-label="返回会话列表">${icon('arrow-left')}</button><div><h2>${e(active?.title ?? '我的科研助理')}</h2><p>${e(active?.subtitle ?? '你的个人智能体 · AI 身份与归属待服务确认')}</p></div>${active?.group ? `<button type="button" data-members aria-label="查看群成员" aria-expanded="${this.showMembers}">${icon('users')}</button>` : ''}</div><div class="chat-members" ${this.showMembers ? '' : 'hidden'}>${(active?.members ?? []).map(c => `<span>${e(c.name)} · ${e(c.identity)} · ${e(c.owner)} · ${e(c.availability)}</span>`).join('')}</div><div class="chat-notice" role="status">${e(this.snapshot.notice)}<button type="button" data-chat-refresh aria-label="刷新会话">${icon('arrow-clockwise')}</button></div><div class="chat-history" role="log" aria-label="聊天消息">${active?.messages.length ? active.messages.map(renderMessage).join('') : `<div class="chat-empty">${icon('chat-circle-dots')}<h3>${active ? '从这里开始对话' : '会话服务待接通'}</h3><p>${active ? '提出你的需求，协作安排会在聊天中确认。' : '暂无可读取的聊天记录。你可以先写下需求，接通后再发送。'}</p></div>`}</div><div class="chat-composer"><div class="chat-mention-list" role="listbox" aria-label="选择 @联系人" hidden></div><label for="chat-input" class="chat-input-label">消息</label><textarea id="chat-input" rows="3" placeholder="告诉助理你想完成什么…" aria-describedby="chat-hint" aria-controls="chat-mentions">${e(this.draft)}</textarea><div class="chat-composer-bottom"><small id="chat-hint">Enter 发送 · Shift + Enter 换行</small><button type="button" data-chat-send ${!active?.canSend || !this.source.send || this.pending || !this.draft.trim() ? 'disabled' : ''}>${this.pending ? '发送中…' : '发送'}</button></div><p class="chat-input-status" role="status">${!active?.canSend || !this.source.send ? '发送待接通 · 输入不会触发执行' : ''}</p></div></section></section>`;
    this.renderList();
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => b.onclick = () => {this.tab=b.dataset.tab!;this.mobileDetail=false;this.search='';this.render();});
    this.root.querySelector<HTMLInputElement>('.chat-search input')!.oninput = event => {this.search=(event.target as HTMLInputElement).value;this.renderList();};
    this.root.querySelector<HTMLButtonElement>('.chat-back')!.onclick=()=>{this.mobileDetail=false;this.render();};
    this.root.querySelector<HTMLButtonElement>('[data-members]')?.addEventListener('click',()=>{this.showMembers=!this.showMembers;this.render();});
    this.root.querySelector<HTMLButtonElement>('[data-chat-refresh]')!.onclick=()=>void this.refresh();
    this.root.querySelector<HTMLButtonElement>('[data-chat-send]')!.onclick=()=>void this.send();
    const input=this.root.querySelector<HTMLTextAreaElement>('#chat-input')!;
    input.disabled=this.pending;
    input.addEventListener('compositionstart',()=>{this.composing=true;});
    input.addEventListener('compositionend',()=>{this.composing=false;this.updateInput(input);});
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
    this.root.querySelectorAll<HTMLButtonElement>('[data-card-action]').forEach(b=>{b.disabled=!this.source.act || this.pending;b.onclick=()=>void this.act(b.dataset.cardMessage!,b.dataset.cardAction!);});
  }
  private updateInput(input: HTMLTextAreaElement) {
    const previous=this.draft;
    this.draft=input.value;
    // Rebase untouched ID-bound mentions around a text edit; remove edited tokens.
    let prefix=0;while(prefix<previous.length&&prefix<this.draft.length&&previous[prefix]===this.draft[prefix])prefix++;
    let suffix=0;while(suffix<previous.length-prefix&&suffix<this.draft.length-prefix&&previous[previous.length-1-suffix]===this.draft[this.draft.length-1-suffix])suffix++;
    const oldEnd=previous.length-suffix,delta=this.draft.length-previous.length;
    this.mentions=this.mentions.flatMap(m=>m.end<=prefix?[m]:m.start>=oldEnd?[{...m,start:m.start+delta,end:m.end+delta}]:[]).filter(m=>this.draft.slice(m.start,m.end)===`@${m.name}`);
    const send=this.root.querySelector<HTMLButtonElement>('[data-chat-send]')!;
    send.disabled=!this.active()?.canSend||!this.source.send||this.pending||!this.draft.trim();
    const before=this.draft.slice(0,input.selectionStart),match=before.match(/(?:^|\s)@([^@\n]*)$/u);
    this.mentionStart=match ? before.lastIndexOf('@') : -1;
    this.candidates=match ? (this.active()?.members ?? []).filter(c=>c.name.includes(match[1]??'')) : [];
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
    this.updateInput(input);
    this.mentions.push({contactId:contact.id,name:contact.name,start,end:start+contact.name.length+1});
    this.closeMentions();input.focus();
  }
  private async send() {
    const active=this.active();
    if(this.pending||!active?.canSend||!this.source.send||!this.draft.trim()||this.composing)return;
    const text=this.draft,mentions=structuredClone(this.mentions),id=active.id;
    this.pending=true;this.render();
    try {await this.source.send(id,text,mentions,this.controller.signal);if(this.disposed)return;this.draftMap.delete(id);if(this.activeId===id){this.draft='';this.mentions=[];}await this.refresh();}
    catch(error) {if(!this.disposed){this.root.querySelector<HTMLElement>('.chat-input-status')!.textContent=error instanceof Error?error.message:'发送失败，输入已保留。';}}
    finally {this.pending=false;if(!this.disposed){const input=this.root.querySelector<HTMLTextAreaElement>('#chat-input')!;input.disabled=false;this.updateInput(input);this.root.querySelector<HTMLButtonElement>('[data-chat-send]')!.textContent='发送';this.root.querySelectorAll<HTMLButtonElement>('[data-card-action]').forEach(b=>b.disabled=!this.source.act);}}
  }
  private async act(messageId: string, actionId: string) {
    const active=this.active();if(!active||!this.source.act||this.pending)return;
    this.pending=true;this.render();
    try {await this.source.act(active.id,messageId,actionId,this.controller.signal);await this.refresh();}
    catch(error){if(!this.disposed)this.snapshot.notice=error instanceof Error?error.message:'操作失败，请重新读取状态。';} finally {this.pending=false;if(!this.disposed)this.render();}
  }
}
