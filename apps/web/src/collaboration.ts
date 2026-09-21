import { contractVersion } from '@research-agent-platform/contracts';
import type { MemberModel, PlanModel, RequestFor, ResponseFor, RouteName, TaskModel } from '@research-agent-platform/contracts';
import { ApiClient, ApiError, CommandSlot, Intent } from './api';
import { escapeHtml as e } from './view-model';
import { labels } from './contract-projection';

const app = document.querySelector<HTMLDivElement>('#app')!;
const api = new ApiClient();
const command = new CommandSlot();
let session: ResponseFor<'session'>['data'] | undefined;
let members: MemberModel[] = [];
let scope = 'mine';
let pageCursor: string | undefined;
let controller: AbortController | undefined;
let currentPlan: PlanModel | undefined;
let refreshedPlan: PlanModel | undefined;
let draftOwner: string | undefined;
let editor: RequestFor<'createPlan'>['body'] | undefined;
let editorRoute = '';
let dirty = false;
let busy = false;
let retryCommand: (() => Promise<void>) | undefined;
const drafts = new Map<string, string>();
const route = () => location.hash.slice(1) || '/';
const link = (path: string, label: string, cls = '') => `<a class="${cls}" href="#${e(path)}">${label}</a>`;
const icon = (name: string) => `<i class="ph ph-${name}" aria-hidden="true"></i>`;
const name = (id: string | null) => id ? members.find(m => m.id === id)?.displayName ?? id : '待安排';
const button = (action: string, label: string, primary = false) => `<button type="button" data-action="${action}" class="${primary ? 'primary' : ''}">${label}</button>`;
const emptySchedule = () => ({suggested:null,hardDeadline:null,committed:null,estimatedHumanHours:null,checkpoint:null});
type Schedule = TaskModel['schedule'];
function date(d: Schedule['suggested']) {
  if (!d) return '未约定';
  return `${d.value.kind === 'date' ? d.value.date + ' · ' + d.value.timezone : d.value.at}（${({user:'本人填写',authorized_material:'授权材料',suggestion:'建议',member:'成员承诺'})[d.source]} · ${d.confirmed ? '已确认' : '待确认'}）`;
}
function schedule(s: Schedule) {
  return `<dl class="facts"><dt>建议时间</dt><dd>${e(date(s.suggested))}</dd><dt>硬性截止</dt><dd>${e(date(s.hardDeadline))}</dd><dt>承诺时间</dt><dd>${e(date(s.committed))}</dd><dt>预计投入</dt><dd>${s.estimatedHumanHours === null ? '未约定' : e(String(s.estimatedHumanHours)) + ' 小时'}</dd></dl>`;
}
function shell() {
  app.innerHTML = `<button class="skip" data-skip>跳到主要内容</button><header>${link('/', '<img src="/brand.png" width="38" height="38" alt=""><span>Research Agent Platform</span>', 'brand')}<nav aria-label="主导航">${link('/', '需求入口')}${link('/lab', '实验室任务')}${session ? `<span class="session-name">${e(session.member.displayName)}</span>${button('logout','退出登录')}` : link('/login','登录')}</nav></header><main id="main" tabindex="-1"><section class="state-panel" role="status">正在从服务读取…</section></main><footer>AI 建议尚未接通 · 手工协作 · 契约 ${contractVersion}</footer>`;
  document.querySelector<HTMLButtonElement>('[data-skip]')!.onclick = () => document.querySelector<HTMLElement>('main')!.focus();
  action('logout', async () => {
    await api.call('logout', {params:{},query:{},headers:{},body:{}});
    session = undefined; api.csrfToken = ''; members = []; editor = undefined; currentPlan = undefined; drafts.clear(); command.discard(); retryCommand = undefined;
    location.hash = '/login'; await load();
  });
}
function content(html: string, title: string) {
  document.title = title + ' · Research Agent Platform';
  document.querySelector('main')!.innerHTML = html + '<div id="feedback" class="feedback" aria-live="polite"></div>';
}
function feedback(error: unknown) {
  const err = error instanceof ApiError ? error : new ApiError('ERROR', '操作未完成，请重试。');
  const target = document.querySelector('#feedback') ?? document.querySelector('main')!;
  const conflict = ['VERSION_CONFLICT','IDEMPOTENCY_CONFLICT','ALREADY_CLAIMED','INVALID_STATE'].includes(err.code);
  target.innerHTML = `<div class="alert" role="alert"><div><strong>${e(err.code)}</strong><p>${e(err.message)}</p>${err.requestId ? `<small>请求编号 ${e(err.requestId)}</small>` : ''}${conflict ? '<p>请读取最新状态并比较，再放弃原请求、重新确认；不会自动覆盖新版本。</p>' : ''}</div><div class="actions">${retryCommand ? button('retry-command','重试同一请求') + button('discard-command','放弃原请求') : ''}${button('refresh','读取最新状态')}${err.code === 'UNAUTHENTICATED' ? link('/login','重新登录','button') : ''}</div></div>`;
  action('retry-command', () => retryCommand?.());
  action('discard-command', () => {command.discard(); retryCommand = undefined; target.innerHTML = '<p role="status">已放弃原请求。请读取最新状态并重新确认；尚未提交的输入仍保留。</p>';});
  action('refresh', () => load());
}
function action(key: string, fn: () => unknown) {
  document.querySelectorAll<HTMLButtonElement>(`[data-action="${key}"]`).forEach(el => el.onclick = () => {if (!busy) Promise.resolve().then(fn).catch(feedback);});
}
async function mutate<K extends RouteName>(intent: Intent<K>, success: (value: ResponseFor<K>) => void | Promise<void>) {
  const execute = async () => {
    if (busy) return;
    busy = true;
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
    buttons.forEach(b => b.disabled = true);
    try {
      const value = await command.run(api, intent);
      retryCommand = undefined;
      await success(value);
    } catch (error) { feedback(error); }
    finally {busy = false; buttons.forEach(b => b.disabled = false);}
  };
  if (command.intent && command.intent !== intent) {feedback(new ApiError('PENDING_INTENT','上一请求结果尚未确认，请重试原请求或明确放弃。'));return;}
  retryCommand = execute;
  await execute();
}
function retain(form: HTMLFormElement, key: string) {
  for (const field of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input:not([type=password]),textarea,select')) {
    const saved = drafts.get(key + ':' + field.name);
    if (saved !== undefined) field.value = saved;
    field.oninput = () => drafts.set(key + ':' + field.name, field.value);
    field.onchange = () => drafts.set(key + ':' + field.name, field.value);
  }
}
function form(key: string, fn: (data: FormData, submitter: HTMLElement | null) => Promise<void>, keep = true) {
  const el = document.querySelector<HTMLFormElement>(`form[data-form="${key}"]`);
  if (!el) return;
  if (keep) retain(el, route());
  el.onsubmit = event => {event.preventDefault();if (!busy) void fn(new FormData(el), event.submitter).catch(feedback);};
}
const field = (label: string, key: string, value = '', area = false, max = 8000) => `<label>${label}${area ? `<textarea name="${key}" required maxlength="${max}" rows="3">${e(value)}</textarea>` : `<input name="${key}" required maxlength="${max}" value="${e(value)}">`}</label>`;

function login() {
  content(`<section class="flow login"><p class="eyebrow">进入你的协作空间</p><h1>登录</h1><p class="intro">使用管理员为你开通的账号。</p><form data-form="login" class="panel">${field('账号','username','',false,100)}<label>密码<input name="password" type="password" required minlength="12" maxlength="256" autocomplete="current-password"></label><button class="primary" type="submit">登录</button><p class="fine">身份由服务验证；页面不提供成员身份切换。</p></form></section>`, '登录');
  document.querySelector<HTMLInputElement>('[name=username]')!.autocomplete = 'username';
  form('login', async data => {
    busy = true;
    try {
      await api.call('login',{params:{},query:{},headers:{},body:{username:String(data.get('username')),password:String(data.get('password'))}});
      location.hash = '/'; await load();
    } finally {busy = false;}
  }, false);
}
function entry() {
  content(`<section class="entry"><p class="eyebrow">从一件要完成的事开始</p><h1>今天，想把什么事情推进一步？</h1><p class="intro">说出目标，由你确认需要的人与分工。</p><form data-form="entry" class="composer"><label class="sr-only" for="goal">描述你的需求</label><textarea id="goal" name="goal" required maxlength="8000" placeholder="我有一份科研项目申请书要写……"></textarea><div class="composer-actions"><span class="fine">AI 建议尚未接通；你可以手工编辑方案。</span><button class="primary" type="submit">手工创建方案</button></div></form><div class="suggestions">${['科研论文','科研项目','知识产权','实验与数据','学生培养','汇报事务'].map(t => `<button data-prompt="${t}">${t}</button>`).join('')}</div><div class="recent">${link('/lab','查看我参与的真实任务 ' + icon('arrow-right'))}</div><p class="fine">继续未确认草案请打开保存后的方案链接。附件与完整实验室聚合将在后续阶段接通。</p></section>`, '需求入口');
  form('entry', async data => {
    editor = {labId:session!.member.labId,goal:String(data.get('goal')),proposedItems:[],unresolvedQuestions:[]};
    editorRoute = '/plans/new'; currentPlan = undefined; dirty = true; addItem(); location.hash = '/plans/new';
  });
  document.querySelectorAll<HTMLButtonElement>('[data-prompt]').forEach(b => b.onclick = () => {const el=document.querySelector<HTMLTextAreaElement>('#goal')!; el.value=`我想推进一项${b.dataset.prompt}任务：`;el.dispatchEvent(new Event('input'));el.focus();});
}
function addItem() {
  editor!.proposedItems.push({id:'item_' + crypto.randomUUID(),title:'',goal:'',deliverable:'',acceptanceCriteria:'',allocation:{kind:'self'},dependencies:[],schedule:emptySchedule(),inputArtifactIds:[],budget:null}); dirty=true;
}
function planEditor() {
  const editable = !currentPlan || currentPlan.status === 'draft';
  content(`<section class="flow">${link('/','← 返回需求入口','back')}<p class="eyebrow">手工协作方案</p><h1>把目标变成可确认的安排</h1><p class="intro">先看分工，确认后再安排执行。</p><p class="banner">AI 建议尚未接通。以下内容由你填写；邀请需要对方接受后才成为承诺。</p><p class="fine">${currentPlan ? `方案 ${e(currentPlan.id)} · 版本 ${currentPlan.version} · ${currentPlan.status === 'draft' ? '草案' : '已确认'}。可收藏当前链接以继续。` : '未保存草案 · 尚未创建任务'}</p><form data-form="plan"><fieldset ${editable ? '' : 'disabled'}>${field('整体目标','goal',editor!.goal,true)}<div class="plan-items">${editor!.proposedItems.map((item,i)=>`<section class="panel" data-item="${i}"><div class="section-heading"><h2>分工 ${i+1}</h2>${button('remove-'+i,'移除')}</div><div class="form-grid">${field('任务标题',`title-${i}`,item.title,false,200)}${field('这一项的目标',`goal-${i}`,item.goal)}${field('交付什么',`deliverable-${i}`,item.deliverable,true)}${field('怎样算完成',`criteria-${i}`,item.acceptanceCriteria,true)}<label>承接方式<select name="allocation-${i}"><option value="self" ${item.allocation.kind==='self'?'selected':''}>由我承担</option><option value="invitation" ${item.allocation.kind==='invitation'?'selected':''}>邀请成员</option><option value="claim" ${item.allocation.kind==='claim'?'selected':''}>开放认领</option></select></label><label>拟邀请成员<select name="member-${i}"><option value="">请选择成员</option>${members.filter(m=>m.id!==session!.member.id).map(m=>`<option value="${e(m.id)}" ${item.allocation.kind==='invitation'&&item.allocation.memberId===m.id?'selected':''}>${e(m.displayName)}</option>`).join('')}</select></label><label>建议交付日期（可留空）<input type="date" name="date-${i}" value="${item.schedule.suggested?.value.kind==='date'?item.schedule.suggested.value.date:''}"></label><label>预计投入小时（未知则留空）<input type="number" min="0" max="10000" step="0.5" name="hours-${i}" value="${item.schedule.estimatedHumanHours??''}"></label></div><p class="fine">时间按 ${e(Intl.DateTimeFormat().resolvedOptions().timeZone)} 记录；建议日期不代表成员已承诺。依赖与复杂变更留在 F2。</p></section>`).join('')}</div>${button('add-item','＋ 增加分工')}<label>待澄清的问题（可留空，每行一条）<textarea name="questions" rows="2" maxlength="8000">${e(editor!.unresolvedQuestions.join('\n'))}</textarea></label><div class="actions"><button class="primary" type="submit">保存方案</button>${currentPlan ? button('confirm-plan','确认此版本并安排',true) : ''}</div></fieldset></form>${!editable ? link('/lab','查看已确认任务','button primary') : '<p class="fine">确认使用最近一次已保存版本；有未保存改动时请先保存。</p>'}</section>`, '协作方案');
  const planForm=document.querySelector<HTMLFormElement>('[data-form=plan]')!;
  if(refreshedPlan && currentPlan && refreshedPlan.version!==currentPlan.version){
    const compare=document.createElement('section');compare.className='panel';compare.innerHTML=`<h2>服务端已有版本 ${refreshedPlan.version}</h2><p>你的编辑仍基于版本 ${currentPlan.version}。请先比较最新内容，再明确选择；不会自动覆盖。</p><p class="prose">${e(refreshedPlan.goal)}</p>${refreshedPlan.proposedItems.map(item=>`<p class="prose">${e(item.title)}：${e(item.goal)} · 交付 ${e(item.deliverable)} · 验收 ${e(item.acceptanceCriteria)}</p>`).join('')}<div class="actions">${button('adopt-server','采用服务端内容')}${refreshedPlan.status==='draft'?button('rebase-editor','保留我的编辑，重新确认新版本'):''}</div>`;
    planForm.before(compare);
    action('adopt-server',()=>{currentPlan=refreshedPlan;editor={labId:currentPlan!.labId,goal:currentPlan!.goal,proposedItems:structuredClone(currentPlan!.proposedItems),unresolvedQuestions:[...currentPlan!.unresolvedQuestions]};dirty=false;refreshedPlan=undefined;command.discard();retryCommand=undefined;planEditor();});
    action('rebase-editor',()=>{currentPlan=refreshedPlan;refreshedPlan=undefined;command.discard();retryCommand=undefined;dirty=true;planEditor();});
  }
  const sync = () => {
    const values=new FormData(planForm);editor!.goal=String(values.get('goal')??editor!.goal);
    editor!.unresolvedQuestions=String(values.get('questions')??'').split('\n').map(v=>v.trim()).filter(Boolean);
    editor!.proposedItems.forEach((item,i)=> {
      item.title=String(values.get(`title-${i}`)??'');item.goal=String(values.get(`goal-${i}`)??'');item.deliverable=String(values.get(`deliverable-${i}`)??'');item.acceptanceCriteria=String(values.get(`criteria-${i}`)??'');
      const kind=values.get(`allocation-${i}`);
      item.allocation=kind==='invitation'?{kind,memberId:String(values.get(`member-${i}`)??'')}:kind==='claim'?{kind,audience:'lab_members',summary:item.goal}:{kind:'self'};
      const day=String(values.get(`date-${i}`)??''); item.schedule.suggested=day?{value:{kind:'date',date:day,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone},source:'user',confirmed:false}:null;
      const hours=String(values.get(`hours-${i}`)??'');item.schedule.estimatedHumanHours=hours?Number(hours):null;
    });dirty=true;
  };
  planForm.oninput=sync;planForm.onchange=sync;
  action('add-item',()=>{sync();addItem();planEditor();});
  editor!.proposedItems.forEach((_,i)=>action('remove-'+i,()=>{sync();editor!.proposedItems.splice(i,1);planEditor();}));
  form('plan', async () => {
    sync();
    if (!editor!.proposedItems.length) throw new ApiError('VALIDATION_ERROR','请至少添加一项分工。');
    const saved = async (value: ResponseFor<'createPlan'>) => {currentPlan=value.data;editor=structuredClone(value.data);dirty=false;editorRoute='/plans/'+value.data.id;location.hash=editorRoute;await load();};
    if(currentPlan) await mutate(new Intent('editPlan',{labId:editor!.labId,goal:editor!.goal,proposedItems:editor!.proposedItems,unresolvedQuestions:editor!.unresolvedQuestions,expectedVersion:currentPlan.version},{id:currentPlan.id}),saved);
    else await mutate(new Intent('createPlan',editor!,{}),saved);
  },false);
  action('confirm-plan',async()=>{
    if(dirty) throw new ApiError('UNSAVED_CHANGES','请先保存改动，再确认已保存版本。');
    await mutate(new Intent('confirmPlan',{expectedVersion:currentPlan!.version},{id:currentPlan!.id}),async value=>{
      currentPlan=value.data.plan;editor=structuredClone(value.data.plan);dirty=false;planEditor();
      document.querySelector('#feedback')!.innerHTML=`<div class="panel" role="status"><h2>方案已确认</h2>${value.data.taskIds.map(id=>link('/tasks/'+id,'查看任务 '+e(id),'button')).join(' ')}</div>`;
    });
  });
}

async function taskList(signal: AbortSignal) {
  const result=await api.read('tasks',{}, {labId:session!.member.labId,scope,limit:30,...(pageCursor?{cursor:pageCursor}:{})},signal);
  content(`<section class="page"><div class="page-heading"><div><h1>实验室任务</h1><p class="intro">找到当前要推进的一件事。</p></div>${link('/plans/new','手工创建方案','button')}</div><div class="scope" role="group" aria-label="任务范围">${['lab','mine'].map(s=>`<button data-scope="${s}" aria-pressed="${scope===s}">${s==='lab'?'实验室':'我参与的'}</button>`).join('')}${button('refresh','刷新')}</div><p class="banner">当前为服务返回的基本任务列表。完整实验室聚合、人员负荷和复杂协调尚未接通。</p><div class="task-list">${result.data.length?result.data.map(t=>`<article class="task-card"><span class="tag">${'status'in t?labels[t.status]:'承接前摘要'}</span><h2>${link('/tasks/'+t.id,e(t.title))}</h2><p>版本 ${t.version} · 发起 ${e(name(t.initiatorId))} · 验收 ${e(name(t.reviewerId))}</p><p>${e('goal'in t?t.goal:t.summary)}</p><div class="card-note green">${'allowedActions'in t && t.allowedActions.length ? '可处理：'+t.allowedActions.map(a=>({claim:'认领',decide:'回应邀请',start:'开始',submit:'提交成果',review:'验收',invite:'邀请成员'} as Record<string,string>)[a]??a).join('、'):'查看详情与当前安排'}</div></article>`).join(''):'<p class="state-panel">当前范围没有可见任务。</p>'}</div><div class="actions">${pageCursor?button('first-page','回到第一页'):''}${result.nextCursor?button('next-page','下一页'):''}</div></section>`, '实验室任务');
  document.querySelectorAll<HTMLButtonElement>('[data-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.scope!;pageCursor=undefined;void load();});
  action('refresh',()=>load());action('first-page',()=>{pageCursor=undefined;return load();});action('next-page',()=>{pageCursor=result.nextCursor??undefined;return load();});
}

async function taskDetail(id: string, signal: AbortSignal) {
  const result=await api.read('task',{id},{},signal);
  const value=result.data;
  if ('projection'in value) {
    content(`<section class="flow narrow">${link('/lab','← 实验室任务','back')}<p class="eyebrow">参与协作 · 承接前摘要</p><h1>${e(value.title)}</h1><p class="intro">只展示承接所需信息，接受后读取获授权的任务资料。</p><section class="panel"><p class="banner">${e(value.summary)}</p><dl class="facts"><dt>交付什么</dt><dd>${e(value.deliverable)}</dd><dt>怎样算完成</dt><dd>${e(value.acceptanceCriteria)}</dd><dt>发起 / 验收</dt><dd>${e(name(value.initiatorId))} / ${e(name(value.reviewerId))}</dd></dl>${schedule(value.schedule)}<p class="fine">任务版本 ${value.version} · 可以使用自己的私有方法，只需提交约定成果。</p><div id="invitation-action"></div><div class="actions">${value.allowedActions.includes('claim')?button('claim','认领这项任务',true):''}${button('refresh','刷新状态')}</div></section></section>`, '承接任务');
    action('claim',()=>mutate(new Intent('claim',{expectedVersion:value.version},{id}),async()=>load()));
    // Invitation projection is supplied by the versioned B1 contract; wired after its frozen commit lands.
    action('refresh',()=>load());return;
  }
  const task=value.task;
  const assignments=value.assignments;
  const latest=[...value.deliverables].sort((a,b)=>b.revision-a.revision)[0];
  const assignmentLabels:Record<string,string>={pending:'待回应（尚未承诺）',accepted:'已接受',declined:'已拒绝',withdrawn:'已退出',transfer_pending:'待转交',transferred:'已转交',cancelled:'已取消'};
  content(`<section class="page detail">${link('/lab','← 实验室任务','back')}<span class="tag">${labels[task.status]}</span><h1>${e(task.title)}</h1><p class="intro">负责人 ${e(name(task.leadId))} · 发起 ${e(name(task.initiatorId))} · 验收 ${e(name(task.reviewerId))}</p><p class="fine">任务版本 ${task.version} · 方案版本 ${task.planVersion} · 更新 ${e(task.updatedAt)}</p><section class="panel"><h2>目标与验收</h2><p class="prose">${e(task.goal)}</p><p class="prose">${e(task.acceptanceCriteria)}</p>${schedule(task.schedule)}</section><div class="alert"><div><strong>当前需要处理</strong><p>${task.allowedActions.includes('review')?'请检查最新交付，再接受或提出修改。':task.allowedActions.includes('submit')?'完成约定成果后提交文本版本。':task.allowedActions.includes('start')?'承诺已记录，可以开始推进。':task.allowedActions.includes('invite')?'当前可邀请成员承接。':'等待相关成员处理，或刷新查看最新状态。'}</p></div><div class="actions">${task.allowedActions.includes('start')?button('start','开始任务',true):''}${button('refresh','刷新状态')}</div></div><h2>邀请与承诺</h2><div class="table-wrap" role="region" aria-label="邀请与承诺，可横向滚动" tabindex="0"><table><thead><tr><th>成员</th><th>邀请 / 承接状态</th><th>已接受范围与时间</th><th>记录版本</th></tr></thead><tbody>${assignments.map(a=>`<tr><th>${e(name(a.memberId))}</th><td>${assignmentLabels[a.status]??e(a.status)}</td><td>${a.commitment?e(a.commitment.scope)+'<br>'+e(date(a.commitment.schedule.committed)):'尚无承诺'}</td><td>${a.version}</td></tr>`).join('')||'<tr><td colspan="4">暂无承接记录</td></tr>'}</tbody></table></div>${task.allowedActions.includes('invite')?`<form data-form="invite" class="panel"><h2>邀请成员</h2><label>受邀成员<select name="memberId" required><option value="">请选择</option>${members.filter(m=>m.id!==session!.member.id).map(m=>`<option value="${e(m.id)}">${e(m.displayName)}</option>`).join('')}</select></label>${field('邀请承担的范围','scope',task.goal,true)}<p class="fine">沿用上方任务时间；对方接受后才记为承诺。</p><button class="primary">发送邀请</button></form>`:''}<h2>交付与验收</h2><p class="fine">只需约定成果和必要依据，无需披露个人工具、私有能力或过程日志。反馈共享尚未接通，不随验收授权。</p>${value.deliverables.map(d=>`<article class="panel"><span class="tag">交付 v${d.revision} · 记录版本 ${d.version}</span><p class="fine">${e(name(d.submittedBy))} · ${e(d.submittedAt)}</p><p class="prose">${e(d.summary)}</p>${d.sources.length?`<ul>${d.sources.map(s=>`<li>${e(s.label)}：${e(s.locator)}</li>`).join('')}</ul>`:''}<p class="review-result">${d.review?`${d.review.decision==='accepted'?'已验收':'需修改'} · 绑定交付 v${d.review.revision} · ${e(name(d.review.reviewerId))}<br>${e(d.review.comment)}`:'待验收'}</p></article>`).join('')||'<p class="fine">尚无已提交成果。</p>'}${task.allowedActions.includes('submit')?`<form data-form="submit" class="panel"><h2>${task.status==='changes_requested'?'修改后重新提交':'提交文本成果'}</h2>${field('成果正文','summary','',true)}<label>必要来源说明（可留空）<textarea name="source" maxlength="2000" rows="2"></textarea></label><button class="primary">提交新版本</button></form>`:''}${task.allowedActions.includes('review')&&latest?`<form data-form="review" class="panel"><h2>验收交付 v${latest.revision}</h2>${field('验收意见或修改要求','comment','',true)}<div class="actions"><button class="primary" name="decision" value="accepted">接受这版交付</button><button name="decision" value="changes_requested">提出修改</button></div></form>`:''}<p class="fine">完整依赖、事件时间线、附件与复杂协调留在 F2；AI 未接通。</p></section>`, '任务详情');
  action('refresh',()=>load());action('start',()=>mutate(new Intent('start',{expectedVersion:task.version},{id}),async()=>load()));
  form('invite',async data=>mutate(new Intent('invite',{expectedVersion:task.version,memberId:String(data.get('memberId')),scope:String(data.get('scope')),schedule:task.schedule},{id}),async()=>load()));
  form('submit',async data=>mutate(new Intent('submit',{expectedVersion:task.version,summary:String(data.get('summary')),artifactRefs:[],sources:data.get('source')?[{kind:'note',label:'提交者提供的依据',locator:String(data.get('source'))}]:[]},{id}),async()=>{drafts.delete(route()+':summary');drafts.delete(route()+':source');await load();}));
  form('review',async(data,submitter)=>mutate(new Intent('review',{expectedVersion:latest!.version,expectedTaskVersion:task.version,revision:latest!.revision,decision:(submitter as HTMLButtonElement).value as 'accepted'|'changes_requested',comment:String(data.get('comment'))},{id:latest!.id}),async()=>{drafts.delete(route()+':comment');await load();}));
}

async function load() {
  controller?.abort();controller=new AbortController();const signal=controller.signal;const path=route();shell();
  try {
    if(path==='/login'){login();return;}
    const auth=await api.read('session',{}, {},signal);session=auth.data;api.csrfToken=session.csrfToken;
    if(draftOwner && draftOwner!==session.member.id){drafts.clear();editor=undefined;editorRoute='';currentPlan=undefined;refreshedPlan=undefined;command.discard();retryCommand=undefined;dirty=false;}
    draftOwner=session.member.id;
    members=[];let cursor: string|undefined;
    do {const response=await api.read('members',{id:session.member.labId},{limit:100,...(cursor?{cursor}:{})},signal);members.push(...response.data);cursor=response.nextCursor??undefined;}while(cursor);
    if(signal.aborted)return;shell();
    if(path==='/')entry();
    else if(path==='/lab')await taskList(signal);
    else if(path.startsWith('/tasks/'))await taskDetail(path.slice(7),signal);
    else if(path.startsWith('/plans/')){
      if(path==='/plans/new'){
        if(editorRoute!==path){currentPlan=undefined;editor={labId:session.member.labId,goal:'',proposedItems:[],unresolvedQuestions:[]};editorRoute=path;addItem();}
      }else{
        const response=await api.read('getPlan',{id:path.slice(7)},{},signal);
        if(editorRoute===path&&dirty&&currentPlan){refreshedPlan=response.data;}
        else {currentPlan=response.data;refreshedPlan=undefined;editor={labId:response.data.labId,goal:response.data.goal,proposedItems:structuredClone(response.data.proposedItems),unresolvedQuestions:[...response.data.unresolvedQuestions]};editorRoute=path;dirty=false;}
      }
      planEditor();
    } else content(`<section class="state-panel"><h1>页面不存在</h1>${link('/','回到入口')}</section>`,'页面不存在');
  }catch(error){
    if(signal.aborted)return;
    if(error instanceof ApiError&&error.code==='UNAUTHENTICATED'){session=undefined;api.csrfToken='';members=[];shell();login();feedback(error);}
    else {content('<section class="state-panel"><h1>暂时无法读取</h1><p>没有使用演示数据替代服务响应。</p></section>','读取失败');feedback(error);}
  }
}
window.addEventListener('hashchange',()=>{pageCursor=undefined;void load();});
void load();
