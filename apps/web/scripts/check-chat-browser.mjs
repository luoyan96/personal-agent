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
 await input.fill('@');await page.getByRole('option').first().waitFor();await input.press('ArrowDown');await input.press('Enter');
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
  const data={notice:'注入测试源',contacts:[contact],conversations:[{id:'opaque-chat-id',title:'ID 绑定测试群',subtitle:'合成测试',preview:'测试',pinned:false,group:true,members:[contact],canSend:true,messages:[]}]};
  window.chatTest={calls:[],actions:[]};
  window.chatTest.view=new ChatView(root,{read:async()=>structuredClone(data),send:async(id,text,mentions)=>{window.chatTest.calls.push({id,text,mentions});throw new Error('合成失败');}});
  await window.chatTest.view.mount();
 });
 await input.fill('@');await input.press('Enter');await input.press('Home');await input.type('前缀 ');await input.press('End');await input.type('完成任务');await input.press('Enter');
 const calls=await page.evaluate(()=>window.chatTest.calls);
 assert.equal(calls.length,1);assert.equal(calls[0].mentions[0].contactId,'opaque-human-id');assert.equal(calls[0].mentions[0].start,3);
 await input.fill('编辑掉提及');await input.press('Enter');assert.equal((await page.evaluate(()=>window.chatTest.calls))[1].mentions.length,0);
 await page.evaluate(()=>window.chatTest.view.dispose());
 results.push('@提及 ID 绑定、前缀编辑偏移更新、删除提及解除绑定');
 for(const width of [390,320]) {
  await page.setViewportSize({width,height:844});await page.goto(base);
  await page.locator('[data-conversation="preview-private"]').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('[data-conversation="preview-group"]').click();
  await page.getByRole('heading',{name:'合成任务群'}).waitFor();
  await input.fill('@');await page.getByRole('option').first().waitFor();
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
