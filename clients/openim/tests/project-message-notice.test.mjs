import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {assistantReplyText,OpenImResearchPointer} from '@research-agent-platform/contracts';

async function load(file,imports={}){
 const source=await readFile(new URL(file,import.meta.url),'utf8'),module={exports:{}};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,Map,Promise,JSON,require:name=>{
  if(name in imports)return imports[name];throw Error('Unexpected import '+name);
 }});
 return module.exports;
}
const {createProjectNoticeReader,isProjectNoticeCandidate}=await load('../src/research/project-message-notice.ts');
const taskNotice=await load('../src/research/task-notice.ts');
const agentProgressState=await load('../src/research/agent-progress-state.ts');
const fact={id:'decision',conversationId:'personal',sequence:5,senderContactId:'coordinator',origin:'service',text:'本轮实验数量具体是多少？',turnId:null,resources:[],actionIds:[],mentions:[]};
const reply={messageId:'owner-request',sequence:1,senderContactId:'owner',text:'持续跟进这次研究',withdrawn:false};
const notice={projectId:'project',taskId:'work',kind:'decision'};
const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):!tree||typeof tree!=='object'?[]:[tree,...nodes(tree.props?.children)];

test('only coordinator service replies with a real source quote request project metadata',()=>{
 assert.equal(isProjectNoticeCandidate(fact,reply,true),true);
 for(const value of [{...fact,origin:'human'},{...fact,origin:'model'},{...fact,turnId:'actual-turn'},{...fact,resources:[{kind:'task'}]},{...fact,senderContactId:null}])assert.equal(isProjectNoticeCandidate(value,reply,true),false);
 assert.equal(isProjectNoticeCandidate(fact,reply,false),false);
 assert.equal(isProjectNoticeCandidate(fact,null,true),false);
 assert.equal(isProjectNoticeCandidate(fact,{...reply,withdrawn:true},true),true);
});

test('history and workspace rerenders share a single request and cache negative results',async()=>{
 let count=0;
 const read=createProjectNoticeReader(async(_conversation,id)=>{count++;return id==='decision'?notice:null;});
 const values=await Promise.all(Array.from({length:8},()=>read(1,'personal','decision')));
 assert.equal(count,1);assert.ok(values.every(value=>value===notice));
 await read(1,'personal','ordinary');await read(1,'personal','ordinary');assert.equal(count,2);
 await read(1,'personal','decision');assert.equal(count,2);
 await read(2,'personal','decision');assert.equal(count,3);
});

test('a whole page of eligible legacy history performs only one capability404',async()=>{
 let count=0;
 const read=createProjectNoticeReader(async()=>{count++;throw Object.assign(Error('old server'),{status:404});});
 const values=await Promise.all(Array.from({length:20},(_,i)=>read(1,'personal','message-'+i)));
 assert.ok(values.every(value=>value===null));assert.equal(count,1);
 await read(1,'personal','more-history');assert.equal(count,1);
 await read(2,'personal','different-account');assert.equal(count,2);
});

async function renderMessage(projectNotice,messageFact=fact,turn,previousMessage,{replyTo=reply,kind='personal',sessionOnly=false,stoppedInTimeline=false}={}){
 const jsx=(type,props)=>({type,props}),queries=[],locations=[],readable=[],registered=[];
 const mapping={imConversationID:'im',researchConversationId:'personal',peerUserID:'sdk-coordinator',kind};
 const store={generation:1,contacts:[{contact:{id:'coordinator',profile:{role:'coordinator'}}}],mappings:[mapping]};
 if(sessionOnly)Object.assign(store,{session:{coordinator:mapping},contacts:[],mappings:[]});
 const pointer={type:'research_message',bridgeVersion:'1.0.0',conversationId:messageFact.conversationId,messageId:messageFact.id,sequence:messageFact.sequence};
 const imports={
  react:{useContext:()=>({messageIds:new Set()}),useEffect(effect){effect();},useState:()=>[undefined,()=>{}]},
  'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
  antd:{Alert:'Alert',Button:'Button'},
  clsx:(...classNames)=>classNames.filter(Boolean).join(' '),
  '@research-agent-platform/contracts':{OpenImResearchPointer},
  './api':{researchApi:async()=>({data:projectNotice}),supportsTranscriptSync:()=>true},
  './ChatSourceQuote':{ChatSourceQuote:'ChatSourceQuote'},
  './useResearchRead':{useResearchRead(_read,identity,enabled,options){
   queries.push({identity,enabled,options});
   return {data:identity.startsWith('project-message:')?projectNotice:identity===`im:${pointer.conversationId}:${pointer.messageId}:${pointer.sequence}`?{fact:messageFact,details:{replyTo}}:turn&&identity===`im:${turn.id}`?{data:turn}:undefined,refresh(){},invalidate(){}};
  }},
  './store':{useResearchStore:selector=>selector(store)},
  '@/store':{useConversationStore:selector=>selector({currentConversation:{conversationID:'im'}})},
  './agent-progress':{AgentProgressHistory:'History',acknowledgeAgentReply(){},useStoppedReplyInTimeline:()=>stoppedInTimeline,registerAgentProgress:(_generation,_imID,value)=>registered.push(value)},
  './agent-progress-state':agentProgressState,
  './task-notice':taskNotice,
  './project-message-notice':{createProjectNoticeReader,isProjectNoticeCandidate},
  './chat-message-read':{},'./useChatRecordChanges':{useChatRecordChanges(){}},'./chat-transcript-sync':{watchTranscriptMessage(){}},
  './chat-timeline':{researchPointer:message=>message.pointer,timelineScope:(generation,imId)=>`${generation}:${imId}`,locateMessage:(scope,locator)=>locations.push({scope,locator})},
  '@/pages/chat/queryChat/MessageItem/message-item.module.scss':{__esModule:true,default:{bubble:'bubble'}},
  './PersonalReceiptCard':{PersonalReceiptCard:'PersonalReceiptCard',WorkTaskReceipt:'WorkTaskReceipt'},
  './ChatProjectDelivery':{ChatProjectDelivery:'ChatProjectDelivery'},
  './chat-reply':{
   isCoordinatorChatContact: (id,state) => state.contacts.some(({contact})=>contact.id===id),
   canonicalChatText: (message,coordinator) => message.origin==='model'&&coordinator?assistantReplyText(message.text):message.text,
   coordinatorChatText: text => text,
  },
  './SafeMessageMarkdown':{__esModule:true,default:'SafeMessageMarkdown'},
 };
 for(const name of ['./GroupNoticeCard','./ResearchActionCard','./ResearchTaskCard','./ResearchTurnStatus','./CreatedAgentChatButton','./AgentFileReadSummary','./ContinueAgentFileReadingButton','./ResearchReadSummary','./GroupMessageStatuses'])imports[name]={[name.slice(2)]:name.slice(2)};
 const component=(await load('../src/research/ResearchMessageRender.tsx',imports)).default;
 return {tree:component({message:{clientMsgID:'sdk-decision',contentType:110,sendID:'sdk-coordinator',customElem:{data:JSON.stringify(pointer)}},previousMessage,onReadableText:text=>readable.push(text)}),queries,locations,readable,registered};
}

test('direct-chat input registers active progress, while historical failures retain details and retry',async()=>{
 const outgoing={...fact,origin:'human',senderContactId:'owner',turnId:'turn'};
 for(const status of ['queued','running','failed']) {
  const turn={id:'turn',status,agentContactId:'coordinator',conversationId:fact.conversationId};
  const {tree,registered}=await renderMessage(null,outgoing,turn,undefined,{replyTo:null});
  const details=nodes(tree).find(node=>node.type==='ResearchTurnStatus');
  if(status==='failed') {
   assert.equal(details.props.turn,turn);
   assert.equal(typeof details.props.onRetried,'function');
   assert.deepEqual(registered,[]);
  } else {
   assert.equal(details,undefined);
   assert.deepEqual(registered,[turn]);
  }
 }
 const turn={id:'turn',status:'cancelled',agentContactId:'coordinator',conversationId:fact.conversationId};
 const {tree}=await renderMessage(null,outgoing,turn,undefined,{replyTo:null,stoppedInTimeline:true});
 assert.equal(nodes(tree).some(node=>node.type==='ResearchTurnStatus'),false);
});

test('host project questions and deadline notices render a single card with their original text and task',async()=>{
 for(const kind of ['decision','update']){
  const {tree,queries}=await renderMessage({...notice,kind}),all=nodes(tree);
  const [card,...otherCards]=all.filter(node=>node.type==='ChatProjectDelivery');
  assert.equal(otherCards.length,0);
  assert.equal(card.props.kind,kind);
  assert.equal(card.props.taskId,'work');
  assert.equal(card.props.text,fact.text);
  assert.equal(card.props.source,reply);
  assert.ok(!all.some(node=>['ChatSourceQuote','SafeMessageMarkdown','WorkTaskReceipt'].includes(node.type)));
  assert.equal(queries.find(query=>query.identity.startsWith('project-message:')).options.poll,false);
 }
});

test('the verified project result owns a single card using the exact canonical message and quote',async()=>{
 const {tree,queries,locations}=await renderMessage({...notice,kind:'result'}),all=nodes(tree);
 const card=all.find(node=>node.type==='ChatProjectDelivery');
 assert.equal(card.props.taskId,'work');
 assert.equal(card.props.kind,'result');
 assert.equal(card.props.messageId,fact.id);
 assert.equal(card.props.text,fact.text);
 assert.equal(card.props.source,reply);
 const locator={messageId:reply.messageId,sequence:reply.sequence};
 card.props.onLocateSource(locator);
 assert.deepEqual(locations,[{scope:'1:im',locator}]);
 assert.ok(!all.some(node=>['ChatSourceQuote','SafeMessageMarkdown','WorkTaskReceipt'].includes(node.type)));
 assert.equal(tree.props['data-canonical-message'],fact.id);
 assert.equal(queries.find(query=>query.identity.startsWith('project-message:')).options.poll,false);
});

test('ordinary assistant history renders and copies the reply body with one compact source',async()=>{
 const answer='我是你的个人助理。',text=JSON.stringify({plan:null,reply:answer});
 const {tree,queries,readable}=await renderMessage(null,{...fact,origin:'model',text});
 const all=nodes(tree);
 assert.equal(all.find(node=>node.type==='SafeMessageMarkdown').props.text,answer);
 assert.equal(all.find(node=>node.type==='ChatSourceQuote').props.text,reply.text);
 assert.equal(readable.at(-1),answer);
 assert.match(tree.props.className,/chat-assistant-reply/);
 assert.equal(queries.find(query=>query.identity.startsWith('project-message:')).enabled,false);
});

test('only an adjacent automatic assistant reply omits its inline source',async()=>{
 const previous={pointer:{messageId:reply.messageId,sequence:reply.sequence,conversationId:fact.conversationId}};
 const adjacent={...fact,origin:'model',sequence:reply.sequence+1};
 for(const [message,before,hasQuote] of [
  [adjacent,previous,false],
  [adjacent,undefined,true],
  [adjacent,{pointer:{...previous.pointer,conversationId:'other'}},true],
  [{...adjacent,origin:'human'},previous,true],
  [fact,previous,true],
 ]){
  const {tree}=await renderMessage(null,message,undefined,before);
  assert.equal(nodes(tree).some(node=>node.type==='ChatSourceQuote'),hasQuote);
 }
});

test('a canonical plain work receipt uses the verified task instead of nesting a card in its answer',async()=>{
 const turn={id:'turn',status:'succeeded',outputMessageId:fact.id,assistantReceipt:{kind:'work_task',taskId:'work'}};
 const {tree}=await renderMessage(null,{...fact,origin:'model',turnId:turn.id},turn);
 const all=nodes(tree),card=all.find(node=>node.type==='ChatProjectDelivery');
 assert.equal(card.props.kind,'receipt');
 assert.equal(card.props.taskId,'work');
 assert.ok(!all.some(node=>['ChatSourceQuote','SafeMessageMarkdown','PersonalReceiptCard'].includes(node.type)));
});

test('an ordinary system notice keeps its existing folded presentation',async()=>{
 const {tree}=await renderMessage(null),all=nodes(tree);
 assert.equal(all.some(node=>node.type==='details'&&node.props.className==='chat-system-notice'),true);
 assert.equal(all.some(node=>node.type==='WorkTaskReceipt'),false);
 assert.equal(all.some(node=>node.type==='ChatProjectDelivery'),false);
});

test('released welcome and morning greetings render and copy once as ordinary personal assistant messages',async()=>{
 const greetings=[
  '你好，我是你的个人助理。很高兴在 DeepChat 见到你！想聊聊手头的研究，或理一理接下来要做的事，随时给我发消息。',
  '早上好！今天想先从哪件事开始？有需要的话，我们可以一起理一理。',
  '早上好！祝你今天研究顺利。手头有什么想法，随时和我聊聊。',
  '早上好！如果今天有件事想推进，我们可以先聊聊第一步。',
 ];
 for(const text of greetings)for(const sessionOnly of [false,true]){
  const {tree,queries,readable}=await renderMessage(null,{...fact,text},undefined,undefined,{replyTo:null,sessionOnly});
  const all=nodes(tree);
  assert.match(tree.props.className,/chat-plain-message.*chat-assistant-reply/);
  assert.deepEqual(all.filter(node=>node.type==='SafeMessageMarkdown').map(node=>node.props.text),[text]);
  assert.equal(all.some(node=>['details','summary','ChatSourceQuote','ChatProjectDelivery'].includes(node.type)),false);
  assert.equal(readable.at(-1),text);
  assert.equal(queries.find(query=>query.identity.startsWith('project-message:')).enabled,false);
 }
});

test('personal reminders with a separate summary and group or system notices stay folded',async()=>{
 for(const [messageFact,kind,summary] of [
  [{...fact,text:'提醒：会议\n请准备数据。'},'personal','提醒：会议'],
  [{...fact,text:'群主已变更。'},'group','群主已变更。'],
  [{...fact,senderContactId:null,text:'服务通知。'},'personal','服务通知。'],
 ]){
  const {tree}=await renderMessage(null,messageFact,undefined,undefined,{replyTo:null,kind});
  const all=nodes(tree);
  assert.equal(all.find(node=>node.type==='details').props.className,'chat-system-notice');
  assert.equal(all.find(node=>node.type==='summary').props.children,summary);
  assert.equal(all.find(node=>node.type==='SafeMessageMarkdown').props.text,messageFact.text);
 }
});

test('actual task receipt opens its exact personal task without pretending model completion',async()=>{
 const navigations=[],jsx=(type,props)=>({type,props});
 const imports={react:{},'react/jsx-runtime':{jsx,jsxs:jsx},antd:{Button:'Button'},'react-router-dom':{useNavigate:()=>path=>navigations.push(path)},
  './api':{},'./useResearchRead':{useResearchRead:()=>({data:{data:{title:'Research project',status:'blocked',summaryOnly:false}}})},
  './usePersonalOperation':{},'./PersonalAssistantPanel':{},'./personal-time':{},'./CreatedAgentChatButton':{},'./AssistantWorkTaskButton':{},
  './workbench-links':{workbenchTaskPath:id=>'/workbench/personal/'+id},'./NativeWorkbenchTaskButton':{NativeWorkbenchTaskButton:'NativeWorkbenchTaskButton'}};
 const {WorkTaskReceipt}=await load('../src/research/PersonalReceiptCard.tsx',imports),all=nodes(WorkTaskReceipt({taskId:'exact-work'}));
 all.find(node=>node.type==='Button').props.onClick();
 assert.deepEqual(navigations,['/workbench/personal/exact-work']);
 assert.ok(all.some(node=>node.type==='p'&&node.props.children==='需要处理的问题'));
});

test('delivery card uses its historical text and only offers review for the current eligible result',async()=>{
 const navigations=[],located=[],jsx=(type,props)=>({type,props});
 const task={id:'work',title:'Synthetic report',status:'awaiting_review',summaryOnly:false,allowedActions:['review'],result:{messageId:'delivery',summary:'newer content'}};
 const imports={
  'react/jsx-runtime':{jsx,jsxs:jsx},antd:{Button:'Button'},'@ant-design/icons':{RollbackOutlined:'RollbackOutlined'},
  'react-router-dom':{useNavigate:()=>path=>navigations.push(path)},'./api':{},
  './NativeWorkbenchTaskButton':{NativeWorkbenchTaskButton:'NativeWorkbenchTaskButton'},
  './SafeMessageMarkdown':{__esModule:true,default:'SafeMessageMarkdown'},
  './useResearchRead':{useResearchRead:(_reader,_identity,_enabled,options)=>{
   assert.equal(options.poll,false);
   return {data:{data:task}};
  }},
  './chat-project-delivery.scss':{},'./workbench-links':{workbenchTaskPath:id=>'/workbench/personal/'+id},
 };
 const {ChatProjectDelivery}=await load('../src/research/ChatProjectDelivery.tsx',imports);
 const props={taskId:task.id,messageId:'delivery',kind:'result',text:'整理好了，你看一下。\n\n原版交付',source:reply,onLocateSource:location=>located.push(location)};
 const all=nodes(ChatProjectDelivery(props));
 assert.equal(all.find(node=>node.type==='h3').props.children,task.title);
 assert.equal(all.find(node=>node.type==='SafeMessageMarkdown').props.text,'原版交付');
 const review=all.find(node=>node.type==='Button');
 assert.equal(review.props.children,'查看并验收');
 assert.equal(review.props.type,'primary');
 review.props.onClick();
 assert.deepEqual(navigations,['/workbench/personal/work']);
 all.find(node=>node.type==='button').props.onClick();
 assert.equal(located[0].messageId,reply.messageId);
 assert.equal(located[0].sequence,reply.sequence);
 assert.equal(all.find(node=>node.type==='NativeWorkbenchTaskButton').props.target.taskId,'work');

 const update=nodes(ChatProjectDelivery({...props,kind:'update',text:'项目已到约定时间。仍有一项待交付。'}));
 assert.equal(update[0].props['aria-label'],'任务进展');
 assert.equal(update.find(node=>node.type==='Button').props.children,'查看任务');
 assert.equal(update.find(node=>node.type==='SafeMessageMarkdown').props.text,'项目已到约定时间。仍有一项待交付。');
 assert.equal(update.find(node=>node.type==='NativeWorkbenchTaskButton').props.target.taskId,'work');

 const historical=nodes(ChatProjectDelivery({...props,messageId:'previous',source:{...reply,withdrawn:true}}));
 assert.equal(historical.find(node=>node.type==='Button').props.children,'查看任务');
 assert.equal(historical.find(node=>node.type==='SafeMessageMarkdown').props.text,'原版交付');
 assert.equal(historical.some(node=>node.type==='button'),false);
 for(const result of [{accepted:true,changesRequested:false},{accepted:false,changesRequested:true}]){
  Object.assign(task.result,result);
  assert.equal(nodes(ChatProjectDelivery(props)).find(node=>node.type==='Button').props.children,'查看任务');
 }
 Object.assign(task.result,{accepted:false,changesRequested:false});
 for(const status of ['awaiting_review','running','blocked']){
  task.status=status;
  task.allowedActions=['review'];
  assert.equal(nodes(ChatProjectDelivery(props)).find(node=>node.type==='Button').props.children,'查看并验收');
  task.allowedActions=[];
  assert.equal(nodes(ChatProjectDelivery(props)).find(node=>node.type==='Button').props.children,'查看任务');
 }
 task.allowedActions=['review'];
 task.summaryOnly=true;
 const restricted=nodes(ChatProjectDelivery(props));
 assert.equal(restricted.find(node=>node.type==='Button').props.children,'查看任务');
 assert.equal(restricted.some(node=>node.type==='NativeWorkbenchTaskButton'),false);
});

test('SDK text, mentions, and quotes normalize only the known coordinator sender',async()=>{
 const state={generation:1,contacts:[],actor:null};
 const useResearchStore=selector=>selector(state);
 Object.assign(useResearchStore,{getState:()=>state,subscribe(){}});
 const MessageType={TextMessage:101,AtTextMessage:106,QuoteMessage:114};
 const {readableMessage,canonicalChatText,useCoordinatorSdkSender}=await load('../src/research/chat-reply.ts',{
  zustand:{create(init){return {getState:init,subscribe(){}};}},
  '@openim/wasm-client-sdk':{MessageType},
  '@research-agent-platform/contracts':{assistantReplyText},
  '@/store':{},'./store':{useResearchStore},
 });
 const body='这是保留换行的助手回复。\n\n第二段。',envelope=JSON.stringify({plan:null,reply:body});
 const examples=[
  {contentType:MessageType.TextMessage,textElem:{content:envelope}},
  {contentType:MessageType.AtTextMessage,atTextElem:{text:envelope}},
  {contentType:MessageType.QuoteMessage,quoteElem:{text:envelope}},
 ];
 assert.equal(useCoordinatorSdkSender('assistant-sdk'),false);
 assert.equal(readableMessage({...examples[0],sendID:'assistant-sdk'}),envelope);
 state.session={coordinator:{peerUserID:'assistant-sdk'}};
 assert.equal(useCoordinatorSdkSender('assistant-sdk'),true);
 for(const message of examples){
  assert.equal(readableMessage({...message,sendID:'assistant-sdk'}),body);
  assert.equal(readableMessage({...message,sendID:'human-sdk',senderNickname:'助手'}),envelope);
 }
 assert.equal(canonicalChatText({text:envelope,origin:'human',senderContactId:'human'}),envelope);
 for(const text of [
  '{"plan":{},"reply":"r"}','{"plan":null,"reply":" "}','{"plan":null,"reply":"r","extra":true}',
  '{"reply":"r"}','{"plan":null,"reply":false}','{"plan":null,"reply":','普通内容',
 ])assert.equal(assistantReplyText(text),text);
});
