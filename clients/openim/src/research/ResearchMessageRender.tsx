import { Alert, Tag } from "antd";
import { OpenImResearchPointer } from "@research-agent-platform/contracts";
import { IMessageItemProps } from "@/pages/chat/queryChat/MessageItem";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { ResearchActionCard } from "./ResearchActionCard";

export default function ResearchMessageRender({message}:IMessageItemProps) {
  let parsed:ReturnType<typeof OpenImResearchPointer.safeParse>;
  try{parsed=OpenImResearchPointer.safeParse(JSON.parse(message.customElem?.data||'{}'));}catch{parsed=OpenImResearchPointer.safeParse(null);}
  const pointer=parsed.success?parsed.data:null;
  const read=useResearchRead(async()=>{
    if(!pointer)throw new Error('该自定义消息不是可读取的科研回执');
    const [messages,actions]=await Promise.all([researchApi('chatMessages',{params:{id:pointer.conversationId},query:{afterSequence:pointer.sequence-1,limit:1}}),researchApi('chatActions',{params:{id:pointer.conversationId},query:{limit:100}})]);
    const fact=messages.data.find(m=>m.id===pointer.messageId&&m.sequence===pointer.sequence);
    if(!fact)throw new Error('当前权限下无法读取这条科研消息');
    return {fact,actions:actions.data.filter(a=>fact.actionIds.includes(a.id))};
  },pointer?`${pointer.conversationId}:${pointer.messageId}`:message.clientMsgID);
  const turn=useResearchRead(()=>researchApi('chatTurn',{params:{id:read.data?.fact.turnId||''}}),read.data?.fact.turnId||'',!!read.data?.fact.turnId);
  return <div className="max-w-[620px] rounded border bg-white p-3 text-sm">
    <Tag color="blue">科研回执 · 当前授权</Tag>
    {read.error&&<Alert type="warning" message="科研消息当前不可读取" description={read.error}/>}
    {!read.data&&!read.error&&<p>正在核对权限…</p>}
    {read.data&&<><p className="whitespace-pre-wrap break-words">{read.data.fact.text}</p>{read.data.fact.resources.map(resource=><p key={`${resource.kind}:${resource.ref.id}`} className="text-xs text-slate-600">{resource.kind} · {resource.ref.id} / 版本 {resource.ref.version}</p>)}{read.data.actions.map(action=><ResearchActionCard key={action.id+':'+action.version+':'+action.status} action={action}/>)}</>}
    {turn.data&&<p className="text-xs text-slate-600">AI 请求状态：{turn.data.data.status}{turn.data.data.failure?` · ${turn.data.data.failure}`:''}</p>}
  </div>;
}
