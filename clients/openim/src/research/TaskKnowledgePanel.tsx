import { Alert, Button, Checkbox, Input, Select } from 'antd';
import { useState } from 'react';
import type { WorkRule } from '@research-agent-platform/contracts';
import type { DshTaskState, TaskTarget } from '../../../../integrations/deepseek-harness/desktop/task-workspace';
import type { HandoffInput } from '../../../../integrations/deepseek-harness/desktop/work-memory';
import { researchApi } from './api';
import { useResearchRead } from './useResearchRead';
import { usePersonalOperation } from './usePersonalOperation';
import { PersonalMemoryPanel } from './PersonalMemoryPanel';

const emptyHandoff:HandoffInput={conclusion:'',evidence:'',next:'',blockers:''};
const scopeLabel={lab:'课题组',project:'项目'};
const statusLabel={active:'已生效',candidate:'待负责人确认',revoked:'已撤回'};

export function TaskKnowledgePanel({target,state,canWork,busy,command}:{target:TaskTarget;state?:DshTaskState;canWork:boolean;busy:boolean;command:(action:()=>Promise<unknown>)=>Promise<void>}) {
 const bridge=window.electronAPI?.localDsh;
 const operation=usePersonalOperation(true,`task-knowledge:${target.kind}:${target.taskId}`);
 const knowledge=useResearchRead(()=>bridge!.taskKnowledge(target),`knowledge:${target.kind}:${target.taskId}`,!!bridge);
 const [edit,setEdit]=useState<WorkRule|null>(),[title,setTitle]=useState(''),[content,setContent]=useState('');
 const [scope,setScope]=useState<'lab'|'project'>('project'),[recordKind,setRecordKind]=useState<'rule'|'memory'>('rule');
 const [history,setHistory]=useState<WorkRule[]>(),[query,setQuery]=useState(''),[personal,setPersonal]=useState(false);
 const [handoff,setHandoff]=useState<HandoffInput>(),[baseVersion,setBaseVersion]=useState(0),[preview,setPreview]=useState('');
 const policy=knowledge.data?.policy, b=state?.binding, latest=b?.handoffs?.at(-1);
 const params={kind:target.kind,id:target.taskId};
 const begin=(r:WorkRule|null)=>{setEdit(r);setTitle(r?.title||'');setContent(r?.content||'');setScope(r?.scope||'project');setRecordKind(r?.kind||'rule');};
 const mutate=async(r:WorkRule|null,action:'save'|'confirm'|'revoke')=>command(async()=>{
  const capture=operation.capture();
  await researchApi('saveWorkRule',{params,body:{scope:r?.scope||scope,kind:r?.kind||recordKind,title:action==='save'?title:r!.title,content:action==='save'?content:r!.content,recordId:r?.id||null,expectedVersion:r?.version||0,action}});
  if(capture.isCurrent()){setEdit(undefined);await knowledge.refresh();}
 });
 const preferences=b?.preferences||{personalMemory:false,skills:[]};
 const matches=(value:string)=>!query||value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
 const records=policy?.records.filter(r=>matches(r.title+' '+r.content))||[];
 return <section className="task-knowledge" aria-label="规则与记忆">
  <p>规则决定怎样工作，交接记录做到哪里。这里的摘要与索引不替代任务验收、原始资料或工具权限。</p>
  {knowledge.error&&<Alert type="error" message="规则与记忆暂不可用" description={knowledge.error} action={<Button onClick={()=>void knowledge.refresh()}>重试读取</Button>}/>}
  {!policy&&!knowledge.error&&<p>正在读取当前授权范围…</p>}
  {policy&&<>
   <details><summary>平台基本规则 · v{policy.platform.version} · 产品维护者发布</summary><p>{policy.platform.content}</p></details>
   <Input aria-label="搜索工作索引" placeholder="搜索规则、记忆、交接、资料名称或会话" value={query} onChange={e=>setQuery(e.target.value)}/>
   <div className="task-knowledge-heading"><h3>课题组规则与项目约定</h3>{policy.scopes.length>0&&<Button disabled={busy} onClick={()=>begin(null)}>新增规则或记忆</Button>}</div>
   <p>负责人保存后生效；其他成员保存为候选。项目记忆仅对有权访问来源任务的成员可见。</p>
   {!policy.scopes.length&&<p>此为个人任务，不继承课题组及项目规则。本次要求在执行输入框填写，不会自动保存为长期规则。</p>}
   {records.map(r=><article key={r.id} className="task-knowledge-record">
    <strong>{scopeLabel[r.scope]} · {r.kind==='rule'?'规则':'记忆'} · {r.title}</strong>
    <small>{statusLabel[r.status]} · v{r.version} · {r.authorName} · {new Date(r.updatedAt).toLocaleString()}</small>
    <p>{r.content}</p>
    {r.kind==='memory'&&r.sourceTaskId&&<a href={`#/workbench?task=${encodeURIComponent(r.sourceTaskId)}`}>查看来源任务</a>}
    <div className="task-knowledge-actions">
     {r.allowedActions.includes('revise')&&<Button disabled={busy} onClick={()=>begin(r)}>修改</Button>}
     {r.status==='candidate'&&r.allowedActions.includes('confirm')&&<Button disabled={busy} onClick={()=>void mutate(r,'confirm')}>确认生效</Button>}
     {r.allowedActions.includes('revoke')&&<Button disabled={busy} onClick={()=>void mutate(r,'revoke')}>撤回</Button>}
     <Button disabled={busy} onClick={()=>void command(async()=>{const capture=operation.capture();const response=await researchApi('workRuleHistory',{params:{...params,recordId:r.id}});if(capture.isCurrent())setHistory(response.data);})}>版本记录</Button>
    </div>
   </article>)}
   {edit!==undefined&&<div className="task-knowledge-editor" aria-label="编辑规则或记忆">
    <Select aria-label="规则范围" disabled={!!edit} value={scope} onChange={setScope} options={policy.scopes.map(s=>({value:s.scope,label:`${scopeLabel[s.scope]} · ${s.canPublish?'可发布':'提交候选'}`}))}/>
    <Select aria-label="记录类型" disabled={!!edit} value={recordKind} onChange={setRecordKind} options={[{value:'rule',label:'工作规则'},{value:'memory',label:'项目记忆（附来源任务）',disabled:scope==='lab'}]}/>
    <Input aria-label="规则标题" maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} placeholder="标题"/>
    <Input.TextArea aria-label="规则正文" rows={4} maxLength={2000} value={content} onChange={e=>setContent(e.target.value)} placeholder="简短说明约定，项目记忆请写明证据和待核实事项"/>
    <div><Button disabled={busy||!title.trim()||!content.trim()||(scope==='lab'&&recordKind==='memory')} onClick={()=>void mutate(edit,'save')}>保存{policy.scopes.find(s=>s.scope===scope)?.canPublish?'并生效':'为候选'}</Button><Button onClick={()=>setEdit(undefined)}>取消</Button></div>
   </div>}
   {history&&<details open><summary>版本记录</summary>{history.map(r=><article key={r.version}><strong>v{r.version} · {r.authorName} · {statusLabel[r.status]}</strong><p>{r.title}：{r.content}</p></article>)}<Button onClick={()=>setHistory(undefined)}>收起</Button></details>}
   <h3>个人偏好与按需方法</h3>
   <p>{policy.privateMemoryAllowed?'只读取本人已确认记忆；候选和已撤回记录不进入执行。':'共享任务不载入个人记忆；不会把个人偏好作为团队共识。'}</p>
   <Checkbox disabled={busy||!b||!canWork||!policy.privateMemoryAllowed} checked={preferences.personalMemory&&policy.privateMemoryAllowed} onChange={e=>void command(()=>bridge!.taskPreferences(target,{...preferences,personalMemory:e.target.checked}))}>在此个人任务使用已确认记忆</Checkbox>
   <Button onClick={()=>setPersonal(!personal)}>管理我的记忆</Button>
   {personal&&<PersonalMemoryPanel active={personal}/>}
   <p>内置 Skill 按本次任务显式选择，最多两个。送入正文不代表已执行；实际工具操作见“执行”记录。外部插件继续在独立 DSH 管理。</p>
   <Select aria-label="本任务使用的 Skill" mode="multiple" style={{width:'100%'}} disabled={busy||!b||!canWork} value={preferences.skills} onChange={skills=>void command(()=>bridge!.taskPreferences(target,{...preferences,skills}))} options={knowledge.data!.skills.map(s=>({value:s.name,label:s.name,title:s.description}))}/>
  </>}
  {b&&<>
   <div className="task-knowledge-heading"><h3>任务交接</h3><Button disabled={busy||!canWork||state?.phase==='running'||!!b.pending} onClick={()=>{setBaseVersion(latest?.version||0);setHandoff(latest?{conclusion:latest.conclusion,evidence:latest.evidence,next:latest.next,blockers:latest.blockers}:{...emptyHandoff,next:b.note});}}>核对并保存交接</Button></div>
   <p>本机按账号保存，确认后才能带入下一会话；不会自动发布为团队共识。每版保留原会话、记录位置及文件校验。工具产生的文件不等于任务已验收。</p>
   {latest&&matches(JSON.stringify(latest))&&<article><strong>当前交接 v{latest.version}</strong><p>结论：{latest.conclusion}</p><p>证据：{latest.evidence}</p><p>下一步：{latest.next}</p><p>阻碍：{latest.blockers||'未记录'}</p><small>来源会话 {latest.sessionId} · 记录位置 {latest.throughSeq}</small></article>}
   {handoff&&<div className="task-knowledge-editor">{(['conclusion','evidence','next','blockers'] as const).map((field,i)=><label key={field}>{['结论','证据与待核实事项','下一步','阻碍'][i]}<Input.TextArea rows={2} value={handoff[field]} onChange={e=>setHandoff({...handoff,[field]:e.target.value})}/></label>)}<Button disabled={busy} onClick={()=>void command(async()=>{const capture=operation.capture();await bridge!.taskCheckpoint(target,handoff,baseVersion);if(capture.isCurrent())setHandoff(undefined);})}>确认保存交接</Button><Button onClick={()=>setHandoff(undefined)}>取消</Button></div>}
   <details><summary>交接历史（{b.handoffs?.length||0}）</summary>{b.handoffs?.map(h=><article key={h.version}><strong>v{h.version} · {h.createdAt}</strong><p>{h.conclusion}</p><p>证据：{h.evidence} · 下一步：{h.next} · 阻碍：{h.blockers}</p></article>)}</details>
   <Button disabled={busy||!canWork||!!b.pending||state?.phase==='running'} onClick={()=>void command(()=>bridge!.taskNewSession(target))}>保留历史，换一个执行会话</Button>
   {b.pending&&<Alert type="warning" message="原请求尚待核对" description="请先在执行页查看结果。确认不再重试后，可保留原会话并放弃此请求；已经执行的工具操作不会被撤销。" action={<Button disabled={busy||!canWork||state?.phase==='running'} onClick={()=>void command(()=>bridge!.taskAbandonPending(target))}>已核对，放弃原请求</Button>}/>}
   <h3>工作索引</h3>
   <p>仅列出此任务的本机工作记录。资料权限在执行、读取与交付时重新核对；索引不会授予额外访问权。</p>
   {b.sources.filter(s=>matches(s.filename)).map(s=><p key={s.id+':'+s.version}>资料 · {s.filename} · v{s.version} · {s.localName}</p>)}
   {state?.files.filter(f=>matches(f.name)).map(f=><div key={f.name}><span>文件 · {f.name} · {f.size} 字节 </span><Button disabled={busy} onClick={()=>void command(async()=>{const capture=operation.capture();const result=await bridge!.taskOutput(target,f.name);if(capture.isCurrent())setPreview(result.preview||'此类型请在本机文件夹查看。');})}>预览</Button></div>)}
   {preview&&<details open><summary>文件预览</summary><pre>{preview}</pre><Button onClick={()=>setPreview('')}>关闭</Button></details>}
   <details><summary>执行会话（{1+(b.sessionHistory?.length||0)}）</summary><p>当前：{b.sessionTitle} · {b.sessionId}</p>{b.sessionHistory?.filter(s=>matches(s.title)).map(s=><p key={s.sessionId}>{s.title} · {s.at} · {s.sessionId}</p>)}<a href="#/dsh">到 DSH 按名称查看完整历史</a></details>
   <details><summary>最近一轮上下文依据</summary>{b.contextReceipt?<>
    <p>AcceptCat 本轮发送 {b.contextReceipt.bytes.toLocaleString()} 字节，粗估 {b.contextReceipt.estimatedTokens.toLocaleString()} tokens；这不是 DSH 全部系统提示、工具定义、历史或实际计费量。</p>
    {b.contextReceipt.entries.map((e,i)=><p key={i}>{e.kind} · {e.title} · v{e.version}</p>)}
    {!!b.contextReceipt.omitted.length&&<p>未载入：{b.contextReceipt.omitted.join('；')}</p>}
   </>:<p>尚无本轮上下文回执。</p>}</details>
  </>}
 </section>;
}
