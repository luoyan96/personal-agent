import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildLocalDshRuntime } from '../../../integrations/deepseek-harness/desktop/build.mjs';
import { libraryFixture } from './helpers/team-library.mjs';
const require = createRequire(import.meta.url), client = fileURLToPath(new URL('../', import.meta.url));
const esbuild = createRequire(require.resolve('vite'))('esbuild');
const bundled = await esbuild.build({ entryPoints: [path.join(client, 'electron/main/taskDshManage.ts')], bundle: true, platform: 'node', format: 'cjs', write: false,
  external: ['electron', './localDshRuntime', '@research-agent-platform/research-skills/import'],
  plugins: [{ name: 'isolated-window-authority', setup(build) { build.onLoad({filter:/teamLibraryManage\.ts$/},()=>({contents:'export const teamLibraryContext=e=>globalThis.teamLibraryFixture(e);',loader:'js'}));build.onLoad({ filter: /localFolderManage\.ts$/ }, () => ({ contents: 'export const authority=e=>({contents:e.sender});', loader: 'js' })); } }],
});
const runtimeCode = buildLocalDshRuntime(client).outputFiles[0].text;
async function fixture(t, library) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acceptcat-material-bridge-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'work'));
  const target = {kind:'research',taskId:'synthetic-task'}, handlers = new Map(), timers=[];
  let hash = '#/workbench?task=synthetic-task', picker = {canceled:false,filePaths:[path.join(root,'work')]};
  let valid = true, owned = true, scope = 'lab_shared', running = false, sessionId;
  let duringPicker = () => {}, uploads = 0, original;
  const downloadSizes=[];
  const revealed = [];
  const respond = resolve => {
    const req = new EventEmitter();req.setHeader = () => {};req.abort = () => {};
    req.end = body => queueMicrotask(() => {
      try { const res=new EventEmitter();res.statusCode=200;req.emit('response',res);const value=resolve(body);res.emit('data',Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)));res.emit('end'); }
      catch(e){req.emit('error',e);}
    });return req;
  };
  const electron = {
    app:{getPath:()=>root,getAppPath:()=>client},BrowserWindow:{fromWebContents:()=>({})},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},
    dialog:{showOpenDialog:async()=>{duringPicker();return picker;}},
    shell:{openPath:async file=>{revealed.push(file);return '';},showItemInFolder:file=>revealed.push(file)},
    net:{request:()=>respond(raw=>{
      const {method,payload}=JSON.parse(raw),args=payload.args.request;
      let value={};
      if(method==='session/projections')value=sessionId===args.sessionId?{kind:'sequenced',asOfSeq:0}:null;
      if(method==='workspace/create')value={workspace:{workspaceId:'local'}};
      if(method==='session/create'){sessionId=args.sessionId;value={sessionId};}
      if(method==='session/page')value={records:[],hasMore:false};
      if(method==='session/list')value={items:[{sessionId,running}]};
      return{result:{ok:true,value}};
    })},
  };
  const runtime={exports:{}};
  vm.runInNewContext(runtimeCode,{module:runtime,exports:runtime.exports,require,process,Buffer,TextEncoder,URL,setTimeout,clearTimeout,
    setInterval:(fn,ms)=>{const id=setInterval(fn,ms);timers.push(id);return id;},clearInterval});
  t.after(()=>timers.forEach(clearInterval));
  const mod={exports:{}};
  vm.runInNewContext(bundled.outputFiles[0].text,{module:mod,exports:mod.exports,teamLibraryFixture:()=>library,require:id=>id==='electron'?electron:id==='./localDshRuntime'?runtime.exports:require(id),process,Buffer,TextEncoder,URL,URLSearchParams,setTimeout,clearTimeout});
  const account={metadata:{memberId:'member_A'},identity:'synthetic',lease:'one',csrf:'synthetic',valid:async()=>{if(!valid)throw Error('expired');},request:url=>respond(()=>{
    if(url==='/api/v1/health/ready')return{data:{status:'ok',contractVersion:'0.38.0'}};
    if(url==='/api/v1/tasks/synthetic-task')return{data:{task:{title:'Synthetic task',goal:'Local work',version:1,allowedActions:['submit']}}};
    if(url.startsWith('/api/v1/work-execution/'))return{data:{execution:null}};
    if(url.includes('/collections?'))return{data:[{id:'collection',name:'Synthetic',owned,scope,status:'available'}]};
    if(url==='/api/v1/research-library/files/large-source')return{data:{file:{status:'available'},versions:[{version:1,filename:'large-source.pptx',byteLength:original.length,sha256:createHash('sha256').update(original).digest('hex')}]}};
    if(url.startsWith('/api/v1/research-library/files/large-source/content')){const q=new URL('http://fixture'+url).searchParams,offset=Number(q.get('offset')),length=Number(q.get('length'));downloadSizes.push(length);return original.subarray(offset,offset+length);}
    if(url.endsWith('/collections/collection/files')){uploads++;return{data:{id:'file',version:1,sha256:'a'.repeat(64),extraction:'original_only'}};}
    return{data:{}};
  })};
  mod.exports.registerTaskDshBridge(async()=>({account,session:{},origin:'http://127.0.0.1:1'}));
  const call=(name,...args)=>handlers.get(name)({sender:{getURL:()=>`http://fixture/${hash}`}},target,...args);
  return {root,call,uploads:()=>uploads,revealed,downloadSizes,set:values=>{if('original'in values)original=values.original;if('hash'in values)hash=values.hash;if('picker'in values)picker=values.picker;if('valid'in values)valid=values.valid;if('owned'in values)owned=values.owned;if('scope'in values)scope=values.scope;if('running'in values)running=values.running;if('duringPicker'in values)duringPicker=values.duringPicker;}};
}
test('direct delivery picker stages files without opening a work folder and rechecks navigation',async t=>{
  const f=await fixture(t);
  const input=path.join(f.root,'result.txt');await fs.writeFile(input,'synthetic result');
  f.set({picker:{canceled:true,filePaths:[]}});
  assert.equal((await f.call('task-dsh-add-deliverables')).length,0);
  f.set({picker:{canceled:false,filePaths:[input]},duringPicker:()=>f.set({hash:'#/chat'})});
  await assert.rejects(f.call('task-dsh-add-deliverables'),/任务工作页/);
  f.set({hash:'#/workbench?task=synthetic-task',duringPicker:()=>{}});
  const names=await f.call('task-dsh-add-deliverables');
  assert.equal(names.length,1);
  const state=await f.call('task-dsh-status');
  assert.equal(state.binding.submissionOnly,true);
  assert.equal(state.files[0].name,names[0]);
  assert.equal(f.uploads(),0);
});

test('native material picker cancels without reading, rechecks navigation after selection, and reveals only workspace files',async t=>{
  const f=await fixture(t);await f.call('task-dsh-open',true);
  const input=path.join(f.root,'input.txt');await fs.writeFile(input,'synthetic');
  f.set({picker:{canceled:true,filePaths:[]}});assert.equal(await f.call('task-dsh-add-local'),false);
  f.set({picker:{canceled:false,filePaths:[input]},duringPicker:()=>f.set({hash:'#/chat'})});
  await assert.rejects(f.call('task-dsh-add-local'),/任务工作页/);
  assert.deepEqual(await fs.readdir(path.join(f.root,'work')),[]);
  f.set({hash:'#/workbench?task=synthetic-task',duringPicker:()=>{}});
  assert.equal(await f.call('task-dsh-add-local'),true);assert.equal(f.uploads(),0);
  await f.call('task-dsh-reveal');assert.equal(await fs.realpath(f.revealed[0]),await fs.realpath(path.join(f.root,'work')));
  await assert.rejects(f.call('task-dsh-reveal','../input.txt'),/路径/);
});
test('archive IPC enforces writable collection, confirmed sharing scope, idle local host and current account',async t=>{
  const f=await fixture(t);await f.call('task-dsh-open',true);await fs.writeFile(path.join(f.root,'work','plan.pptx'),'synthetic');
  const selection={requestId:'archive_native_fixture_001',collectionId:'collection',collectionName:'Synthetic',scope:'lab_shared',expectedCollectionVersion:1,names:['plan.pptx']};
  f.set({owned:false});await assert.rejects(f.call('task-dsh-archive',selection),/可写/);
  f.set({owned:true,scope:'public'});await assert.rejects(f.call('task-dsh-archive',selection),/共享范围/);
  f.set({scope:'lab_shared',running:true});await assert.rejects(f.call('task-dsh-archive',selection),/本轮结束/);
  assert.equal(f.uploads(),0);
  f.set({running:false});assert.equal((await f.call('task-dsh-archive',selection)).status,'archived');assert.equal(f.uploads(),1);
  f.set({valid:false});await assert.rejects(f.call('task-dsh-archive',selection),/expired/);assert.equal(f.uploads(),1);
});

test('large shared original uses bounded authenticated download requests and lands as an intact working file',async t=>{
  const f=await fixture(t);await f.call('task-dsh-open',true);
  const original=Buffer.alloc(11*1048576+7,51);f.set({original});
  const result=await f.call('task-dsh-import',{kind:'library',id:'large-source',version:1});
  assert.equal(f.downloadSizes.length,12);assert(f.downloadSizes.every(n=>n>0&&n<=1048576));
  assert.deepEqual(await fs.readFile(path.join(f.root,'work',result.localName)),original);
  assert.equal(f.uploads(),0);
});

test('the task page and the workbench route may both work on the same task, and nothing else may',async t=>{
  const f=await fixture(t);
  f.set({hash:'#/dsh?task=synthetic-task'});
  assert.equal((await f.call('task-dsh-open',false)).binding.taskId,'synthetic-task');
  assert.equal((await f.call('task-dsh-status')).binding.taskId,'synthetic-task');
  f.set({hash:'#/dsh?task=another-task'});
  await assert.rejects(f.call('task-dsh-status'),/任务工作页/);
  f.set({hash:'#/chat?task=synthetic-task'});
  await assert.rejects(f.call('task-dsh-status'),/任务工作页/);
});

test('published Git original → native IPC → task folder preserves the exact bytes and source revision',async t=>{
  const git=await libraryFixture(t),snapshot=await git.store.sync();
  const library={store:git.store,binding:git.binding,valid:async()=>{},current:async()=>{},memberId:'member_A'};
  const f=await fixture(t,library);await f.call('task-dsh-open',true);
  const receipt=await f.call('task-dsh-import-team-library',{revision:snapshot.revision,entryId:git.entry.id,includeRules:true});
  assert.equal(receipt.count,1);assert.equal(receipt.revision,snapshot.revision);
  const status=await f.call('task-dsh-status'),materials=status.binding.localMaterials;
  const original=materials.find(m=>m.filename===git.entry.name),provenance=materials.find(m=>m.filename.endsWith('.json'));
  assert.equal(await fs.readFile(path.join(f.root,'work',original.localName),'utf8'),git.text);
  const source=JSON.parse(await fs.readFile(path.join(f.root,'work',provenance.localName),'utf8'));
  assert.equal(source.revision,snapshot.revision);assert.equal(source.entries[0].sha256,git.entry.source.sha256);
  assert.equal(f.uploads(),0);
  library.memberId='member_B';await assert.rejects(f.call('task-dsh-import-team-library',{revision:snapshot.revision,entryId:git.entry.id}),/账号不一致/);
});
