import {escapeHtml as e} from './view-model';
import {ApiError} from './api';
import type {ChatSnapshot,ChatSource,ContactView,ProfileInput,MemoryView,MemoryScope} from './chat-view';

export const contactErrorText=(error:unknown)=>{
  if(error instanceof ApiError){const messages:Record<string,string>={VERSION_CONFLICT:'版本已变化。填写内容已保留，请读取新版本、核对后重新保存。',INVALID_STATE:'当前状态已变化，请刷新核对后重新操作。',RATE_LIMITED:'已达到数量或操作频率限制，请核对已有记录。',CAPABILITY_UNAVAILABLE:'此 Agent 的能力当前不可用，请联系实验室负责人。'};const message=messages[error.code];if(message)return message;}
  return error instanceof Error?error.message:'保存失败，请重试。';
};
const button=(attr:string,label:string)=>`<button type="button" ${attr}>${e(label)}</button>`;
const profileFields=(contact?:ContactView)=>`<label>名字<input name="displayName" required maxlength="200" value="${e(contact?.name??'')}"></label><label>介绍<textarea name="introduction" maxlength="2000" rows="3">${e(contact?.introduction??'')}</textarea></label><label>能力介绍<textarea name="capabilityDescription" maxlength="4000" rows="3">${e(contact?.capabilityDescription??'')}</textarea></label>${contact?.icon==='user'?'<input type="hidden" name="personality" value="">':`<label>性格与工作方式<textarea name="personality" maxlength="2000" rows="3">${e(contact?.personality??'')}</textarea></label>`}`;
export const readProfileInput=(form:HTMLFormElement):ProfileInput=>{
  const value=(name:string)=>(form.elements.namedItem(name) as HTMLInputElement).value;
  return {displayName:value('displayName'),introduction:value('introduction'),capabilityDescription:value('capabilityDescription'),personality:value('personality')};
};
const protectComposition=(form:HTMLFormElement)=>{
  let composing=false;
  form.addEventListener('compositionstart',()=>{composing=true;});
  form.addEventListener('compositionend',()=>{composing=false;});
  form.addEventListener('keydown',event=>{if(event.key==='Enter'&&(composing||event.isComposing||event.keyCode===229))event.preventDefault();});
  form.addEventListener('submit',event=>{if(composing){event.preventDefault();event.stopImmediatePropagation();}},true);
};
export function renderContactProfile(contact:ContactView):string {
  const row=(label:string,value?:string)=>`<dt>${e(label)}</dt><dd>${e(value||'尚未填写')}</dd>`;
  return `<section class="chat-contact-detail" aria-label="联系人详情"><span class="chat-avatar chat-avatar-${contact.icon}">${contact.icon==='user'?e(Array.from(contact.name)[0]??''):'<i class="ph ph-robot" aria-hidden="true"></i>'}</span><h3>${e(contact.name)}</h3><span class="chat-identity">${e(contact.identity)} · ${e(contact.role??'身份待确认')}</span><dl>${row('归属',contact.owner)}${row('当前状态',contact.availability)}${row('联系人关系',contact.relationship)}${row('介绍',contact.introduction)}${row('能力介绍',contact.capabilityDescription)}${contact.icon==='robot'?row('性格 / 方式',contact.personality):''}</dl><details class="contact-id"><summary>身份记录</summary><p>${e(contact.id)} · 档案 v${contact.profileVersion??'待确认'}</p></details><p>${e(contact.directHint??'')}</p><div class="chat-card-actions">${contact.canOpenDirect?button('data-profile-chat','发消息'):''}${contact.canRequest?button('data-profile-request','添加联系人'):''}${contact.canEdit?button('data-profile-edit','编辑资料'):''}${contact.canManagePrivateMemory?button('data-profile-memory','私有记忆'):''}${contact.canRemove?button('data-profile-remove','移除联系人'):''}</div><p data-profile-status class="chat-input-status" role="status"></p></section>`;
}

/** The panel owns its form DOM. Polling updates read-only projections without
 * replacing inputs, IME composition, selection, or the version opened by a user. */
export class ContactPanel {
  private snapshot:ChatSnapshot;
  private editing=false;
  private busy=false;
  private alive=true;
  private requestFilter='pending';
  constructor(private root:HTMLElement,private source:ChatSource,private signal:AbortSignal,snapshot:ChatSnapshot,private selected:string|undefined,private refresh:()=>Promise<void>,private openChat:(id:string)=>Promise<void>,private back:()=>void) {this.snapshot=snapshot;this.render();}
  dispose(){this.alive=false;}
  sync(snapshot:ChatSnapshot) {this.snapshot=snapshot;if(!this.editing&&!this.busy&&!this.root.querySelector('dialog[open]'))this.render();}
  private valid(){return this.alive&&!this.signal.aborted&&this.root.isConnected;}
  private status(text:string){const output=this.root.querySelector<HTMLElement>('[data-profile-status]');if(output)output.textContent=text;this.pendingControl();}
  private pendingControl(){const discard=this.root.querySelector<HTMLButtonElement>('[data-profile-discard]');if(discard){discard.hidden=!this.source.hasPending?.();discard.disabled=this.busy;}}
  private heading(title:string,subtitle:string) {return `<div class="chat-heading"><button type="button" class="chat-back" aria-label="返回联系人列表"><i class="ph ph-arrow-left" aria-hidden="true"></i></button><div><h2>${e(title)}</h2><p>${e(subtitle)}</p></div><button type="button" data-profile-refresh aria-label="刷新联系人"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i></button></div>`;}
  private render() {
    if(!this.valid())return;
    const contact=this.snapshot.contacts.find(c=>c.id===this.selected);
    this.root.innerHTML=this.heading(this.selected==='requests'?'联系人请求':contact?.name??'通讯录',contact?.identity??'人与 Agent，共同协作')+`<div class="contact-workspace">${this.selected==='requests'?this.requests():contact?renderContactProfile(contact):'<div class="chat-empty"><i class="ph ph-address-book" aria-hidden="true"></i><h3>选择一位联系人</h3><p>在发现中查看实验室成员与 Agent，添加后开始对话。</p></div>'}<button type="button" data-profile-discard class="chat-discard" hidden>放弃原请求并重新核对</button></div>`;
    this.bind();this.pendingControl();
    if(this.selected==='create')this.edit();
  }
  private requests() {
    const statuses:Record<string,string>={pending:'待同意',accepted:'已同意添加',declined:'已拒绝',revoked:'已撤销'};
    return `<section class="contact-requests"><h3>添加与授权请求</h3><p>添加联系人与加入任务群分别同意。</p><div class="contact-tabs">${button('data-request-filter="pending"'+(this.requestFilter==='pending'?' aria-pressed="true"':''),'待处理')}${button('data-request-filter="all"'+(this.requestFilter==='all'?' aria-pressed="true"':''),'全部记录')}</div>${(this.snapshot.contactRequests??[]).filter(r=>this.requestFilter==='all'||r.status==='pending').map(r=>`<article class="contact-request"><strong>${e(r.requester)} → ${e(r.target)}</strong><p>${r.status==='pending'?(r.canAccept?'等待你同意':'等待对方同意'):e(statuses[r.status]??r.status)}</p><div class="chat-card-actions">${r.canAccept?button(`data-request-decision="accept" data-request-id="${e(r.id)}"`,'同意添加'):''}${r.canDecline?button(`data-request-decision="decline" data-request-id="${e(r.id)}"`,'拒绝'):''}${r.canRevoke?button(`data-request-revoke="${e(r.id)}"`,r.status==='pending'?'撤回请求':'撤销添加授权'):''}</div><div data-request-review></div></article>`).join('')||'<div class="chat-empty"><h3>暂无请求记录</h3><p>新的添加请求会显示在这里。</p></div>'}<p data-profile-status class="chat-input-status" role="status"></p></section>`;
  }
  private bind() {
    this.root.querySelector<HTMLButtonElement>('.chat-back')!.onclick=this.back;
    this.root.querySelector<HTMLButtonElement>('[data-profile-refresh]')!.onclick=()=>void this.refresh();
    this.root.querySelector<HTMLButtonElement>('[data-profile-discard]')!.onclick=()=>{this.source.discardPending?.();this.status('已放弃本地重试记录，请刷新核对服务结果后重新提交。');};
    const contact=this.snapshot.contacts.find(c=>c.id===this.selected);
    this.root.querySelector<HTMLButtonElement>('[data-profile-chat]')?.addEventListener('click',()=>void this.perform(()=>this.openChat(contact!.id),false));
    this.root.querySelector<HTMLButtonElement>('[data-profile-edit]')?.addEventListener('click',()=>this.edit(contact));
    this.root.querySelector<HTMLButtonElement>('[data-profile-request]')?.addEventListener('click',()=>void this.perform(()=>this.source.requestContact!(contact!.id,this.signal)));
    this.root.querySelector<HTMLButtonElement>('[data-profile-memory]')?.addEventListener('click',()=>openMemoryPanel(this.root,this.source,{kind:'private_agent',id:contact!.id,label:contact!.name,canManage:true},this.signal));
    this.root.querySelector<HTMLButtonElement>('[data-profile-remove]')?.addEventListener('click',()=>{
      const section=this.root.querySelector('[data-profile-remove]')!.parentElement!;
      section.innerHTML=`<p>移除与 ${e(contact!.name)} 的联系人关系后，该私聊将不可访问。既有群和任务仍按原权限处理。</p>${button('data-confirm-remove','确认移除联系人')}${button('data-cancel-remove','取消')}`;
      section.querySelector<HTMLButtonElement>('[data-confirm-remove]')!.onclick=()=>void this.perform(()=>this.source.removeContact!(contact!.id,contact!.relationshipVersion!,this.signal));
      section.querySelector<HTMLButtonElement>('[data-cancel-remove]')!.onclick=()=>this.render();
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-request-decision]').forEach(b=>b.onclick=()=>{const request=this.snapshot.contactRequests!.find(r=>r.id===b.dataset.requestId)!;void this.perform(()=>this.source.decideContactRequest!(request.id,b.dataset.requestDecision as 'accept'|'decline',request.version,this.signal));});
    this.root.querySelectorAll<HTMLButtonElement>('[data-request-filter]').forEach(b=>b.onclick=()=>{this.requestFilter=b.dataset.requestFilter!;this.render();});
    this.root.querySelectorAll<HTMLButtonElement>('[data-request-revoke]').forEach(b=>b.onclick=()=>{
      const request=this.snapshot.contactRequests!.find(r=>r.id===b.dataset.requestRevoke)!;
      if(request.status==='pending'){void this.perform(()=>this.source.revokeContactRequest!(request.id,request.version,this.signal));return;}
      const review=b.closest('article')!.querySelector<HTMLElement>('[data-request-review]')!;
      review.innerHTML=`<p>撤销 ${e(request.requester)} → ${e(request.target)} 的添加授权后，此私聊将不可访问。既有群和任务仍按原权限处理。</p>${button('data-confirm-revoke-contact','确认撤销添加授权')}${button('data-cancel-revoke-contact','取消')}`;
      review.querySelector<HTMLButtonElement>('[data-cancel-revoke-contact]')!.onclick=()=>review.innerHTML='';
      review.querySelector<HTMLButtonElement>('[data-confirm-revoke-contact]')!.onclick=()=>void this.perform(()=>this.source.revokeContactRequest!(request.id,request.version,this.signal));
    });
  }
  private async perform(action:()=>Promise<void>,reload=true,success='已保存。') {
    if(this.busy||!this.valid())return;
    this.busy=true;this.root.querySelectorAll<HTMLButtonElement>('button:not(.chat-back)').forEach(b=>b.disabled=true);
    try{await action();if(!this.valid())return;if(reload){await this.refresh();if(this.valid()&&!this.editing)this.render();}if(this.valid())this.status(success);}
    catch(error){if(this.valid())this.status(contactErrorText(error));}
    finally{this.busy=false;if(this.valid()){this.root.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=false);this.pendingControl();}}
  }
  private edit(contact?:ContactView) {
    this.editing=true;
    let version=contact?.profileVersion;
    this.root.querySelector<HTMLElement>('.contact-workspace')!.innerHTML=`<form class="contact-form" data-profile-form><h3>${contact?'编辑资料':'创建专属 Agent'}</h3><p>${contact?'介绍、能力与工作方式公开给本实验室成员。':'这个 Agent 由你负责，使用实验室已配置模型。能力介绍不会自动授予执行能力。'}</p>${profileFields(contact)}<p data-profile-version>${contact?'本次编辑基于档案 v'+version:''}</p><p data-profile-status class="chat-input-status" role="status"></p><div class="chat-card-actions">${button('data-profile-cancel','取消')}<button type="submit">${contact?'保存资料':'创建 Agent'}</button></div>${contact?button('data-profile-rebase','读取新版本并保留填写'):''}<button type="button" data-profile-discard class="chat-discard" hidden>放弃原请求并重新核对</button></form>`;
    this.root.querySelector<HTMLButtonElement>('[data-profile-cancel]')!.onclick=()=>{this.editing=false;if(!contact)this.selected=undefined;this.render();};
    this.root.querySelector<HTMLButtonElement>('[data-profile-discard]')!.onclick=()=>{this.source.discardPending?.();this.status('已放弃原请求，填写内容保留；请核对服务结果。');};
    this.root.querySelector<HTMLButtonElement>('[data-profile-rebase]')?.addEventListener('click',()=>void this.perform(async()=>{
      this.source.discardPending?.();await this.refresh();const current=this.snapshot.contacts.find(c=>c.id===contact!.id);if(!current?.canEdit)throw new Error('当前不能编辑此档案。');version=current.profileVersion;
      this.root.querySelector<HTMLElement>('[data-profile-version]')!.textContent=`最新档案 v${version}：${current.name}；介绍：${current.introduction||'尚未填写'}；能力：${current.capabilityDescription||'尚未填写'}；方式：${current.personality||'尚未填写'}。核对后再次保存将使用此版本。`;
    },false,'已读取最新版本。填写尚未保存，核对后再次保存。'));
    const form=this.root.querySelector<HTMLFormElement>('[data-profile-form]')!;protectComposition(form);
    form.onsubmit=event=>{
      event.preventDefault();const input=readProfileInput(event.currentTarget as HTMLFormElement);
      void this.perform(async()=>{if(contact)await this.source.saveProfile!(contact.id,input,version!,this.signal);else this.selected=await this.source.createAgent!(input,this.signal);if(!this.valid())return;this.editing=false;await this.refresh();if(this.valid())this.render();},false);
    };
    this.pendingControl();
  }
}

export function openMemoryPanel(host:HTMLElement,source:ChatSource,scope:MemoryScope,signal:AbortSignal) {
  if(!source.readMemories)return;
  const dialog=document.createElement('dialog');dialog.className='chat-upload contact-memory';dialog.setAttribute('aria-label',scope.kind==='private_agent'?'Agent 私有记忆':'会话共同记忆');
  dialog.innerHTML=`<div class="memory-heading"><h3>${scope.kind==='private_agent'?'私有记忆':'会话共同记忆'}</h3>${button('data-memory-close','关闭')}</div><p>${e(scope.label)}</p><p>${scope.kind==='private_agent'?'仅你可查看和维护；只用于你与这个 Agent 的专属对话，不分享给其他成员或群。':'绑定本会话，已加入的真人可查看；仅获准的会话负责人可维护。'}</p><p>只有你明确保存的内容才成为持续记忆。</p><div data-memory-list></div><div data-memory-editor></div><p data-memory-status class="chat-input-status" role="status"></p>${scope.canManage?button('data-memory-new','保存记忆'):''}<button type="button" data-memory-discard class="chat-discard" hidden>放弃原请求并重新核对</button>`;
  host.append(dialog);dialog.showModal();let alive=true,busy=false,memories:MemoryView[]=[];
  const valid=()=>alive&&!signal.aborted&&dialog.isConnected;
  const close=()=>{alive=false;dialog.close();dialog.remove();signal.removeEventListener('abort',close);};signal.addEventListener('abort',close,{once:true});dialog.oncancel=close;
  const pending=()=>{const discard=dialog.querySelector<HTMLButtonElement>('[data-memory-discard]')!;discard.hidden=!source.hasPending?.();discard.disabled=busy;};
  const status=(text:string)=>{if(valid()){dialog.querySelector<HTMLElement>('[data-memory-status]')!.textContent=text;pending();}};
  const run=async(action:()=>Promise<void>)=>{if(busy||!valid())return;busy=true;dialog.querySelectorAll<HTMLButtonElement>('button:not([data-memory-close])').forEach(b=>b.disabled=true);try{await action();}catch(error){status(contactErrorText(error));}finally{busy=false;if(valid()){dialog.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=false);pending();}}};
  const load=async()=>{
    const next=await source.readMemories!(scope,signal);if(!valid())return;memories=next;
    const list=dialog.querySelector<HTMLElement>('[data-memory-list]')!;
    list.innerHTML=memories.map(m=>`<article class="memory-item"><p>${e(m.content)}</p><small>来源：${e(m.source||'手动保存，未填写来源')} · v${m.version} · ${e(new Date(m.updatedAt).toLocaleString('zh-CN'))}</small><div class="chat-card-actions">${m.canEdit?button(`data-memory-edit="${e(m.id)}"`,'编辑'):''}${m.canRevoke?button(`data-memory-revoke="${e(m.id)}"`,'撤销记忆'):''}${source.memoryHistory?button(`data-memory-history="${e(m.id)}"`,'保存记录'):''}</div><div data-memory-detail></div></article>`).join('')||'<div class="chat-empty"><h3>还没有保存记忆</h3><p>可以保存稳定偏好、研究约定或明确结论，例如“报告采用中文，保留原始引用”。</p></div>';
    list.querySelectorAll<HTMLButtonElement>('[data-memory-edit]').forEach(b=>b.onclick=()=>edit(memories.find(m=>m.id===b.dataset.memoryEdit)));
    list.querySelectorAll<HTMLButtonElement>('[data-memory-revoke]').forEach(b=>b.onclick=()=>{const memory=memories.find(m=>m.id===b.dataset.memoryRevoke)!;const details=b.closest('article')!.querySelector<HTMLElement>('[data-memory-detail]')!;details.innerHTML=`<p>撤销后，这条内容不再提供给之后的 AI 回复。历史记录仍保留。</p>${button('data-memory-confirm-revoke','确认撤销')}${button('data-memory-cancel-revoke','取消')}`;details.querySelector<HTMLButtonElement>('[data-memory-cancel-revoke]')!.onclick=()=>details.innerHTML='';details.querySelector<HTMLButtonElement>('[data-memory-confirm-revoke]')!.onclick=()=>void run(async()=>{await source.revokeMemory!(memory.id,memory.version,signal);if(valid()){await load();status('已撤销，之后的回复不再使用这条记忆。');}});});
    list.querySelectorAll<HTMLButtonElement>('[data-memory-history]').forEach(b=>b.onclick=()=>void run(async()=>{const history=await source.memoryHistory!(b.dataset.memoryHistory!,signal);if(valid())b.closest('article')!.querySelector<HTMLElement>('[data-memory-detail]')!.innerHTML=history.map(m=>`<section><small>v${m.version} · ${e(m.status)}</small><p>${e(m.content)}</p><small>${e(m.source??'未填写来源')}</small></section>`).join('');}));
  };
  const edit=(memory?:MemoryView)=>{
    let version=memory?.version;
    const editor=dialog.querySelector<HTMLElement>('[data-memory-editor]')!;
    editor.innerHTML=`<form data-memory-form class="contact-form"><h4>${memory?'编辑记忆':'保存记忆'}</h4><label>记忆内容<textarea name="content" required maxlength="2000" rows="4">${e(memory?.content??'')}</textarea></label><label>来源 / 依据<input name="source" maxlength="1000" value="${e(memory?.source??'')}"></label><p data-memory-version>${memory?'基于 v'+version:''}</p><div class="chat-card-actions">${button('data-memory-cancel','取消')}<button type="submit">保存记忆</button></div>${memory?button('data-memory-rebase','读取新版本并保留填写'):''}</form>`;
    editor.querySelector<HTMLButtonElement>('[data-memory-cancel]')!.onclick=()=>editor.innerHTML='';
    editor.querySelector<HTMLButtonElement>('[data-memory-rebase]')?.addEventListener('click',()=>void run(async()=>{source.discardPending?.();await load();const current=memories.find(m=>m.id===memory!.id);if(!current?.canEdit)throw new Error('此记忆已撤销或不再可编辑。');version=current.version;editor.querySelector<HTMLElement>('[data-memory-version]')!.textContent=`最新 v${version}：${current.content}。核对后再次保存将使用此版本。`;status('填写内容保留，请核对最新保存记录。');}));
    const form=editor.querySelector<HTMLFormElement>('form')!;protectComposition(form);
    form.onsubmit=event=>{event.preventDefault();const form=event.currentTarget as HTMLFormElement,content=(form.elements.namedItem('content') as HTMLTextAreaElement).value,origin=(form.elements.namedItem('source') as HTMLInputElement).value;void run(async()=>{await source.saveMemory!(scope,content,origin||null,signal,memory?.id,version);if(valid()){editor.innerHTML='';await load();status('记忆已保存。');}});};
  };
  dialog.querySelector<HTMLButtonElement>('[data-memory-close]')!.onclick=close;
  dialog.querySelector<HTMLButtonElement>('[data-memory-new]')?.addEventListener('click',()=>edit());
  dialog.querySelector<HTMLButtonElement>('[data-memory-discard]')!.onclick=()=>{source.discardPending?.();status('已放弃本地重试记录，填写内容保留；请核对保存记录。');};
  void run(load);
}
