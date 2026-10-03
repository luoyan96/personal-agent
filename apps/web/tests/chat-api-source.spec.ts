import {describe,it,expect,vi} from 'vitest';
import {routes,contractVersion,Contact,Conversation,ChatMessage,ChatAction} from '@research-agent-platform/contracts';
import type {RouteName,RequestFor} from '@research-agent-platform/contracts';
import {endpointExamples,fixtures} from '@research-agent-platform/contracts/fixtures';
import {ApiClient} from '../src/api';
import {ChatApiSource,chatBudget,actionDetail,contactProjection} from '../src/chat-api-source';
const at='2026-10-04T00:00:00Z';
const human=Contact.parse({id:'contact_human',labId:'lab_test',displayName:'合成成员',identity:{kind:'human',memberId:'owner_test'},availability:{status:'available',reason:null},version:1});
const own=Contact.parse({...human,id:'contact_own_agent',displayName:'自己的助理',identity:{kind:'personal_agent',ownerMemberId:'owner_test'},availability:{status:'unavailable',reason:'missing_credentials'}});
const other=Contact.parse({...own,id:'contact_other_agent',displayName:'其他成员助理',identity:{kind:'personal_agent',ownerMemberId:'other_owner'},availability:{status:'unavailable',reason:'owner_authorization_required'}});
const member=(contactId:string,status='joined')=>({contactId,role:'member',status,version:1});
const personal=Conversation.parse({id:'personal_test',labId:'lab_test',kind:'personal',title:'自己的助理',ownerMemberId:'owner_test',version:1,members:[member(human.id),member(own.id)],taskIds:[],lastSequence:0,createdAt:at,updatedAt:at,allowedActions:['send']});
const group=Conversation.parse({...personal,id:'group_test',kind:'group',title:'合成群',members:[member(human.id),member(own.id),member(other.id,'invited')],lastSequence:1,allowedActions:['send','invite','manage']});
const message=ChatMessage.parse({id:'message_test',conversationId:group.id,sequence:1,senderContactId:own.id,origin:'model',text:'合成建议',mentions:[],resources:[],actionIds:['action_test'],turnId:null,createdAt:at});
const action=ChatAction.parse({id:'action_test',conversationId:group.id,sourceMessageId:message.id,payload:{kind:'create_group',title:'新任务群',plan:{id:'plan_test',version:1},contactIds:[human.id,other.id],sharedContext:{selectedText:'仅分享这个合成片段',artifactRefs:[{id:'artifact_test',version:2}]}},status:'proposed',version:1,createdAt:at,expiresAt:'2026-12-04T00:00:00Z',allowedDecisions:['confirm','dismiss']});
function harness(){
 const calls:{name:RouteName;body:unknown;headers:HeadersInit|undefined}[]=[],security=vi.fn();
 let failSend=false,otherOwner=false,failEnsure=false,pendingTask=false,fullTaskMode=false,planVersion=1,turnMode=false;
 const summary=routes.task.response.parse(fixtures.invitationSummary.value).data;
 const task={...fixtures.blockedTask.value.data,allowedActions:['upload','run']};
 const artifact={...fixtures.revokedArtifactMetadata.value.data,id:'artifact_test',taskId:task.id,accessStatus:'available'};
 const fullTask={task,assignments:[],deliverables:[],executions:[],artifacts:[artifact]};
 const run={...routes.getRun.response.parse(endpointExamples.getRun!.response).data,id:'run_test',taskId:task.id,status:'succeeded',version:3,candidate:fixtures.groundedChecklist.value.data,allowedActions:['submit_candidate']};
 const turn={...routes.chatTurn.response.parse(endpointExamples.chatTurn!.response).data,id:'turn_test',status:'failed',budget:{maxTokens:1000,maxSeconds:100},remainingBudget:{maxTokens:800,maxSeconds:90},allowedActions:['retry']};
 const client=new ApiClient(vi.fn<typeof fetch>(async(input,init)=>{
  const url=new URL(String(input),'http://test.local'),method=init?.method??'GET';
  const entry=Object.entries(routes).find(([,route])=>route.method===method&&new RegExp('^'+route.path.replace(/\{[^}]+\}/g,'[^/]+')+'$').test(url.pathname));
  if(!entry)throw new Error('unexpected test route '+url.pathname);
  const name=entry[0] as RouteName,body=init?.body?JSON.parse(String(init.body)):null;
  calls.push({name,body,headers:init?.headers});
  if(name==='sendChatMessage'&&failSend)throw new Error('synthetic transport error');
  let response:unknown;
  switch(name){
   case 'session':{const data=routes.session.response.parse(structuredClone(endpointExamples.session!.response)).data;data.member.id=otherOwner?'other_owner':'owner_test';response={data};break;}
   case 'personalConversation':if(failEnsure)return new Response(JSON.stringify({error:{code:'NOT_IMPLEMENTED',message:'未实现',requestId:'req_test'}}),{status:501});response={data:{conversation:personal,agent:own}};break;
   case 'chatContacts':response=url.searchParams.has('cursor')?{data:[other],nextCursor:null}:{data:[human,own],nextCursor:'opaque_page_2'};break;
   case 'chatConversations':response={data:[group,personal],nextCursor:null};break;
   case 'chatConversation':response={data:url.pathname.endsWith(group.id)?{...group,taskIds:fullTaskMode?[task.id]:pendingTask?[summary.id]:[]}:personal};break;
   case 'chatMessages':response={data:url.pathname.includes(group.id)?fullTaskMode?[{...message,resources:[{kind:'task',ref:{id:task.id,version:task.version}},{kind:'run',ref:{id:run.id,version:1}}]}]:pendingTask?[{...message,resources:[{kind:'task',ref:{id:summary.id,version:summary.version}},{kind:'assignment',ref:{id:'invitation_B',version:1}}]}]:turnMode?[{...message,turnId:turn.id}]:[message,message]:[],nextCursor:null};break;
   case 'chatActions':response={data:url.pathname.includes(group.id)?[action]:[],nextCursor:null};break;
   case 'chatInvitations':response={data:[{id:'invitation_test',conversationId:group.id,title:'合成群',invitedContactId:own.id,invitedByMemberId:'other_owner',status:'pending',version:2}],nextCursor:null};break;
   case 'sendChatMessage':response={data:{message:{...message,id:'persisted_send',origin:'human',text:(body as RequestFor<'sendChatMessage'>['body']).text,senderContactId:human.id,actionIds:[]},turn:null}};break;
   case 'decideChatAction':response={data:{action:{...action,status:'applied',version:2},conversationId:group.id,resources:[]}};break;
   case 'decideChatInvitation':response={data:member(own.id)};break;
   case 'createDirectConversation':response={data:personal};break;
   case 'task':response={data:fullTaskMode?fullTask:summary};break;
   case 'getPlan':response={data:{...fixtures.invitationPlan.value.data,id:'plan_test',version:planVersion}};break;
   case 'getRun':response={data:run};break;
   case 'chatTurn':response={data:turn};break;
   default:response=endpointExamples[name]!.response;
  }
  routes[name].response.parse(response);
  return new Response(JSON.stringify(response),{status:routes[name].status,headers:{'Content-Type':'application/json','X-Contract-Version':contractVersion}});
 }));client.csrfToken='test-csrf';
 return {source:new ChatApiSource(client,'owner_test',[{id:'owner_test',displayName:'合成主人'}],security),calls,security,failSend:(value:boolean)=>{failSend=value;},otherOwner:()=>{otherOwner=true;},failEnsure:()=>{failEnsure=true;},pendingTask:()=>{pendingTask=true;},fullTask:()=>{fullTaskMode=true;},stalePlan:()=>{planVersion=2;},turn:()=>{turnMode=true;}};
}
describe('frozen CHAT1 API wiring (synthetic transport)',()=>{
 it('ensures real default conversation, consumes opaque paging and deduplicates messages',async()=>{
  const h=harness(),snapshot=await h.source.read(new AbortController().signal);
  expect(snapshot.contacts).toHaveLength(3);expect(snapshot.conversations.find(c=>c.pinned)?.id).toBe(personal.id);
  const view=snapshot.conversations.find(c=>c.id===group.id)!;expect(view.messages).toHaveLength(1);
  expect(view.sendTargets).toEqual([{id:own.id,label:own.displayName}]);expect(view.members.find(c=>c.id===other.id)?.canMention).toBe(false);
  expect(snapshot.contacts.find(c=>c.id===other.id)?.availability).toContain('需主人授权');
  expect(snapshot.invitations?.[0]?.detail).toContain('加入群不代表接受任务');
  await h.source.read(new AbortController().signal);expect(h.calls.filter(c=>c.name==='personalConversation')).toHaveLength(1);
 });
 it('defaults personal send to bounded ask_agent but group chat never dispatches from @ alone',async()=>{
  const h=harness(),signal=new AbortController().signal;await h.source.read(signal);
  await h.source.send(personal.id,'需求',[],signal);
  expect(h.calls.at(-1)?.body).toMatchObject({intent:'ask_agent',agentContactId:own.id,budget:chatBudget});
  await h.source.send(group.id,'@合成成员 任务',[{contactId:human.id,name:human.displayName,start:0,end:5}],signal);
  expect(h.calls.at(-1)?.body).toMatchObject({intent:'chat',agentContactId:null,budget:null,mentions:[{contactId:human.id,start:0,end:5}]});
  await h.source.send(group.id,'请安排',[],signal,own.id);expect(h.calls.at(-1)?.body).toMatchObject({intent:'ask_agent',agentContactId:own.id});
  await expect(h.source.send(group.id,'不能直接问未加入AI',[],signal,other.id)).rejects.toMatchObject({code:'VALIDATION_ERROR'});
 });
 it('retains the exact command key after ambiguous failure and rejects changed payload until explicitly discarded',async()=>{
  const h=harness(),signal=new AbortController().signal;await h.source.read(signal);h.failSend(true);
  await expect(h.source.send(personal.id,'同一需求',[],signal)).rejects.toMatchObject({code:'NETWORK_ERROR'});
  await expect(h.source.send(personal.id,'不同需求',[],signal)).rejects.toMatchObject({code:'PENDING_INTENT'});
  h.failSend(false);await h.source.send(personal.id,'同一需求',[],signal);
  const sends=h.calls.filter(c=>c.name==='sendChatMessage');expect(sends).toHaveLength(2);expect(sends[0]?.headers).toEqual(sends[1]?.headers);
 });
 it('shows complete share payload and confirms service versions; group invitation is an independent command',async()=>{
  const h=harness(),signal=new AbortController().signal,snapshot=await h.source.read(signal);
  const detail=snapshot.conversations.find(c=>c.id===group.id)!.messages[0]!.cards![0]!.detail;
  expect(detail).toContain('仅分享这个合成片段');expect(detail).toContain('artifact_test · v2');expect(detail).toContain(other.id);
  expect(await h.source.act(group.id,message.id,'decision:confirm:'+action.id,signal)).toBe(group.id);
  expect(h.calls.at(-1)).toMatchObject({name:'decideChatAction',body:{expectedVersion:1,expectedConversationVersion:1,decision:'confirm'}});
  await h.source.act(group.id,'invitation:invitation_test','invitation:accept:invitation_test',signal);
  expect(h.calls.at(-1)).toMatchObject({name:'decideChatInvitation',body:{expectedVersion:2,decision:'accept'}});
 });
 it('does not substitute fixtures for 501 and clears private source on identity change',async()=>{
  const h=harness(),signal=new AbortController().signal;h.failEnsure();await expect(h.source.read(signal)).rejects.toMatchObject({code:'NOT_IMPLEMENTED'});
  const otherHarness=harness();await otherHarness.source.read(signal);otherHarness.otherOwner();
  await expect(otherHarness.source.read(signal)).rejects.toMatchObject({code:'UNAUTHENTICATED'});expect(otherHarness.security).toHaveBeenCalledOnce();
 });
 it('renders other owner personal-agent ownership and task execution budget without implying online status',()=>{
  expect(contactProjection(other,[human,own,other],[]).owner).toContain('other_owner');
  const run=ChatAction.parse({...action,payload:{kind:'run_task',contactId:own.id,task:{id:'task_test',version:4},capability:{id:'capability_test',version:2,visibility:'lab_public'},budget:chatBudget,inputArtifactRefs:[]}});
  expect(actionDetail(run,[human,own])).toContain('12000 tokens / 120 秒');
 });
 it('excludes pending-invite task summary from AI context and accepts task inline independently of group join',async()=>{
  const h=harness(),signal=new AbortController().signal;h.pendingTask();const snapshot=await h.source.read(signal);
  const cards=snapshot.conversations.find(c=>c.id===group.id)!.messages[0]!.cards!;
  expect(cards.some(c=>c.actions?.some(a=>a.id==='taskinvitation:accepted:invitation_B'))).toBe(true);
  await h.source.send(group.id,'协作安排',[],signal,own.id);expect(h.calls.at(-1)?.body).toMatchObject({context:[]});
  await h.source.act(group.id,message.id,'taskinvitation:accepted:invitation_B',signal);
  expect(h.calls.at(-1)).toMatchObject({name:'invitationDecision',body:{expectedVersion:1,expectedTaskVersion:1,decision:'accepted'}});
 });
 it('reads full plan before confirmation and disables stale plan confirmation',async()=>{
  const h=harness(),signal=new AbortController().signal;h.stalePlan();const snapshot=await h.source.read(signal),card=snapshot.conversations.find(c=>c.id===group.id)!.messages[0]!.cards![0]!;
  expect(card.detail).toContain('交付：合成材料清单');expect(card.detail).toContain('验收：每项可追溯');expect(card.status).toBe('建议已失效');expect(card.actions?.some(a=>a.id.startsWith('decision:confirm:'))).toBe(false);
 });
 it('uploads real UTF-8 payload with task version and shares only selected refs; submits inspected candidate via canonical API',async()=>{
  const h=harness(),signal=new AbortController().signal;h.fullTask();const snapshot=await h.source.read(signal),view=snapshot.conversations.find(c=>c.id===group.id)!;
  expect(view.uploadTasks?.[0]?.version).toBe(3);
  await h.source.uploadText(group.id,'task_synthetic','合成材料.txt','指标：12',signal,3);
  const upload=h.calls.at(-1)!;expect(upload.name).toBe('upload');expect(upload.body).toMatchObject({taskId:'task_synthetic',expectedVersion:3,mediaType:'text/plain'});expect(Buffer.from((upload.body as RequestFor<'upload'>['body']).contentBase64,'base64').toString('utf8')).toBe('指标：12');
  await h.source.send(group.id,'先不分享',[],signal,own.id);expect(h.calls.at(-1)?.body).toMatchObject({context:[]});
  await h.source.send(group.id,'勾选材料',[],signal,own.id,view.contextChoices!.map(c=>c.key));expect(h.calls.at(-1)?.body).toMatchObject({context:[{kind:'task',ref:{id:'task_synthetic',version:3}},{kind:'artifact',ref:{id:'artifact_test',version:2}}]});
  const candidate=view.messages[0]!.cards!.find(c=>c.title==='公共 AI 运行')!;expect(candidate.detail).toContain('Metric A: 12 samples.');expect(candidate.detail).toContain('No measurement supplied.');expect(candidate.detail).toContain('Only the authorized supplied text');
  await h.source.act(group.id,message.id,'candidate:submit:run_test',signal);expect(h.calls.at(-1)).toMatchObject({name:'submitCandidate',body:{expectedVersion:3,expectedTaskVersion:3}});
 });
 it('retries only with service remaining budget and allowed action',async()=>{
  const h=harness(),signal=new AbortController().signal;h.turn();await h.source.read(signal);
  await h.source.act(group.id,message.id,'turn:retry:turn_test',signal);expect(h.calls.at(-1)).toMatchObject({name:'retryChatTurn',body:{budget:{maxTokens:800,maxSeconds:90}}});
 });
});
