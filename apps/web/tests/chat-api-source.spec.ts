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
const personal=Conversation.parse({id:'personal_test',labId:'lab_test',kind:'personal',title:'自己的助理',ownerMemberId:'owner_test',version:1,members:[member(human.id),member(own.id)],taskIds:[],lastSequence:0,createdAt:at,updatedAt:at,allowedActions:['send'],viewerState:{readSequence:0,unreadCount:0,pinned:true,version:1}});
const group=Conversation.parse({...personal,id:'group_test',kind:'group',title:'合成群',members:[member(human.id),member(own.id),member(other.id,'invited')],lastSequence:1,allowedActions:['send','invite','manage'],viewerState:{readSequence:0,unreadCount:1,pinned:false,version:1}});
const message=ChatMessage.parse({id:'message_test',conversationId:group.id,sequence:1,senderContactId:own.id,origin:'model',text:'合成建议',mentions:[],resources:[],actionIds:['action_test'],turnId:null,createdAt:at});
const action=ChatAction.parse({id:'action_test',conversationId:group.id,sourceMessageId:message.id,payload:{kind:'create_group',title:'新任务群',plan:{id:'plan_test',version:1},contactIds:[human.id,other.id],sharedContext:{selectedText:'仅分享这个合成片段',artifactRefs:[{id:'artifact_test',version:2}]}},status:'proposed',version:1,createdAt:at,expiresAt:'2026-12-04T00:00:00Z',allowedDecisions:['confirm','dismiss']});
function harness(){
 const calls:{name:RouteName;body:unknown;headers:HeadersInit|undefined}[]=[],security=vi.fn();
 let directMode=false;let failSend=false,failRead=false,otherOwner=false,failEnsure=false,pendingTask=false,fullTaskMode=false,planVersion=1,turnMode=false;
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
  if(name==='markChatRead'&&failRead)throw new Error('synthetic read transport error');
  let response:unknown;
  switch(name){
   case 'session':{const data=routes.session.response.parse(structuredClone(endpointExamples.session!.response)).data;data.member.id=otherOwner?'other_owner':'owner_test';response={data};break;}
   case 'personalConversation':if(failEnsure)return new Response(JSON.stringify({error:{code:'NOT_IMPLEMENTED',message:'未实现',requestId:'req_test'}}),{status:501});response={data:{conversation:personal,agent:own}};break;
   case 'contactRequests':response={data:['pending','accepted','revoked'].map((status,i)=>({id:'request_'+status,requesterMemberId:'other_owner',requesterContactId:human.id,targetContactId:own.id,deciderMemberId:'owner_test',status,version:i+1,createdAt:at,updatedAt:at,allowedDecisions:status==='pending'?['accept','decline']:[]})),nextCursor:null};break;
   case 'chatContacts':response=url.searchParams.has('cursor')?{data:[other],nextCursor:null}:{data:[human,own],nextCursor:'opaque_page_2'};break;
   case 'chatConversations':response={data:[group,personal,...(directMode?[{...personal,id:'direct_agent',kind:'direct'}]:[])],nextCursor:null};break;
   case 'chatConversation':response={data:url.pathname.endsWith(group.id)?{...group,taskIds:fullTaskMode?[task.id]:pendingTask?[summary.id]:[]}:url.pathname.endsWith('direct_agent')?{...personal,id:'direct_agent',kind:'direct'}:personal};break;
   case 'chatMessages':response={data:url.pathname.includes(group.id)?fullTaskMode?[{...message,resources:[{kind:'task',ref:{id:task.id,version:task.version}},{kind:'run',ref:{id:run.id,version:1}}]}]:pendingTask?[{...message,resources:[{kind:'task',ref:{id:summary.id,version:summary.version}},{kind:'assignment',ref:{id:'invitation_B',version:1}}]}]:turnMode?[{...message,origin:'human',senderContactId:human.id,turnId:turn.id}]:[{...message,turnId:turn.id},{...message,turnId:turn.id}]:[],nextCursor:null};break;
   case 'chatActions':response={data:url.pathname.includes(group.id)?[action]:[],nextCursor:null};break;
   case 'chatInvitations':response={data:[{id:'invitation_test',conversationId:group.id,title:'合成群',invitedContactId:own.id,invitedByMemberId:'other_owner',status:'pending',version:2}],nextCursor:null};break;
   case 'sendChatMessage':response={data:{message:{...message,id:'persisted_send',origin:'human',text:(body as RequestFor<'sendChatMessage'>['body']).text,senderContactId:human.id,actionIds:[]},turn:null}};break;
   case 'decideChatAction':response={data:{action:{...action,status:'applied',version:2},conversationId:group.id,resources:[]}};break;
   case 'decideChatInvitation':response={data:member(own.id)};break;
   case 'createDirectConversation':response={data:personal};break;
   case 'markChatRead':response={data:{...group.viewerState,readSequence:1,unreadCount:0}};break;
   case 'updateChatPreferences':response={data:{...group.viewerState,pinned:true,version:2}};break;
   case 'task':response={data:fullTaskMode?fullTask:summary};break;
   case 'getPlan':response={data:{...fixtures.invitationPlan.value.data,id:'plan_test',version:planVersion}};break;
   case 'getRun':response={data:run};break;
   case 'chatTurn':response={data:turn};break;
   default:response=endpointExamples[name]!.response;
  }
  routes[name].response.parse(response);
  return new Response(JSON.stringify(response),{status:routes[name].status,headers:{'Content-Type':'application/json','X-Contract-Version':contractVersion}});
 }));client.csrfToken='test-csrf';
 return {direct:()=>{directMode=true;},source:new ChatApiSource(client,'owner_test',[{id:'owner_test',displayName:'合成主人'}],security),calls,security,failSend:(value:boolean)=>{failSend=value;},failRead:(value:boolean)=>{failRead=value;},otherOwner:()=>{otherOwner=true;},failEnsure:()=>{failEnsure=true;},pendingTask:()=>{pendingTask=true;},fullTask:()=>{fullTaskMode=true;},stalePlan:()=>{planVersion=2;},turn:()=>{turnMode=true;}};
}
describe('frozen CHAT1 API wiring (synthetic transport)',()=>{
 it('exposes accepted owner authorizations for explicit revocation, without pending actions on processed records',async()=>{
  const h=harness(),snapshot=await h.source.read(new AbortController().signal);
  expect(snapshot.contactRequests?.find(r=>r.status==='accepted')).toMatchObject({canRevoke:true,canAccept:false,canDecline:false,version:2});
  expect(snapshot.contactRequests?.find(r=>r.status==='pending')).toMatchObject({canRevoke:true,canAccept:true,canDecline:true});
  expect(snapshot.contactRequests?.find(r=>r.status==='revoked')).toMatchObject({canRevoke:false,canAccept:false,canDecline:false});
 });
 it('uses real permissions for profile, relationships, owned memory and self chat',()=>{
  const specialist=Contact.parse({...own,profile:{role:'specialist',introduction:'介绍',capabilityDescription:'仅用户设定',personality:'简洁',version:7},relationship:{status:'own',requestId:null,version:0},allowedActions:['chat','edit_profile','manage_private_memory']});
  expect(contactProjection(specialist,[human,specialist],[],'owner_test')).toMatchObject({canOpenDirect:true,canEdit:true,canManagePrivateMemory:true,profileVersion:7,mine:true,role:'专属 Agent',personality:'简洁'});
  const pending=Contact.parse({...other,relationship:{status:'pending_outbound',requestId:'request_test',version:2},allowedActions:[]});
  expect(contactProjection(pending,[pending],[],'owner_test')).toMatchObject({canOpenDirect:false,canManagePrivateMemory:false,mine:false,relationship:'等待同意'});
  expect(contactProjection(Contact.parse({...human,allowedActions:['edit_profile']}),[human],[],'owner_test').canOpenDirect).toBe(false);
 });
 it('uses actual Agent identity in specialist direct and keeps the demand coordinator fixed',async()=>{
  const h=harness();h.direct();const signal=new AbortController().signal,snapshot=await h.source.read(signal);
  expect(snapshot.conversations.find(c=>c.fixed)).toMatchObject({title:'需求与协作',profileContactId:own.id,subtitle:own.displayName+' · 需求协调 Agent'});
  expect(snapshot.conversations.find(c=>c.id==='direct_agent')).toMatchObject({title:own.displayName,icon:'robot',fixed:false});
  await h.source.send('direct_agent','私聊需求',[],signal);
  expect(h.calls.at(-1)?.body).toMatchObject({intent:'ask_agent',agentContactId:own.id,budget:chatBudget,context:[]});
 });
 it('wires all explicit profile relationship and memory versions without eager private reads',async()=>{
  const h=harness(),signal=new AbortController().signal;await h.source.read(signal);
  expect(h.calls.some(c=>c.name==='chatMemories')).toBe(false);
  const input={displayName:'合成 Agent',introduction:'介绍',capabilityDescription:'文献整理',personality:'谨慎'};
  await h.source.saveProfile(own.id,input,7,signal);expect(h.calls.at(-1)).toMatchObject({name:'updateContactProfile',body:{...input,expectedVersion:7}});
  await h.source.createAgent(input,signal);expect(h.calls.at(-1)).toMatchObject({name:'createPersonalAgent',body:input});
  await h.source.requestContact(other.id,signal);expect(h.calls.at(-1)?.name).toBe('requestContact');
  await h.source.decideContactRequest('request_test','accept',3,signal);expect(h.calls.at(-1)).toMatchObject({name:'decideContactRequest',body:{expectedVersion:3,decision:'accept'}});
  await h.source.removeContact(other.id,4,signal);expect(h.calls.at(-1)).toMatchObject({name:'revokeContact',body:{expectedVersion:4}});
  await h.source.revokeContactRequest('request_test',5,signal);expect(h.calls.at(-1)).toMatchObject({name:'revokeContactRequest',body:{expectedVersion:5}});
  const scope={kind:'private_agent' as const,id:own.id,label:own.displayName,canManage:true};
  await h.source.readMemories(scope,signal);await h.source.saveMemory(scope,'合成偏好',null,signal);expect(h.calls.at(-1)).toMatchObject({name:'createChatMemory',body:{scope:'private_agent',scopeId:own.id,content:'合成偏好',source:null}});
  await h.source.saveMemory(scope,'修订','本人',signal,'memory_test',9);expect(h.calls.at(-1)).toMatchObject({name:'reviseChatMemory',body:{expectedVersion:9,content:'修订',source:'本人'}});
  await h.source.revokeMemory('memory_test',10,signal);expect(h.calls.at(-1)).toMatchObject({name:'revokeChatMemory',body:{expectedVersion:10}});
  await h.source.memoryHistory('memory_test',signal);expect(h.calls.at(-1)?.name).toBe('chatMemoryHistory');
 });
 it('ensures real default conversation, consumes opaque paging and deduplicates messages',async()=>{
  const h=harness(),snapshot=await h.source.read(new AbortController().signal);
  expect(snapshot.contacts).toHaveLength(3);expect(snapshot.conversations.find(c=>c.pinned)?.id).toBe(personal.id);
  const view=snapshot.conversations.find(c=>c.id===group.id)!;expect(view.messages).toHaveLength(1);
  expect(h.calls.some(c=>c.name==='chatTurn')).toBe(false);
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
  expect(contactProjection(human,[human,own],[],'owner_test')).toMatchObject({canOpenDirect:false,directHint:'这是你自己的成员资料，可通过需求与协作聊天。'});
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
 it('reads without acknowledging unopened chats; marks only delivered sequence and keeps exact failed read key',async()=>{
  const h=harness(),signal=new AbortController().signal,snapshot=await h.source.read(signal);
  expect(snapshot.conversations.find(c=>c.id===group.id)?.unreadCount).toBe(1);
  expect(h.calls.filter(c=>c.name==='markChatRead')).toHaveLength(0);
  // A still-rendered older snapshot must not inherit a newer background load.
  expect(await h.source.markRead(group.id,0,signal)).toBe(1);
  expect(h.calls.filter(c=>c.name==='markChatRead')).toHaveLength(0);
  h.failRead(true);await expect(h.source.markRead(group.id,1,signal)).rejects.toMatchObject({code:'NETWORK_ERROR'});
  h.failRead(false);expect(await h.source.markRead(group.id,1,signal)).toBe(0);
  const reads=h.calls.filter(c=>c.name==='markChatRead');expect(reads).toHaveLength(2);expect(reads[0]?.body).toEqual({throughSequence:1});expect(reads[0]?.headers).toEqual(reads[1]?.headers);
  await h.source.markRead(group.id,1,signal);expect(h.calls.filter(c=>c.name==='markChatRead')).toHaveLength(2);
  await h.source.setPinned(group.id,true,signal);expect(h.calls.at(-1)).toMatchObject({name:'updateChatPreferences',body:{expectedVersion:1,pinned:true}});
 });
 it('does not navigate an AI owner into a group after accepting only an AI invitation',async()=>{
  const h=harness(),signal=new AbortController().signal;await h.source.read(signal);
  expect(await h.source.act(personal.id,'invitation:invitation_test','invitation:accept:invitation_test',signal)).toBe(personal.id);
 });
});
