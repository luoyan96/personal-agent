import { Alert, Button, Space } from "antd";
import { useState } from "react";
import type { ChatAction } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";

const labels = { create_group: "创建协作群", invite_contact: "邀请成员", invite_task: "发出任务邀请", run_task: "运行科研 AI" };
export function ResearchActionCard({ action }: {action:ChatAction}) {
  const contacts = useResearchStore(s=>s.contacts);
  const p = action.payload;
  const name=(id:string)=>contacts.find(c=>c.contact.id===id)?.contact.displayName||id;
  const detail=useResearchRead(()=>researchApi("chatConversation",{params:{id:action.conversationId}}),action.conversationId);
  const plan=useResearchRead(()=>researchApi("getPlan",{params:{id:p.kind==='create_group'?p.plan.id:''}}),p.kind==='create_group'?p.plan.id:'',p.kind==='create_group');
  const [busy,setBusy]=useState(false),[failure,setFailure]=useState('');
  const [current,setCurrent]=useState(action);
  const decide=async(decision:'confirm'|'dismiss')=>{
    if(!detail.data)return;setBusy(true);setFailure('');
    try{const result=await researchApi('decideChatAction',{params:{id:action.id},body:{expectedVersion:action.version,expectedConversationVersion:detail.data.data.version,decision}});setCurrent(result.data.action);await detail.refresh();await researchApi('imSyncConversation',{params:{id:result.data.conversationId},body:{}});await useResearchStore.getState().refresh();}
    catch(err){setFailure(err instanceof Error?err.message:'操作失败');await detail.refresh();}finally{setBusy(false);}
  };
  return <article className="border rounded bg-white p-3 my-2 min-w-0" aria-label={labels[p.kind]}><strong>{labels[p.kind]}</strong><p className="text-xs text-slate-600">{current.status==='proposed'?'等待明确确认':current.status==='applied'?'已应用':current.status==='stale'?'已失效':'已忽略'} · 版本 {action.version}</p>
    {p.kind==='create_group'?<><p>群名：{p.title}</p><p>邀请：{p.contactIds.map(name).join('、')}；每个真人及私人 AI 邀请独立同意。</p><p className="whitespace-pre-wrap">分享文字：{p.sharedContext.selectedText||'不分享文字'}</p><p>材料范围：{p.sharedContext.artifactRefs.map(ref=>`${ref.id} / 版本 ${ref.version}`).join('、')||'无'}</p><p>安排：{p.plan.id} / 版本 {p.plan.version}</p>{plan.data?.data.proposedItems.map(item=><details key={item.id}><summary>{item.title}</summary><p>目标：{item.goal}</p><p>交付：{item.deliverable}</p><p>验收：{item.acceptanceCriteria}</p><pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify({allocation:item.allocation,dependencies:item.dependencies,schedule:item.schedule,inputArtifactIds:item.inputArtifactIds,budget:item.budget},null,2)}</pre></details>)}</>:p.kind==='invite_contact'?<p>邀请 {name(p.contactId)}；同意之前不会加入群，Agent 主人不会因此加入。</p>:p.kind==='invite_task'?<><p>向 {name(p.contactId)} 发出任务 {p.task.id} / 版本 {p.task.version} 的邀请</p><p className="whitespace-pre-wrap">承接范围：{p.scope}</p><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(p.schedule,null,2)}</pre><p>邀请须对方接受，不等于已承接。</p></>:<><p>Agent：{name(p.contactId)} · 任务 {p.task.id} / 版本 {p.task.version}</p><p>公开能力：{p.capability.id} / 版本 {p.capability.version}</p><p>预算上限：{p.budget.maxTokens} tokens / {p.budget.maxSeconds} 秒</p><p>输入材料：{p.inputArtifactRefs.map(ref=>`${ref.id} / 版本 ${ref.version}`).join('、')||'无'}</p><p>产生候选后仍需人工提交和验收。</p></>}
    {(failure||detail.error||plan.error)&&<Alert type="error" message={failure||detail.error||plan.error}/>}
    {current.status==='proposed'&&<Space>{action.allowedDecisions.map(decision=><Button key={decision} type={decision==='confirm'?'primary':'default'} loading={busy} disabled={!detail.data || (decision==='confirm'&&p.kind==='create_group'&&(!plan.data||plan.data.data.version!==p.plan.version))} onClick={()=>void decide(decision)}>{decision==='confirm'?'确认'+labels[p.kind]:'忽略建议'}</Button>)}</Space>}
  </article>;
}
