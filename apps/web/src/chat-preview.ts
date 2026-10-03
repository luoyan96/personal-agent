/** Explicit development preview only; main.ts eliminates this import in production. */
import {ChatView} from './chat-view';
import type {ChatSnapshot, ChatSource, ContactView} from './chat-view';
import './chat.css';
if(!__DEMO__)throw new Error('Chat preview is development-only');
document.body.classList.add('chat-route');
document.title='科研聊天开发预览';
const app=document.querySelector<HTMLElement>('#app')!;
app.innerHTML='<header><span class="brand">研伴 · 合成开发预览</span><nav>所有数据均为测试数据，不会创建真实任务</nav></header><main id="chat-root"></main>';
const contacts:ContactView[]=[
  {id:'preview-personal',name:'我的科研助理',identity:'个人 AI',owner:'主人：合成成员',availability:'测试状态',icon:'robot'},
  {id:'preview-human',name:'合成成员林',identity:'真人',owner:'本实验室成员',availability:'待接受邀请',icon:'user'},
  {id:'preview-public',name:'合成文献助理',identity:'公共 AI',owner:'本实验室公共能力',availability:'测试状态',icon:'robot'},
];
const snapshot:ChatSnapshot={notice:'合成开发预览 · 不代表真实服务或执行',contacts,conversations:[
  {id:'preview-private',title:'我的科研助理',subtitle:'个人 AI · 主人：合成成员',preview:'个人智能体 · 固定置顶',pinned:true,group:false,members:[contacts[0]!],canSend:true,messages:[{id:'preview-message',sender:'合成成员',identity:'真人',own:true,time:'开发预览',text:'请帮我安排科研协作。'}]},
  {id:'preview-group',title:'合成任务群',subtitle:'任务群 · 2 位 AI、1 位真人',preview:'邀请、运行与成果卡片',pinned:false,group:true,members:contacts,canSend:true,messages:[
    {id:'preview-invite',sender:'我的科研助理',identity:'个人 AI',own:false,time:'开发预览',text:'邀请卡片的展示样式',card:{kind:'invitation',title:'成员邀请',detail:'合成成员林 · 范围：整理实验结果',status:'待接受邀请',actions:[{id:'preview-accept',label:'接受邀请'}]}},
    {id:'preview-run',sender:'合成文献助理',identity:'公共 AI',own:false,time:'开发预览',text:'运行卡片的展示样式',card:{kind:'run',title:'文献核对',detail:'关联测试任务 · 版本 1',status:'测试：运行中',actions:[{id:'preview-cancel',label:'取消运行'}]}},
    {id:'preview-result',sender:'合成文献助理',identity:'公共 AI',own:false,time:'开发预览',text:'成果卡片的展示样式',card:{kind:'result',title:'合成成果.txt',detail:'关联测试任务 · 交付版本 1',status:'测试：待验收',actions:[{id:'preview-result-open',label:'查看成果'}]}},
    {id:'preview-error',sender:'我的科研助理',identity:'个人 AI',own:false,time:'开发预览',text:'错误卡片的展示样式',card:{kind:'error',title:'模型不可用',detail:'合成错误，仅用于验证展示',status:'没有生成回复'}},
  ]},
]};
const source:ChatSource={async read(signal){signal.throwIfAborted();return structuredClone(snapshot);},async send(){throw new Error('开发预览：发送失败验证，输入已保留；没有调用模型。');},async act(){throw new Error('开发预览：受控动作没有执行；等待真实 API。');}};
if(new URLSearchParams(location.search).get('state')==='unavailable'){snapshot.conversations=[];snapshot.contacts=[];snapshot.notice='聊天接口待接通 · 合成空状态';delete source.send;delete source.act;}
void new ChatView(document.querySelector<HTMLElement>('#chat-root')!,source).mount();
