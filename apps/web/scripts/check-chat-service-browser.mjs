// Actual baseline API + password sessions + SQLite. CHAT1=501 is expected until
// the controller supplies an implemented backend. Never intercept success responses.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const out=resolve('.runtime/chat-service-'+Date.now());await mkdir(out,{recursive:true});
const base='http://127.0.0.1:4187',apiURL='http://127.0.0.1:3196';
const env={...process.env,NODE_ENV:'test',DATABASE_PATH:resolve(out,'synthetic.sqlite'),BLOB_ROOT:resolve(out,'blobs'),TEST_CREDENTIALS_FILE:resolve(out,'synthetic-credentials.json'),APP_ORIGIN:base,PORT:'3196',B3_AI_ENABLED:'0',RESEARCH_CHAT_API_TARGET:apiURL};
for(const key of ['DEEPSEEK_API_KEY','LAB_CREDENTIAL_KEY_FILE','DEV_AUTH_MEMBER','FIXTURE_MODE','AUTH_BYPASS'])delete env[key];
const children=[];
async function command(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:process.cwd(),env,windowsHide:true,stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Baseline setup failed: '+errors)));});}
function start(args){const child=spawn(process.execPath,args,{cwd:process.cwd(),env,windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);return child;}
async function ready(url,child){for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error('Own local child exited');try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('Local readiness timeout');}
for(const url of [base,apiURL+'/api/v1/health/live']){let occupied=false;try{await fetch(url);occupied=true;}catch{}assert(!occupied,'Refuse to replace an existing listener: '+url);}
let browser;
const records=[],errors=[],posts=[],consoleLogs=[];
try{
 await command(['apps/api/dist/manage.js','migrate']);await command(['apps/api/dist/manage.js','seed']);await command(['apps/api/dist/credentials.js']);
 const api=start(['apps/api/dist/main.js']);await ready(apiURL+'/api/v1/health/ready',api);
 const web=start(['apps/web/node_modules/vite/bin/vite.js','apps/web','--host','127.0.0.1','--port','4187','--config',resolve('apps/web/vite.config.ts')]);await ready(base,web);
 const accounts=JSON.parse(await readFile(env.TEST_CREDENTIALS_FILE,'utf8'));assert(accounts.every(a=>/^member_[ABC]$/.test(a.memberId)));
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/chat/'))posts.push({url:r.url(),key:r.headers()['idempotency-key']});});
 page.on('console',message=>{if(['error','warning'].includes(message.type()))consoleLogs.push(message.text());});
 async function login(account){await page.goto(base+'/#/login');await page.getByRole('textbox',{name:'账号',exact:true}).fill(account.username);await page.getByLabel('密码',{exact:true}).fill(account.password);await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('heading',{name:'我的科研助理',exact:true}).waitFor();await page.getByText('发送待接通 · 输入不会触发执行',{exact:true}).waitFor();}
 await login(accounts[0]);assert.equal(await page.title(),'科研聊天 · Research Agent Platform');assert.equal(await page.locator('.chat-message').count(),0);
 assert.equal(await page.getByRole('button',{name:'发送',exact:true}).isDisabled(),true);assert(posts.length>=1);assert(posts.every(p=>p.key?.length>=16));
 records.push('真实密码/SQLite会话；ensure个人助理真实501；无演示历史/成功回复/模型执行');
 const input=page.getByRole('textbox',{name:'消息',exact:true});await input.fill('A 的合成草稿');await page.getByRole('button',{name:'刷新会话',exact:true}).click();assert.equal(await input.inputValue(),'A 的合成草稿');
 await page.getByRole('link',{name:'任务与协作',exact:true}).click();await page.getByRole('heading',{name:'先处理与你有关的事',exact:true}).waitFor();await page.getByRole('link',{name:'需求入口',exact:true}).click();await page.getByRole('heading',{name:'我的科研助理',exact:true}).waitFor();assert.equal(await input.inputValue(),'A 的合成草稿');
 await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.getByRole('heading',{name:'登录',exact:true}).waitFor();await login(accounts[1]);assert.equal(await input.inputValue(),'');records.push('真实刷新/旧协作入口留稿，退出并换B账号清除A输入');
 for(const width of [390,320]) {await page.setViewportSize({width,height:844});await page.locator('[data-personal]').click();await page.getByRole('heading',{name:'我的科研助理',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:resolve(out,`actual-501-${width}.png`)});await page.getByRole('button',{name:'返回会话列表',exact:true}).click();}
 records.push('真实服务错误页面390/320px无横向溢出、会话列表切换');assert.deepEqual(errors,[]);assert.equal(await page.locator('vite-error-overlay').count(),0);
 assert(consoleLogs.every(log=>log.includes('501')&&log.includes('Failed to load resource')),'Unexpected browser warning/error: '+consoleLogs.join('; '));
 await writeFile(resolve(out,'results.json'),JSON.stringify({base,apiURL,records,posts:posts.length,errors,consoleLogs,expected:'CHAT1 501 baseline; no live model or successful CHAT1 flow'},null,2));console.log(JSON.stringify({records,errors,expected501ConsoleLogs:consoleLogs.length,out},null,2));
}finally {await browser?.close();for(const child of children)if(child.exitCode===null)child.kill();}
