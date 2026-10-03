// Layout milestone: synthetic UI only, no API credentials or model calls.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const base=process.env.CHAT_PREVIEW_URL??'http://127.0.0.1:4186/?chat-preview=1';
const out=resolve(process.env.CHAT_EVIDENCE_DIR??'.runtime/chat-browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const logs=[];page.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.text());});
const results=[];
try {
 await page.goto(base);await page.getByRole('heading',{name:'我的科研助理'}).waitFor();
 assert.equal(await page.title(),'科研聊天开发预览');
 await page.screenshot({path:resolve(out,'desktop.png')});
 await page.getByRole('button',{name:'通讯录',exact:true}).click();
 await page.getByRole('textbox',{name:'搜索会话或联系人'}).fill('真人');
 assert.equal(await page.locator('[data-contact]').count(),1);
 await page.locator('[data-contact]').click();await page.getByText('私聊入口待接通。',{exact:false}).waitFor();
 results.push('通讯录身份/归属/状态与搜索、未接通私聊提示');
 await page.getByRole('button',{name:'会话',exact:true}).click();
 await page.locator('[data-conversation="preview-group"]').click();
 await page.getByRole('button',{name:'查看群成员'}).click();
 assert.equal(await page.getByRole('button',{name:'查看群成员'}).getAttribute('aria-expanded'),'true');
 assert.equal(await page.locator('.chat-card').count(),4);
 await page.screenshot({path:resolve(out,'group-cards.png')});
 const input=page.getByRole('textbox',{name:'消息',exact:true});
 await input.fill('@');await page.getByRole('listbox').getByRole('option').first().waitFor();await input.press('ArrowDown');await input.press('Enter');
 assert.equal(await input.inputValue(),'@合成成员林 ');
 await input.press('Shift+Enter');assert((await input.inputValue()).includes('\n'));
 await input.fill('@');await input.press('Escape');assert.equal(await page.getByRole('listbox').isVisible(),false);
 await input.fill('保留失败输入');await input.press('Enter');await page.getByText('开发预览：发送失败验证，输入已保留；没有调用模型。',{exact:true}).waitFor();
 assert.equal(await input.inputValue(),'保留失败输入');
 await input.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})));
 await input.press('Enter');assert((await input.inputValue()).includes('保留失败输入'));assert.equal(await input.isDisabled(),false);
 await input.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
 results.push('群成员、四类卡片、@方向键/Enter/Escape、Shift+Enter、IME、失败保留输入');
 // Inject a synthetic source into the same production component to assert ID binding and late-read disposal.
 await page.evaluate(async()=>{
  const {ChatView}=await import('/src/chat-view.ts');
  const root=document.querySelector('#chat-root');
  const contact={id:'opaque-human-id',name:'同名联系人',identity:'真人',owner:'合成主人',availability:'待承接',icon:'user'};
  const second={...contact,id:'opaque-second-id',name:'另一位联系人'},ai={...contact,id:'opaque-ai-id',name:'群内助理',identity:'个人 AI',icon:'robot'};
  const data={notice:'注入测试源',contacts:[contact,second,ai],conversations:[{id:'opaque-chat-id',title:'ID 绑定测试群',subtitle:'合成测试',preview:'测试',pinned:false,group:true,members:[contact,second,ai],canSend:true,messages:[],sendTargets:[{id:ai.id,label:ai.name}],contextChoices:[{key:'task:opaque-task-id:3',label:'任务：合成任务 · v3'},{key:'artifact:opaque-artifact-id:1',label:'合成文本.txt · v1',requiresKey:'task:opaque-task-id:3'}],uploadTasks:[{id:'opaque-task-id',label:'合成任务',version:3}]}]};
  window.chatTest={calls:[],actions:[],reads:0,uploads:[]};
  window.chatTest.view=new ChatView(root,{pollIntervalMs:100,read:async()=>{window.chatTest.reads++;return structuredClone(data);},send:async(id,text,mentions,signal,target,contextKeys)=>{window.chatTest.calls.push({id,text,mentions,target,contextKeys});throw new Error('合成失败');},uploadText:async(id,taskId,filename,text,signal,version)=>{window.chatTest.uploads.push({id,taskId,filename,text,version});throw new Error('合成上传失败，文本保留');}});
  await window.chatTest.view.mount();
 });
 await input.fill('@');await input.press('Enter');await input.press('Home');await input.type('前缀 ');await input.press('End');await input.type('完成任务');await input.press('Enter');
 const calls=await page.evaluate(()=>window.chatTest.calls);
 assert.equal(calls.length,1);assert.equal(calls[0].mentions[0].contactId,'opaque-human-id');assert.equal(calls[0].mentions[0].start,3);
 await input.fill('编辑掉提及');await input.press('Enter');assert.equal((await page.evaluate(()=>window.chatTest.calls))[1].mentions.length,0);
 await input.fill('@另一位');await input.press('Enter');await input.press('Home');await input.type('@同名');await input.press('Enter');await input.press('End');await input.type('请协作');await input.press('Enter');
 const multi=(await page.evaluate(()=>window.chatTest.calls))[2];assert.deepEqual(multi.mentions.map(m=>m.contactId),['opaque-human-id','opaque-second-id']);assert(multi.mentions[0].start<multi.mentions[1].start);
 await input.fill('让助理安排');await page.getByRole('combobox',{name:'发送方式',exact:true}).selectOption('arrange');assert.equal(await page.getByRole('button',{name:'发送',exact:true}).isDisabled(),true);
 await page.getByRole('combobox',{name:'群内 AI',exact:true}).selectOption('opaque-ai-id');await input.press('Enter');assert.equal((await page.evaluate(()=>window.chatTest.calls)).at(-1).target,'opaque-ai-id');
 await input.fill('保持光标与输入');await input.focus();await input.evaluate(el=>{el.setSelectionRange(2,2);window.chatTest.input=el;window.chatTest.readStart=window.chatTest.reads;});
 await page.waitForFunction(()=>window.chatTest.reads>window.chatTest.readStart+1);
 assert.deepEqual(await input.evaluate(el=>({same:el===window.chatTest.input,text:el.value,caret:el.selectionStart,focused:document.activeElement===el})),{same:true,text:'保持光标与输入',caret:2,focused:true});
 await input.evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));window.chatTest.readStart=window.chatTest.reads;});await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.chatTest.reads===window.chatTest.readStart),true);
 await input.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
 await page.getByText('材料与授权（仅勾选内容给 AI）',{exact:true}).click();await page.getByLabel('合成文本.txt · v1',{exact:true}).check();assert.equal(await page.getByLabel('任务：合成任务 · v3',{exact:true}).isChecked(),true);
 await input.fill('只提供已勾选材料');await input.press('Enter');assert.deepEqual(new Set((await page.evaluate(()=>window.chatTest.calls)).at(-1).contextKeys),new Set(['artifact:opaque-artifact-id:1','task:opaque-task-id:3']));
 await page.getByText('材料与授权（仅勾选内容给 AI）',{exact:true}).click();await page.getByRole('button',{name:'上传文本材料',exact:true}).click();await page.getByLabel('文件名',{exact:true}).fill('合成.txt');await page.getByLabel('文本内容',{exact:true}).fill('合成文本：12');await page.getByRole('button',{name:'上传到此任务',exact:true}).click();await page.getByText('合成上传失败，文本保留',{exact:true}).waitFor();assert.equal(await page.getByLabel('文本内容',{exact:true}).inputValue(),'合成文本：12');assert.deepEqual((await page.evaluate(()=>window.chatTest.uploads))[0],{id:'opaque-chat-id',taskId:'opaque-task-id',filename:'合成.txt',text:'合成文本：12',version:3});await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.evaluate(()=>window.chatTest.view.dispose());
 results.push('@提及 ID 绑定、前缀/多提及排序/删除，明确安排/材料勾选/上传失败留稿，轮询保留textarea/caret/focus与IME');
 for(const width of [390,320]) {
  await page.setViewportSize({width,height:844});await page.goto(base);
  if(await page.getByRole('button',{name:'返回会话列表',exact:true}).isVisible())await page.getByRole('button',{name:'返回会话列表',exact:true}).click();
  await page.locator('[data-conversation="preview-private"]').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('[data-conversation="preview-group"]').click();
  await page.getByRole('heading',{name:'合成任务群'}).waitFor();
  await input.fill('@');await page.getByRole('listbox').getByRole('option').first().waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:resolve(out,`mobile-${width}.png`)});
  await input.press('Escape');await page.getByRole('button',{name:'返回会话列表'}).click();
  await page.getByRole('button',{name:'通讯录',exact:true}).click();await page.getByRole('textbox',{name:'搜索会话或联系人'}).fill('公共 AI');assert.equal(await page.locator('[data-contact]').count(),1);
  results.push(`${width}px 列表/聊天切换、通讯录筛选、@菜单、无横向溢出`);
 }
 await page.goto(base+'&state=unavailable');await page.locator('[data-personal]').click();
 await page.getByRole('heading',{name:'会话服务待接通'}).waitFor();
 await input.fill('待接通输入');assert.equal(await page.getByRole('button',{name:'发送',exact:true}).isDisabled(),true);
 await page.screenshot({path:resolve(out,'unavailable-320.png')});
 results.push('待接通状态不生成会话/消息，发送禁用且可写草稿');
 if(process.env.CHAT_REFERENCE_HTML) {
  await page.setViewportSize({width:1280,height:900});
  await page.setContent(await readFile(process.env.CHAT_REFERENCE_HTML,'utf8'));
  await page.screenshot({path:resolve(out,'selected-reference.png')});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(logs,[]);
 await writeFile(resolve(out,'results.json'),JSON.stringify({base,results,errors,logs,browser:'Edge / Playwright; Browser plugin not available'},null,2));
 console.log(JSON.stringify({passed:results.length,results,errors,logs,out},null,2));
} finally {await browser.close();}
