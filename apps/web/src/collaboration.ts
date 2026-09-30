import { contractVersion } from '@research-agent-platform/contracts';
import type { MemberModel, PlanModel, RequestFor, ResponseFor, RouteName, TaskModel } from '@research-agent-platform/contracts';
import { ApiClient, ApiError, CommandSlot, Intent } from './api';
import { escapeHtml as e } from './view-model';
import { labels } from './contract-projection';
import { taskCard, planCard, taskColumn, availabilityText } from './collaboration-view';

import { CoordinationContext } from './coordination-view';
import { scheduleFields, readSchedule, datedFields, readDated } from './schedule-editor';
const coordination = new CoordinationContext();
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
let activeSnapshot: ResponseFor<'overview'>['snapshot'] | undefined;
let nextReadSnapshot: string | undefined;
let planCursor: string | undefined;
let actionCursor: string | undefined;
let taskFilter = '';
let availabilityBase: MemberModel | undefined;
let availabilityDirty = false;
let viewReadAt = 0;
let checkingSnapshot = false;
const snapshotQuery = () => activeSnapshot ? {snapshot:activeSnapshot.token} : {};
function resetPages() { pageCursor=undefined; planCursor=undefined; actionCursor=undefined; nextReadSnapshot=undefined; }
function refresh() { resetPages(); return load(); }
function readStamp() {
  return activeSnapshot ? `<p class="fine read-stamp">服务读取时刻 <time datetime="${e(activeSnapshot.at)}">${e(activeSnapshot.at)}</time> · 页面为此时快照，点击刷新同步变化；列表定期检查失效。</p>` : '';
}
function resetEditor() {
  editor = undefined;
  editorRoute = '';
  currentPlan = undefined;
  refreshedPlan = undefined;
  dirty = false;
}
function clearOwnedContext() {
  resetEditor();
  coordination.clear();
  drafts.clear();
  command.discard();
  retryCommand = undefined;
  draftOwner = undefined;
  activeSnapshot=undefined; resetPages(); availabilityBase=undefined; availabilityDirty=false;
}
const route = () => location.hash.slice(1) || '/';
const link = (path: string, label: string, cls = '') => `<a class="${cls}" href="#${e(path)}">${label}</a>`;
const myTasksLink = (label: string, cls = '') => `<a class="${cls}" data-task-scope="mine" href="#/lab">${label}</a>`;
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
  if(!s.suggested&&!s.hardDeadline&&!s.committed&&s.estimatedHumanHours===null&&!s.checkpoint) return '<p class="fine">时间与投入尚未约定。</p>';
  return `<dl class="facts"><dt>建议时间</dt><dd>${e(date(s.suggested))}</dd><dt>硬性截止</dt><dd>${e(date(s.hardDeadline))}</dd><dt>承诺时间</dt><dd>${e(date(s.committed))}</dd><dt>预计投入</dt><dd>${s.estimatedHumanHours === null ? '未约定' : e(String(s.estimatedHumanHours)) + ' 小时'}</dd><dt>检查节点</dt><dd>${e(s.checkpoint?(s.checkpoint.kind==='date'?s.checkpoint.date+' · '+s.checkpoint.timezone:s.checkpoint.at):'未约定')}</dd></dl>`;
}
function shell() {
  app.innerHTML = `<button class="skip" data-skip>跳到主要内容</button><header>${link('/', '<img src="/brand.png" width="38" height="38" alt=""><span>Research Agent Platform</span>', 'brand')}<nav aria-label="主导航">${link('/', '需求入口')}${link('/lab', '实验室任务')}${session ? `<span class="session-name">${e(session.member.displayName)}</span>${button('logout','退出登录')}` : link('/login','登录')}</nav></header><main id="main" tabindex="-1"><section class="state-panel" role="status">正在从服务读取…</section></main><footer>AI 建议尚未接通 · 手工协作 · 契约 ${contractVersion}</footer>`;
  document.querySelector<HTMLButtonElement>('[data-skip]')!.onclick = () => document.querySelector<HTMLElement>('main')!.focus();
  action('logout', async () => {
    await api.call('logout', {params:{},query:{},headers:{},body:{}});
    session = undefined; api.csrfToken = ''; members = []; clearOwnedContext();
    location.hash = '/login'; await load();
  });
}
function content(html: string, title: string) {
  document.title = title + ' · Research Agent Platform';
  document.querySelector('main')!.innerHTML = html + '<div id="feedback" class="feedback" aria-live="polite"></div>';
  document.querySelectorAll<HTMLAnchorElement>('.task-card a, .saved-plan a, [data-read-link]').forEach(anchor => anchor.addEventListener('click',()=>{nextReadSnapshot=activeSnapshot?.token;}));
  document.querySelectorAll<HTMLAnchorElement>('[data-task-scope="mine"]').forEach(anchor => anchor.addEventListener('click',()=>{scope='mine';taskFilter='';resetPages();}));
}
function feedback(error: unknown) {
  const err = error instanceof ApiError ? error : new ApiError('ERROR', '操作未完成，请重试。');
  if(err.code==='UNAUTHENTICATED'){controller?.abort();session=undefined;api.csrfToken='';members=[];activeSnapshot=undefined;resetPages();shell();login();}
  if(['FORBIDDEN','NOT_FOUND'].includes(err.code)) {controller?.abort();if(route().startsWith('/tasks/')){coordination.reset(route().slice(7));for(const key of drafts.keys())if(key.startsWith(route()+':'))drafts.delete(key);command.discard();retryCommand=undefined;}members=[];activeSnapshot=undefined;resetPages();content('<section class="state-panel"><h1>无法访问此内容</h1><p>资源不存在或当前账号无权访问。旧内容已清除。</p></section>','无法访问');}
  const target = document.querySelector('#feedback') ?? document.querySelector('main')!;
  const conflict = ['VERSION_CONFLICT','IDEMPOTENCY_CONFLICT','ALREADY_CLAIMED','INVALID_STATE'].includes(err.code);
  if(err.code==='CURSOR_EXPIRED') {resetPages();activeSnapshot=undefined;}
  target.innerHTML = `<div class="alert" role="alert"><div><strong>${e(err.code)}</strong><p>${e(err.message)}</p>${err.requestId ? `<small>请求编号 ${e(err.requestId)}</small>` : ''}${conflict ? '<p>请读取最新状态并比较，再放弃原请求、重新确认；不会自动覆盖新版本。</p>' : ''}</div><div class="actions">${retryCommand ? button('retry-command','重试同一请求') + button('discard-command','放弃原请求') : ''}${button('refresh','读取最新状态')}${err.code === 'UNAUTHENTICATED' ? link('/login','重新登录','button') : ''}</div></div>`;
  action('retry-command', () => retryCommand?.());
  action('discard-command', () => {command.discard(); retryCommand = undefined; target.innerHTML = '<p role="status">已放弃原请求。请读取最新状态并重新确认；尚未提交的输入仍保留。</p>';});
  if(err.code==='CURSOR_EXPIRED') target.insertAdjacentHTML('afterbegin','<p role="status">数据或权限已变化，旧快照已清除。请读取最新状态重新同步。</p>');
  action('refresh', refresh);
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
    } catch (error) {
      if(!command.intent) retryCommand=undefined;
      feedback(error);
    }
    finally {busy = false; buttons.forEach(b => b.disabled = false);}
  };
  if (command.intent && command.intent !== intent) {feedback(new ApiError('PENDING_INTENT','上一请求结果尚未确认，请重试原请求或明确放弃。'));return;}
  retryCommand = execute;
  await execute();
}
function retain(form: HTMLFormElement, key: string) {
  for (const field of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input:not([type=password]):not([type=file]),textarea,select')) {
    const saved = drafts.get(key + ':' + field.name);
    if (saved !== undefined) {if(field instanceof HTMLInputElement && field.type==='checkbox')field.checked=saved==='true';else field.value=saved;}
    field.oninput = () => drafts.set(key + ':' + field.name, field instanceof HTMLInputElement && field.type==='checkbox'?String(field.checked):field.value);
    field.onchange = () => drafts.set(key + ':' + field.name, field instanceof HTMLInputElement && field.type==='checkbox'?String(field.checked):field.value);
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
function entry(extra = '') {
  content(`<section class="entry entry-daily"><p class="eyebrow">从一件要完成的事开始</p><h1>今天，想把什么事情推进一步？</h1><p class="intro">说出目标，由你确认需要的人与分工。</p><form data-form="entry" class="composer"><label class="sr-only" for="goal">描述你的需求</label><textarea id="goal" name="goal" required maxlength="8000" placeholder="我有一份科研项目申请书要写……"></textarea><div class="composer-actions"><span class="fine">AI 建议尚未接通；你可以手工编辑方案。</span><button class="primary" type="submit">手工创建方案</button></div></form><div class="suggestions">${['科研论文','科研项目','知识产权','实验与数据','学生培养','汇报事务'].map(t => `<button data-prompt="${t}">${t}</button>`).join('')}</div><div class="recent">${myTasksLink('查看我参与的真实任务 ' + icon('arrow-right'))}</div><p class="fine">已保存草案与本人待处理事项见下方；AI 意图识别尚未接通。</p></section>${extra}`, '需求入口');
  form('entry', async data => {
    resetEditor();
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
  content(`<section class="flow">${link('/','← 返回需求入口','back')}<p class="eyebrow">手工协作方案</p><h1>把目标变成可确认的安排</h1><p class="intro">先看分工，确认后再安排执行。</p><p class="banner">AI 建议尚未接通。以下内容由你填写；邀请需要对方接受后才成为承诺。</p><p class="fine">${currentPlan ? `方案 ${e(currentPlan.id)} · 版本 ${currentPlan.version} · ${currentPlan.status === 'draft' ? '草案' : '已确认'}。可收藏当前链接以继续。` : '未保存草案 · 尚未创建任务'}</p><form data-form="plan"><fieldset ${editable ? '' : 'disabled'}>${field('整体目标','goal',editor!.goal,true)}<div class="plan-items">${editor!.proposedItems.map((item,i)=>`<section class="panel" data-item="${i}"><div class="section-heading"><h2>分工 ${i+1}</h2>${button('remove-'+i,'移除')}</div><div class="form-grid">${field('任务标题',`title-${i}`,item.title,false,200)}${field('这一项的目标',`goal-${i}`,item.goal)}${field('交付什么',`deliverable-${i}`,item.deliverable,true)}${field('怎样算完成',`criteria-${i}`,item.acceptanceCriteria,true)}<label>承接方式<select name="allocation-${i}">${item.allocation.kind==='public_agent'?'<option value="public_agent" selected>公共 AI（尚未接通，保留原安排）</option>':''}<option value="self" ${item.allocation.kind==='self'?'selected':''}>由我承担</option><option value="invitation" ${item.allocation.kind==='invitation'?'selected':''}>邀请成员</option><option value="claim" ${item.allocation.kind==='claim'?'selected':''}>开放认领</option></select></label><label>拟邀请成员<select name="member-${i}"><option value="">请选择成员</option>${members.filter(m=>m.id!==session!.member.id).map(m=>`<option value="${e(m.id)}" ${item.allocation.kind==='invitation'&&item.allocation.memberId===m.id?'selected':''}>${e(m.displayName)}</option>`).join('')}</select></label><label>公开认领摘要（仅开放认领使用）<textarea name="public-summary-${i}" rows="2" maxlength="8000">${item.allocation.kind==='claim'?e(item.allocation.summary):''}</textarea></label>${scheduleFields(`plan-${i}`,item.schedule,false)}<label>前置分工（多选）<select multiple name="dependencies-${i}">${editor!.proposedItems.filter(other=>other.id!==item.id).map(other=>`<option value="${e(other.id)}" ${item.dependencies.includes(other.id)?'selected':''}>${e(other.title||other.id)}</option>`).join('')}</select></label></div>${schedule(item.schedule)}<p class="fine">开放认领的摘要、交付和验收要求会向实验室成员公开；完整目标保留在授权详情。时间按 ${e(Intl.DateTimeFormat().resolvedOptions().timeZone)} 记录；建议日期不代表成员已承诺。依赖在确认时由服务检查；变更在相关任务中协商。</p></section>`).join('')}</div>${button('add-item','＋ 增加分工')}<label>待澄清的问题（可留空，每行一条）<textarea name="questions" rows="2" maxlength="8000">${e(editor!.unresolvedQuestions.join('\n'))}</textarea></label><div class="actions"><button class="primary" type="submit">保存方案</button>${currentPlan ? button('confirm-plan','确认此版本并安排',true) : ''}</div></fieldset></form>${!editable ? link('/lab','查看已确认任务','button primary') : '<p class="fine">确认使用最近一次已保存版本；有未保存改动时请先保存。</p>'}</section>`, '协作方案');
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
      item.allocation=kind==='invitation'?{kind,memberId:String(values.get(`member-${i}`)??'')}:kind==='claim'?{kind,audience:'lab_members',summary:String(values.get(`public-summary-${i}`)??'')}:kind==='public_agent'?item.allocation:{kind:'self'};
      item.schedule=readSchedule(values,`plan-${i}`,item.schedule,false);
      item.dependencies=values.getAll(`dependencies-${i}`).map(String);
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

function actionCard(item: ResponseFor<'actionItems'>['data'][number]) { return `<section><p class="fine">${item.kind==='execution_attention'?'AI 运行待处理':item.kind==='change_response'?'待回应变更 · 提议 v'+item.proposal.version:item.kind==='invitation_response'?'待回应邀请':'待验收交付'}</p>${taskCard(item.task,name)}</section>`; }
async function dailyEntry(signal: AbortSignal) {
  const query=snapshotQuery(), labId=session!.member.labId;
  const [plans,actions,...progress]=await Promise.all([
    api.read('plans',{}, {...query,status:'draft',limit:5},signal),
    api.read('actionItems',{id:labId},{...query,kind:'all',limit:6},signal),
    ...(['ready','in_progress','changes_requested'] as const).map(status=>api.read('tasks',{}, {...query,labId,scope:'mine',status,limit:6},signal)),
  ]);
  if(signal.aborted)return;
  const advance=progress.flatMap(p=>p.data).filter(t=>t.allowedActions.some(a=>a==='start'||a==='submit'));
  entry(`<section class="daily flow" aria-label="我的日常任务">${readStamp()}<div class="section-heading"><h2>先处理与你有关的事</h2>${button('refresh','刷新')}</div><h3>需要回应或验收</h3><div class="task-list">${actions.data.map(actionCard).join('')||'<p class="fine">当前没有需要你回应的邀请或验收。</p>'}</div>${actions.nextCursor?link('/actions','查看全部待处理事项','button'):''}<details><summary>继续推进 · 展开近期可操作事项</summary><p class="fine">按待开始、进行中、需修改分别读取最近 6 项授权记录，只展示服务允许你开始或提交的事项；不是全量待办统计。</p><div class="task-list">${advance.map(t=>taskCard(t,name)).join('')||'<p class="fine">本页没有可直接推进的事项，可到“我参与的”查看全部记录。</p>'}</div>${myTasksLink('查看我参与的任务','button')}</details><details open><summary>我的已保存草案</summary><p class="fine">仅本人未确认方案；确认后移出此列表。未保存输入不属于服务端草案。</p>${plans.data.map(planCard).join('')||'<p class="fine">尚无已保存的未确认草案。</p>'}${link('/plans',plans.nextCursor?'查看全部草案':'草案与已确认方案历史','button')}</details><p class="fine">AI 意图识别与自然语言生成尚未接通。请使用上方手工方案。</p></section>`);
  action('refresh',refresh);
}
async function planList(signal: AbortSignal) {
  const status=new URLSearchParams(location.hash.split('?')[1]??'').get('status')==='confirmed'?'confirmed':'draft';
  const result=await api.read('plans',{}, {...snapshotQuery(),status,limit:10,...(planCursor?{cursor:planCursor}:{})},signal);
  if(signal.aborted)return;
  content(`<section class="flow">${link('/','← 返回需求入口','back')}<h1>我的已保存方案</h1>${readStamp()}<div class="actions">${link('/plans','未确认草案','button')}${link('/plans?status=confirmed','已确认方案','button')}${button('refresh','刷新')}</div><p class="fine">当前：${status==='draft'?'未确认草案，确认后移出此列表':'已确认方案历史'}。只显示本人方案。</p>${result.data.map(planCard).join('')||'<p class="state-panel">当前没有已保存方案。</p>'}<div class="actions">${planCursor?button('plans-first','回到第一页'):''}${result.nextCursor?button('plans-next','下一页草案'):''}</div></section>`,'我的方案');
  action('refresh',refresh);
  action('plans-first',()=>{planCursor=undefined;nextReadSnapshot=activeSnapshot?.token;return load();});
  action('plans-next',()=>{planCursor=result.nextCursor??undefined;nextReadSnapshot=activeSnapshot?.token;return load();});
}
async function actionList(signal: AbortSignal) {
  const result=await api.read('actionItems',{id:session!.member.labId},{...snapshotQuery(),kind:'all',limit:10,...(actionCursor?{cursor:actionCursor}:{})},signal);
  if(signal.aborted)return;
  content(`<section class="flow">${link('/','← 返回需求入口','back')}<h1>需要我回应或验收</h1>${readStamp()}${button('refresh','刷新')}<div class="task-list">${result.data.map(actionCard).join('')||'<p class="fine">当前没有需要回应或验收的事项。</p>'}</div><div class="actions">${actionCursor?button('actions-first','回到第一页'):''}${result.nextCursor?button('actions-next','下一页事项'):''}</div></section>`,'待处理事项');
  action('refresh',refresh);
  action('actions-first',()=>{actionCursor=undefined;nextReadSnapshot=activeSnapshot?.token;return load();});
  action('actions-next',()=>{actionCursor=result.nextCursor??undefined;nextReadSnapshot=activeSnapshot?.token;return load();});
}
async function taskList(signal: AbortSignal) {
  const query=snapshotQuery();
  const [overview,result]=await Promise.all([
    api.read('overview',{id:session!.member.labId},{...query,scope},signal),
    api.read('tasks',{}, {...query,labId:session!.member.labId,scope,limit:30,...(taskFilter?{status:taskFilter}:{}),...(pageCursor?{cursor:pageCursor}:{})},signal),
  ]);
  if(signal.aborted)return;
  const data=overview.data;
  const columns=[['unassigned','待安排'],['active','进行中'],['review','待验收'],['completed','已完成']] as const;
  content(`<section class="page"><div class="page-heading"><div><h1>实验室任务</h1><p class="intro">任务、当前要处理的事与授权人员安排。</p></div>${link('/plans/new','手工创建方案','button')}</div>${readStamp()}<div class="scope" role="group" aria-label="任务范围">${['lab','mine'].map(s=>`<button data-scope="${s}" aria-pressed="${scope===s}">${s==='lab'?'实验室':'我参与的'}</button>`).join('')}${button('refresh','刷新')}</div><p class="banner">需要本人回应的邀请 ${data.pendingActions.invitationResponses} 项 · 待本人验收 ${data.pendingActions.deliverableReviews} 项 · 待本人回应变更 ${data.pendingActions.changeResponses??0} 项。${link('/actions','查看待处理事项')}</p><label class="task-filter">任务状态<select aria-label="任务状态" data-status><option value="">全部状态</option>${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${taskFilter===key?'selected':''}>${label}</option>`).join('')}</select></label><p class="fine">四列数字是当前范围全量计数，卡片仅为本页 ${result.data.length} 项${taskFilter?'筛选结果':''}。已取消单独展示。任务数和人数不代表工作负荷。</p><div class="board">${columns.map(([key,label])=>`<section class="column" data-column="${key}"><h2>${label} <span data-total="${key}">${data.counts[key]}</span></h2>${result.data.filter(t=>taskColumn(t)===key).map(t=>taskCard(t,name)).join('')||'<p class="column-empty">本页无此类事项</p>'}</section>`).join('')}</div>${result.data.some(t=>taskColumn(t)===null)?`<details open><summary>已取消 · 本页</summary>${result.data.filter(t=>taskColumn(t)===null).map(t=>taskCard(t,name)).join('')}</details>`:''}${result.data.some(t=>taskColumn(t)===undefined)?`<details open><summary>服务未提供状态</summary>${result.data.filter(t=>taskColumn(t)===undefined).map(t=>taskCard(t,name)).join('')}</details>`:''}<div class="actions">${pageCursor?button('first-page','回到第一页'):''}${result.nextCursor?button('next-page','下一页'):''}</div><p class="fine">可完整访问任务的交付版本：已提交 ${data.submittedDeliverables}，已验收 ${data.acceptedDeliverables}。这是版本计数，不是工时完成比例。</p><details class="people"><summary>人员安排 · 授权承诺与自报可用时间</summary><p class="fine">只展示有权查看的当前承诺；邀请尚未接受不算承诺。缺失或过期可用时间不推断为有空。</p>${link('/availability','更新我的可用时间','button')}${members.map(member=>`<article class="panel" data-member="${e(member.id)}"><h3>${e(member.displayName)}</h3><p>${e(availabilityText(member))}</p><h4>当前可见承诺</h4>${member.visibleCommitments.map(c=>`<p><a data-read-link href="#/tasks/${e(c.taskId)}">${e(c.scope)}</a> · ${e(date(c.schedule.committed))}</p>`).join('')||'<p class="fine">暂无获授权的当前承诺记录；不表示成员没有其他工作。</p>'}${member.visibleCommitmentsTruncated?'<p class="fine">仅展示前 100 项可见承诺；可继续通过任务分页查看，不能据此推断完整负荷。</p>':''}</article>`).join('')}</details><p class="fine">读取与详情使用同一服务快照。变化、阻塞和附件在相关任务中按需处理；AI 尚未接通。</p></section>`, '实验室任务');
  document.querySelectorAll<HTMLButtonElement>('[data-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.scope!;taskFilter='';void refresh();});
  document.querySelector<HTMLSelectElement>('[data-status]')!.onchange=event=>{taskFilter=(event.target as HTMLSelectElement).value;void refresh();};
  action('refresh',refresh);action('first-page',()=>{pageCursor=undefined;nextReadSnapshot=activeSnapshot?.token;return load();});action('next-page',()=>{pageCursor=result.nextCursor??undefined;nextReadSnapshot=activeSnapshot?.token;return load();});
}

async function taskDetail(id: string, signal: AbortSignal) {
  const result=await api.read('task',{id},snapshotQuery(),signal);
  const value=result.data;
  if ('projection'in value) {
    content(`<section class="flow narrow">${link('/lab','← 实验室任务','back')}<p class="eyebrow">参与协作 · 承接前摘要</p><h1>${e(value.title)}</h1><p class="intro">只展示承接所需信息，接受后读取获授权的任务资料。</p><section class="panel"><p class="banner">${e(value.summary)}</p><dl class="facts"><dt>交付什么</dt><dd>${e(value.deliverable)}</dd><dt>怎样算完成</dt><dd>${e(value.acceptanceCriteria)}</dd><dt>发起 / 验收</dt><dd>${e(name(value.initiatorId))} / ${e(name(value.reviewerId))}</dd></dl>${schedule(value.schedule)}<p class="fine">任务版本 ${value.version} · 可以使用自己的私有方法，只需提交约定成果。</p><div id="invitation-action"></div><div class="actions">${value.allowedActions.includes('claim')?`<form data-form="claim">${datedFields('claim-committed','本人承诺时间（可未知）',null,true)}<button class="primary">认领这项任务</button></form>`:''}${button('refresh','刷新状态')}</div></section></section>`, '承接任务');
    form('claim',async data=>mutate(new Intent('claim',{expectedVersion:value.version,committed:readDated(data,'claim-committed',true)},{id}),async()=>load()));
    if(value.pendingInvitation && value.allowedActions.includes('decide')) {
      const invitation=value.pendingInvitation;
      document.querySelector('#invitation-action')!.innerHTML=`<section><h2>待回应邀请 · 版本 ${invitation.version}</h2><p class="prose">${e(invitation.scope)}</p>${schedule(invitation.schedule)}<p class="fine">尚未承诺。接受表示同意以上范围与时间；拒绝不会自动转给其他人。</p><form data-form="decision">${datedFields('decision-committed','本人承诺时间（可未知）',null,true)}<label>回应说明（可留空）<textarea name="comment" maxlength="8000" rows="2"></textarea></label><div class="actions"><button class="primary" value="accepted">接受邀请</button><button value="declined">拒绝邀请</button></div></form></section>`;
      form('decision',async(data,submitter)=>mutate(new Intent('invitationDecision',{expectedVersion:invitation.version,expectedTaskVersion:value.version,decision:(submitter as HTMLButtonElement).value as 'accepted'|'declined',comment:String(data.get('comment')??'')||null,...((submitter as HTMLButtonElement).value==='accepted'?{committed:readDated(data,'decision-committed',true)}:{})},{id:invitation.id}),async()=>{drafts.delete(route()+':comment');await load();}));
    }
    action('refresh',refresh);return;
  }
  if(signal.aborted)return;
  const task=value.task;
  const assignments=value.assignments;
  const latest=[...value.deliverables].sort((a,b)=>b.revision-a.revision)[0];
  const assignmentLabels:Record<string,string>={pending:'待回应（尚未承诺）',accepted:'已接受',declined:'已拒绝',withdrawn:'已退出',transfer_pending:'待转交',transferred:'已转交',cancelled:'已取消'};
  content(`<section class="page detail">${link('/lab','← 实验室任务','back')}<span class="tag">${labels[task.status]}</span><h1>${e(task.title)}</h1><p class="intro">负责人 ${e(name(task.leadId))} · 发起 ${e(name(task.initiatorId))} · 验收 ${e(name(task.reviewerId))}</p>${readStamp()}<p class="fine">任务版本 ${task.version} · 方案版本 ${task.planVersion} · 更新 ${e(task.updatedAt)}</p><section class="panel"><h2>目标与验收</h2><p class="prose">${e(task.goal)}</p><p class="prose">${e(task.acceptanceCriteria)}</p>${schedule(task.schedule)}</section><div class="alert"><div><strong>当前需要处理</strong><p>${task.status==='completed'?'任务已验收，可查看各版交付与验收记录。':task.status==='cancelled'?'任务已取消。':task.allowedActions.includes('review')?'请检查最新交付，再接受或提出修改。':task.allowedActions.includes('submit')?'完成约定成果后提交文本版本。':task.allowedActions.includes('start')?'承诺已记录，可以开始推进。':task.allowedActions.includes('invite')?'当前可邀请成员承接。':'等待相关成员处理，或刷新查看最新状态。'}</p></div><div class="actions">${task.allowedActions.includes('start')?button('start','开始任务',true):''}${button('refresh','刷新状态')}</div></div><h2>邀请与承诺</h2><div class="table-wrap" role="region" aria-label="邀请与承诺，可横向滚动" tabindex="0"><table><thead><tr><th>成员</th><th>邀请 / 承接状态</th><th>已接受范围与时间</th><th>记录版本</th></tr></thead><tbody>${assignments.map(a=>`<tr><th>${e(name(a.memberId))}</th><td>${assignmentLabels[a.status]??e(a.status)}</td><td>${a.commitment?e(a.commitment.scope)+'<br>'+e(date(a.commitment.schedule.committed)):'尚无承诺'}</td><td>${a.version}</td></tr>`).join('')||'<tr><td colspan="4">暂无承接记录</td></tr>'}</tbody></table></div>${task.allowedActions.includes('invite')?`<form data-form="invite" class="panel"><h2>邀请成员</h2><label>受邀成员<select name="memberId" required><option value="">请选择</option>${members.filter(m=>m.id!==session!.member.id).map(m=>`<option value="${e(m.id)}">${e(m.displayName)}</option>`).join('')}</select></label>${field('邀请承担的范围','scope',task.goal,true)}<p class="fine">沿用上方任务时间；对方接受后才记为承诺。</p><button class="primary">发送邀请</button></form>`:''}<h2>交付与验收</h2><p class="fine">只需约定成果和必要依据，无需披露个人工具、私有能力或过程日志。反馈共享尚未接通，不随验收授权。</p>${value.deliverables.map(d=>`<article class="panel"><span class="tag">交付 v${d.revision} · 记录版本 ${d.version}</span><p class="fine">${e(name(d.submittedBy))} · ${e(d.submittedAt)}</p><p class="prose">${e(d.summary)}</p><p>附件引用：${d.artifactRefs.map(ref=>e(value.artifacts?.find(a=>a.id===ref)?.filename??ref)+'（'+e(ref)+'）').join('、')||'无'}</p>${d.sources.length?`<ul>${d.sources.map(s=>`<li>${e(s.label)}：${e(s.locator)}</li>`).join('')}</ul>`:''}<p class="review-result">${d.review?`${d.review.decision==='accepted'?'已验收':'需修改'} · 绑定交付 v${d.review.revision} · ${e(name(d.review.reviewerId))}<br>${e(d.review.comment)}`:'待验收'}</p></article>`).join('')||'<p class="fine">尚无已提交成果。</p>'}${task.allowedActions.includes('submit')?`<form data-form="submit" class="panel"><h2>${task.status==='changes_requested'?'修改后重新提交':'提交文本成果'}</h2>${field('成果正文','summary','',true)}<label>必要来源说明（可留空）<textarea name="source" maxlength="2000" rows="2"></textarea></label><fieldset><legend>引用已上传附件</legend>${(value.artifacts??[]).filter(a=>a.accessStatus==='available').map(a=>`<label><input type="checkbox" name="artifact-${e(a.id)}" value="${e(a.id)}">${e(a.filename)} · 附件 v${a.version}</label>`).join('')||'暂无可引用附件'}</fieldset><button class="primary">提交新版本</button></form>`:''}${task.allowedActions.includes('review')&&latest?`<form data-form="review" class="panel"><h2>验收交付 v${latest.revision}</h2>${field('验收意见或修改要求','comment','',true)}<div class="actions"><button class="primary" name="decision" value="accepted">接受这版交付</button><button name="decision" value="changes_requested">提出修改</button></div></form>`:''}<p class="fine">AI 未接通；所有操作以服务响应为准。</p></section>`, '任务详情');
  const hooks = {api,signal,memberId:session!.member.id,members,name,schedule,form,action,mutate,reload:load,
    clear:(prefix?:string)=>{for(const key of drafts.keys())if(key.startsWith(route()+':'+(prefix??'')) && prefix!=='')drafts.delete(key);return [...drafts.keys()].some(key=>key.startsWith(route()+':')&&/:(change-|block-|impact-|withdraw-|cancel-|revoke-)/.test(key));},
    withdrawn:()=>{controller?.abort();content(`<section class="state-panel"><h1>已退出当前承诺</h1><p>历史交付保留，候选人需另行接受；旧资料已清除。</p>${link('/lab','返回实验室任务','button')}</section>`,'退出完成');activeSnapshot=undefined;},
    discard:()=>{command.discard();retryCommand=undefined;}};
  document.querySelector('.detail')!.insertAdjacentHTML('beforeend',coordination.render(value,hooks));
  coordination.bind(value,hooks);
  let eventCursor: string|undefined;
  const showEvents=async()=>{const response=await api.read('events',{id},{...snapshotQuery(),limit:20,...(eventCursor?{cursor:eventCursor}:{})},signal);if(signal.aborted)return;document.querySelector('#task-events')!.innerHTML=response.data.map(event=>`<p>${e(event.timestamp)} · v${event.resourceVersion} · ${e(event.summary)}</p>`).join('')+(response.nextCursor?button('events-next','下一页事件'):'<p>本页为末页。</p>');action('events-next',()=>{eventCursor=response.nextCursor??undefined;return showEvents();});};
  await showEvents();
  action('refresh',refresh);action('start',()=>mutate(new Intent('start',{expectedVersion:task.version},{id}),async()=>load()));
  form('invite',async data=>mutate(new Intent('invite',{expectedVersion:task.version,memberId:String(data.get('memberId')),scope:String(data.get('scope')),schedule:task.schedule},{id}),async()=>load()));
  form('submit',async data=>mutate(new Intent('submit',{expectedVersion:task.version,summary:String(data.get('summary')),artifactRefs:[...data.entries()].filter(([k,v])=>k.startsWith('artifact-')&&v).map(([,v])=>String(v)),sources:data.get('source')?[{kind:'note',label:'提交者提供的依据',locator:String(data.get('source'))}]:[]},{id}),async()=>{drafts.delete(route()+':summary');drafts.delete(route()+':source');await load();}));
  form('review',async(data,submitter)=>mutate(new Intent('review',{expectedVersion:latest!.version,expectedTaskVersion:task.version,revision:latest!.revision,decision:(submitter as HTMLButtonElement).value as 'accepted'|'changes_requested',comment:String(data.get('comment'))},{id:latest!.id}),async()=>{drafts.delete(route()+':comment');await load();}));
}

function availabilityEditor() {
  const latest=session!.member;
  if(!availabilityBase || !availabilityDirty) availabilityBase=structuredClone(latest);
  const base=availabilityBase;
  const value=base.availability;
  const changed=latest.version!==base.version;
  content(`<section class="flow narrow">${link('/lab','← 实验室任务','back')}<h1>我的可用时间</h1>${readStamp()}<p class="intro">本人主动公开给实验室的粗粒度信息，不改变任何任务承诺。</p><p class="fine">当前服务记录：${e(availabilityText(latest))}</p>${changed?`<section class="panel" role="status"><h2>服务端已有成员版本 ${latest.version}</h2><p>你的输入仍基于版本 ${base.version}；请比较上方最新记录，不会自动覆盖。</p><div class="actions">${button('availability-adopt','采用最新可用时间')}${button('availability-rebase','保留我的输入并重新确认')}</div></section>`:''}<form data-form="availability" class="panel"><p class="fine">编辑基于成员版本 ${base.version}</p><div class="form-grid"><label>开始日期<input type="date" name="from" required value="${e(value?.from??'')}"></label><label>结束日期<input type="date" name="to" required value="${e(value?.to??'')}"></label></div>${field('日期时区','timezone',value?.timezone??Intl.DateTimeFormat().resolvedOptions().timeZone,false,100)}<label>区间内可用情况<select name="level"><option value="available" ${value?.level==='available'?'selected':''}>可承接</option><option value="limited" ${value?.level==='limited'?'selected':''}>有限可用</option><option value="unavailable" ${value?.level==='unavailable'?'selected':''}>暂不可用</option></select></label><label>区间内自报小时（未知留空，0 表示零小时）<input type="number" name="hours" min="0" max="168" step="0.5" value="${value?.hours??''}"></label><div class="actions"><button class="primary" type="submit">保存我的可用时间</button>${button('availability-clear','清空我的自报信息')}${button('refresh','读取最新状态')}</div></form><p class="fine">过期会显示待更新。人数、任务数和自报小时都不自动换算为工作负荷或绩效。</p></section>`,'我的可用时间');
  const saved=async()=>{for(const key of drafts.keys())if(key.startsWith('/availability:'))drafts.delete(key);availabilityDirty=false;availabilityBase=undefined;await load();document.querySelector('#feedback')!.innerHTML='<p role="status">可用时间已保存，已重新读取服务状态。</p>';};
  form('availability',async data=>{
    availabilityDirty=true;
    const hours=String(data.get('hours')??'');
    await mutate(new Intent('availability',{expectedVersion:base.version,availability:{from:String(data.get('from')),to:String(data.get('to')),timezone:String(data.get('timezone')),level:String(data.get('level')) as 'available'|'limited'|'unavailable',hours:hours===''?null:Number(hours),updatedAt:new Date().toISOString()}},{}),saved);
  });
  document.querySelector('[data-form=availability]')!.addEventListener('input',()=>{availabilityDirty=true;});
  document.querySelector('[data-form=availability]')!.addEventListener('change',()=>{availabilityDirty=true;});
  action('refresh',refresh);
  action('availability-clear',()=>mutate(new Intent('availability',{expectedVersion:base.version,availability:null},{}),saved));
  action('availability-adopt',()=>{for(const key of drafts.keys())if(key.startsWith('/availability:'))drafts.delete(key);availabilityDirty=false;availabilityBase=undefined;command.discard();retryCommand=undefined;availabilityEditor();});
  action('availability-rebase',()=>{availabilityBase=structuredClone(latest);availabilityDirty=true;command.discard();retryCommand=undefined;availabilityEditor();});
}

async function load() {
  controller?.abort();controller=new AbortController();const signal=controller.signal;const path=route();activeSnapshot=undefined;shell();
  try {
    if(path==='/login'){login();return;}
    const auth=await api.read('session',{}, {},signal);session=auth.data;api.csrfToken=session.csrfToken;
    // A 401 hides private content but keeps the whole context for same-owner retry.
    // Explicit logout and authentication as another member discard it together.
    if(draftOwner && draftOwner!==session.member.id) clearOwnedContext();
    draftOwner=session.member.id;
    const wanted=nextReadSnapshot;nextReadSnapshot=undefined;
    const me=await api.read('me',{},wanted?{snapshot:wanted}:{},signal);
    if(signal.aborted)return;
    if(!me.snapshot)throw new ApiError('INVALID_RESPONSE','服务没有返回读取快照，未组合页面数据。');
    activeSnapshot=me.snapshot;viewReadAt=Date.now();session.member=me.data;
    members=[];let cursor: string|undefined;
    do {const response=await api.read('members',{id:session.member.labId},{...snapshotQuery(),limit:100,...(cursor?{cursor}:{})},signal);if(signal.aborted)return;members.push(...response.data);cursor=response.nextCursor??undefined;}while(cursor);
    if(signal.aborted)return;shell();
    if(path==='/')await dailyEntry(signal);
    else if(path==='/lab')await taskList(signal);
    else if(path==='/plans'||path.startsWith('/plans?'))await planList(signal);
    else if(path==='/actions')await actionList(signal);
    else if(path==='/availability')availabilityEditor();
    else if(path.startsWith('/tasks/'))await taskDetail(path.slice(7),signal);
    else if(path.startsWith('/plans/')){
      if(path==='/plans/new'){
        if(!editor || editorRoute!==path){resetEditor();editor={labId:session.member.labId,goal:'',proposedItems:[],unresolvedQuestions:[]};editorRoute=path;addItem();}
      }else{
        const response=await api.read('getPlan',{id:path.slice(7)},snapshotQuery(),signal);
        if(editor&&editorRoute===path&&dirty&&currentPlan){refreshedPlan=response.data;}
        else {currentPlan=response.data;refreshedPlan=undefined;editor={labId:response.data.labId,goal:response.data.goal,proposedItems:structuredClone(response.data.proposedItems),unresolvedQuestions:[...response.data.unresolvedQuestions]};editorRoute=path;dirty=false;}
      }
      planEditor();
    } else content(`<section class="state-panel"><h1>页面不存在</h1>${link('/','回到入口')}</section>`,'页面不存在');
  }catch(error){
    if(signal.aborted)return;
    if(error instanceof ApiError&&error.code==='UNAUTHENTICATED'){session=undefined;api.csrfToken='';members=[];shell();login();feedback(error);}
    else {members=[];activeSnapshot=undefined;content('<section class="state-panel"><h1>暂时无法读取</h1><p>旧的受限内容已清除，没有使用演示数据替代服务响应。尚未提交的输入仍保留。</p></section>','读取失败');feedback(error);}
  }
}
window.addEventListener('hashchange',()=>{pageCursor=undefined;planCursor=undefined;actionCursor=undefined;void load();});
window.addEventListener('offline',()=>{
  if(!session)return;
  controller?.abort();members=[];activeSnapshot=undefined;resetPages();
  content('<section class="state-panel"><h1>连接已断开</h1><p>旧的受限内容已清除；输入与未决请求保留。恢复连接后请重新读取。</p></section>','连接断开');
  feedback(new ApiError('NETWORK_ERROR','尚未与服务同步，请恢复连接后重试。'));
});
setInterval(()=>{
  if(activeSnapshot && Date.now()>=Date.parse(activeSnapshot.expiresAt)){
    controller?.abort();activeSnapshot=undefined;members=[];resetPages();
    content('<section class="state-panel"><h1>读取快照已过期</h1><p>旧内容已清除。输入仍保留，请重新读取服务状态。</p></section>','需要刷新');
    feedback(new ApiError('CURSOR_EXPIRED','读取快照已过期。'));
  }
},10000);
// Validate read-only views without interrupting plan/availability editing or replaying commands.
setInterval(async()=>{
  const path=route(), snapshot=activeSnapshot, readController=controller;
  if(!snapshot||!readController||busy||checkingSnapshot||document.hidden||Date.now()-viewReadAt<15000||!(['/','/lab','/plans','/plans?status=confirmed','/actions'].includes(path)||path.startsWith('/tasks/')))return;
  checkingSnapshot=true;
  try {await api.read('me',{}, {snapshot:snapshot.token},readController.signal);}
  catch(error){
    if(readController.signal.aborted||busy||activeSnapshot?.token!==snapshot.token)return;
    readController.abort();activeSnapshot=undefined;members=[];resetPages();
    content('<section class="state-panel"><h1>需要重新同步</h1><p>读取失败或数据、权限已变化。旧受限内容已清除，未提交输入仍保留。</p></section>','需要刷新');
    feedback(error);
  }finally{checkingSnapshot=false;}
},15000);
void load();
