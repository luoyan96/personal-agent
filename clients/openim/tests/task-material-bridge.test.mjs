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
const accountIdentity = 'a'.repeat(64);
const esbuild = createRequire(require.resolve('vite'))('esbuild');
const bundled = await esbuild.build({ entryPoints: [path.join(client, 'electron/main/taskDshManage.ts')], bundle: true, platform: 'node', format: 'cjs', write: false,
  external: ['electron', './localDshRuntime', '@research-agent-platform/research-skills/import'],
  plugins: [{ name: 'isolated-window-authority', setup(build) { build.onLoad({filter:/teamLibraryManage\.ts$/},()=>({contents:'export const teamLibraryContext=e=>globalThis.teamLibraryFixture(e);',loader:'js'}));build.onLoad({ filter: /localFolderManage\.ts$/ }, () => ({ contents: 'export const authority=e=>({contents:e.sender});', loader: 'js' })); } }],
});
const runtimeCode = buildLocalDshRuntime(client).outputFiles[0].text;
async function fixture(t, library, kind = "research") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acceptcat-material-bridge-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'work'));
  const target = {kind,taskId:'synthetic-task'}, handlers = new Map(), timers=[];
  let hash = `#/workbench?task=synthetic-task&taskKind=${kind}`, picker = {canceled:false,filePaths:[path.join(root,'work')]};
  let valid = true, owned = true, scope = 'lab_shared', running = false, sessionId;
  let duringPicker = () => {}, uploads = 0, original;
  const downloadSizes=[], submissions=[];
  let fileDeliverySupported=true;
  let deliveryMode=false, collectionVersion=1, canSubmit=true, loseSubmit=false, conflictUpload=false, duringCollection=()=>{};
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
    dialog:{showOpenDialog:async()=>{duringPicker();return picker;},showSaveDialog:async()=>({canceled:false,filePath:path.join(root,'saved.pptx')})},
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
  const account={metadata:{memberId:'member_A'},identity:accountIdentity,lease:'one',csrf:'synthetic',valid:async()=>{if(!valid)throw Error('expired');},request:url=>respond(raw=>{
    const body=raw ? JSON.parse(raw) : undefined;
    if(url==='/api/v1/research-library/collections'&&body){duringCollection();deliveryMode=true;return{data:{id:'collection',name:body.name,scope:body.scope,taskIds:body.taskIds,owned:true,version:1}};}
    if(url.endsWith('/deliverables') || url.endsWith('/result')){submissions.push(body);if(loseSubmit){loseSubmit=false;throw Error('response lost');}return{data:{id:'delivery'}};}
    if(url==='/api/v1/health/ready')return{data:{status:'ok',contractVersion:'0.38.0'}};
    if(url==='/api/v1/tasks/synthetic-task')return{data:{task:{title:'Synthetic task',goal:'Local work',version:1,allowedActions:canSubmit?['submit']:[]},deliverables:submissions.map(item=>({sources:item.sources}))}};
    if(url==='/api/v1/work/tasks/synthetic-task')return{data:{title:'Synthetic task',goal:'Local work',version:1,fileDeliverySupported,allowedActions:canSubmit?['submit']:[],result:submissions.length?{sources:submissions.at(-1).sources||[]}:null}};
    if(url.startsWith('/api/v1/work-execution/'))return{data:{execution:null}};
    if(url.includes('/collections?'))return{data:[{id:'collection',name:'Synthetic',owned,scope:deliveryMode?'task_scoped':scope,taskIds:['synthetic-task'],version:collectionVersion,status:'available'}]};
    if(url==='/api/v1/research-library/files/file' && original)return{data:{file:{status:'available'},versions:[{version:1,filename:'saved.pptx',mediaType:'application/octet-stream',byteLength:original.length,sha256:createHash('sha256').update(original).digest('hex')}]}};
    if(url.startsWith('/api/v1/research-library/files/file/content')){const q=new URL('http://fixture'+url).searchParams,offset=Number(q.get('offset')),length=Number(q.get('length'));downloadSizes.push(length);return original.subarray(offset,offset+length);}
    if(url==='/api/v1/research-library/files/large-source')return{data:{file:{status:'available'},versions:[{version:1,filename:'large-source.pptx',byteLength:original.length,sha256:createHash('sha256').update(original).digest('hex')}]}};
    if(url.startsWith('/api/v1/research-library/files/large-source/content')){const q=new URL('http://fixture'+url).searchParams,offset=Number(q.get('offset')),length=Number(q.get('length'));downloadSizes.push(length);return original.subarray(offset,offset+length);}
    if(url.endsWith('/collections/collection/files')){if(conflictUpload){conflictUpload=false;collectionVersion++;throw Object.assign(Error('collection changed'),{code:'VERSION_CONFLICT'});}uploads++;collectionVersion++;return{data:{id:'file',version:1,sha256:body?.contentBase64?createHash('sha256').update(Buffer.from(body.contentBase64,'base64')).digest('hex'):'a'.repeat(64),extraction:'original_only'}};}
    return{data:{}};
  })};
  mod.exports.registerTaskDshBridge(async()=>({account,session:{},origin:'http://127.0.0.1:1'}));
  const call=(name,...args)=>handlers.get(name)({sender:{getURL:()=>`http://fixture/${hash}`}},target,...args);
  return {root,call,submissions,uploads:()=>uploads,revealed,downloadSizes,set:values=>{if('fileDeliverySupported'in values)fileDeliverySupported=values.fileDeliverySupported;if('conflictUpload'in values)conflictUpload=values.conflictUpload;if('duringCollection'in values)duringCollection=values.duringCollection;if('canSubmit'in values)canSubmit=values.canSubmit;if('loseSubmit'in values)loseSubmit=values.loseSubmit;if('original'in values)original=values.original;if('hash'in values)hash=values.hash;if('picker'in values)picker=values.picker;if('valid'in values)valid=values.valid;if('owned'in values)owned=values.owned;if('scope'in values)scope=values.scope;if('running'in values)running=values.running;if('duringPicker'in values)duringPicker=values.duringPicker;}};
}
test('native material picker cancels without reading, rechecks navigation after selection, and reveals only workspace files',async t=>{
  const f=await fixture(t);await f.call('task-dsh-open',true);
  const input=path.join(f.root,'input.txt');await fs.writeFile(input,'synthetic');
  f.set({picker:{canceled:true,filePaths:[]}});assert.equal(await f.call('task-dsh-add-local'),false);
  f.set({picker:{canceled:false,filePaths:[input]},duringPicker:()=>f.set({hash:'#/chat'})});
  await assert.rejects(f.call('task-dsh-add-local'),/任务工作页/);
  assert.deepEqual(await fs.readdir(path.join(f.root,'work')),[]);
  f.set({hash:'#/workbench?task=synthetic-task&taskKind=research',duringPicker:()=>{}});
  assert.equal(await f.call('task-dsh-add-local'),true);assert.equal(f.uploads(),0);
  await f.call('task-dsh-reveal');assert.equal(await fs.realpath(f.revealed[0]),await fs.realpath(path.join(f.root,'work')));
  await assert.rejects(f.call('task-dsh-reveal','../input.txt'),/路径/);
});

test('private files enter a task only through explicit import from the current account', async t => {
  const f = await fixture(t);
  await f.call('task-dsh-open', true);
  const home = path.join(f.root, 'personal-files');
  const mine = path.join(home, accountIdentity, 'myfiles');
  const other = path.join(home, 'b'.repeat(64), 'myfiles');
  await fs.mkdir(mine, { recursive: true });
  await fs.mkdir(other, { recursive: true });
  await fs.writeFile(path.join(mine, 'private.zip'), 'synthetic original');
  await fs.writeFile(path.join(other, 'other.txt'), 'different account');
  await assert.rejects(f.call('task-dsh-import-personal-library', [path.relative(mine, path.join(other, 'other.txt'))]), /不在登记/);
  assert.deepEqual(await fs.readdir(path.join(f.root, 'work')), []);
  await assert.rejects(f.call('task-dsh-import-library', ['private.zip']), /还没有登记课题组/);
  await f.call('task-dsh-import-personal-library', ['private.zip']);
  const state = await f.call('task-dsh-status');
  assert.equal(state.binding.localMaterials.length, 1);
  assert.equal(await fs.readFile(path.join(f.root, 'work', state.binding.localMaterials[0].localName), 'utf8'), 'synthetic original');
  assert.equal(await fs.readFile(path.join(mine, 'private.zip'), 'utf8'), 'synthetic original');
  assert.equal(f.uploads(), 0);
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
  f.set({hash:'#/workbench?view=team'});
  await assert.rejects(f.call('task-dsh-status'),/任务工作页/);
  f.set({hash:'#/workbench?view=team&task=synthetic-task&taskKind=research'});
  assert.equal((await f.call('task-dsh-open',false)).binding.taskId,'synthetic-task');
  assert.equal((await f.call('task-dsh-status')).binding.taskId,'synthetic-task');
  f.set({hash:'#/dsh?task=synthetic-task&taskKind=personal'});
  await assert.rejects(f.call('task-dsh-status'),/任务工作页/);
  f.set({hash:'#/dsh?task=synthetic-task&taskKind=research&mode=assistant'});
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

test('a template and figure are imported together with deduplicated project rules and source versions',async t=>{
  const git=await libraryFixture(t);
  const ppt=Buffer.from([80,75,0,255]),image=Buffer.from([137,80,78,71,0,13,10]);
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  await fs.writeFile(path.join(git.work,'组会模板.pptx'),ppt);
  await fs.writeFile(path.join(git.work,'实验图.png'),image);
  const template={...git.entry,id:'template1',name:'组会模板.pptx',purpose:'template',source:{kind:'git',path:'组会模板.pptx',sha256:hash(ppt)}};
  const figure={...git.entry,id:'figure1',name:'实验图.png',purpose:'figure',source:{kind:'git',path:'实验图.png',sha256:hash(image)}};
  await git.publish({...git.manifest,entries:[git.entry,template,figure]});
  const snapshot=await git.store.sync();
  const library={store:git.store,binding:git.binding,valid:async()=>{},current:async()=>{},memberId:'member_A'};
  const f=await fixture(t,library);await f.call('task-dsh-open',true);
  const selection={revision:snapshot.revision,entryId:template.id,entryIds:[template.id,figure.id,template.id],includeRules:true};
  const receipt=await f.call('task-dsh-import-team-library',selection);
  assert.equal(receipt.count,3);
  const materials=(await f.call('task-dsh-status')).binding.localMaterials;
  for(const [entry,bytes] of [[template,ppt],[figure,image]]){
    const copied=materials.find(item=>item.filename===entry.name);
    assert.deepEqual(await fs.readFile(path.join(f.root,'work',copied.localName)),bytes);
  }
  const provenance=materials.find(item=>item.filename.endsWith('.json'));
  const source=JSON.parse(await fs.readFile(path.join(f.root,'work',provenance.localName),'utf8'));
  assert.equal(source.revision,snapshot.revision);assert.equal(source.entries.length,3);
  await assert.rejects(f.call('task-dsh-import-team-library',{...selection,entryIds:['missing']}),/资料已变化/);
});

test('direct task delivery stages picker or drop, uploads task-scoped original and submits its immutable reference',async t=>{
  const f=await fixture(t);
  const input=path.join(f.root,'report.pptx');await fs.writeFile(input,'synthetic office original');
  f.set({picker:{canceled:true,filePaths:[]}});
  assert.deepEqual(Array.from(await f.call('task-dsh-stage-delivery')),[]);
  f.set({picker:{canceled:false,filePaths:[input]},duringPicker:()=>f.set({hash:'#/chat'})});
  await assert.rejects(f.call('task-dsh-stage-delivery'),/任务工作页/);
  f.set({hash:'#/workbench?task=synthetic-task&taskKind=research',duringPicker:()=>{}});
  const names=await f.call('task-dsh-stage-delivery',[input]);
  const state=await f.call('task-dsh-status');
  assert.equal(state.binding.submissionOnly,true);
  assert.equal(f.uploads(),0);
  await f.call('task-dsh-submit','Report',names);
  assert.equal(f.uploads(),1);
  assert.equal(f.submissions.length,1);
  assert.equal(f.submissions[0].sources[0].locator,`research-library:file:v1:${createHash('sha256').update('synthetic office original').digest('hex')}`);
  assert.equal((await f.call('task-dsh-status')).binding.delivery.status,'submitted');
});

test('delivery download verifies the current task reference and saves large originals in bounded chunks',async t=>{
  const f=await fixture(t);
  const original=Buffer.alloc(11*1048576+3,51);f.set({original});
  const locator=`research-library:file:v1:${createHash('sha256').update(original).digest('hex')}`;
  await assert.rejects(f.call('task-dsh-download-delivery',locator),/交付记录/);
  f.submissions.push({sources:[{locator}]});
  assert.equal(await f.call('task-dsh-download-delivery',locator),true);
  assert.deepEqual(await fs.readFile(path.join(f.root,'saved.pptx')),original);
  assert.equal(f.downloadSizes.length,12);
  assert(f.downloadSizes.every(size=>size<=1048576));
  await assert.rejects(f.call('task-dsh-download-delivery',locator.replace(/.$/,'a')),/交付记录/);
  f.set({valid:false});await assert.rejects(f.call('task-dsh-download-delivery',locator),/expired/);
});

test('lost delivery acknowledgement replays original intent after submit action disappears',async t=>{
  const f=await fixture(t), input=path.join(f.root,'report.pdf');
  await fs.writeFile(input,'synthetic report');
  const names=await f.call('task-dsh-stage-delivery',[input]);
  f.set({loseSubmit:true});
  await assert.rejects(f.call('task-dsh-submit','Report',names),/response lost/);
  f.set({canSubmit:false});
  await f.call('task-dsh-submit','Report',names);
  assert.equal(f.uploads(),1);
  assert.equal(f.submissions.length,2);
  assert.deepEqual(f.submissions[0],f.submissions[1]);
  assert.equal((await f.call('task-dsh-status')).binding.delivery.status,'submitted');
});

test('review-returned same-path output and same summary create a new delivery with the changed file',async t=>{
  const f=await fixture(t);await f.call('task-dsh-open',true);
  const output=path.join(f.root,'work','report.pdf');await fs.writeFile(output,'synthetic report v1');
  await f.call('task-dsh-submit','Report',['report.pdf']);
  const first=(await f.call('task-dsh-status')).binding.delivery.id;
  f.set({canSubmit:false});await f.call('task-dsh-submit','Report',['report.pdf']);
  assert.equal(f.submissions.length,1);
  await fs.writeFile(output,'synthetic report v2');f.set({canSubmit:true});
  await f.call('task-dsh-submit','Report',['report.pdf']);
  const second=(await f.call('task-dsh-status')).binding.delivery.id;
  assert.notEqual(first,second);
  assert.equal(f.submissions.length,2);assert.equal(f.uploads(),2);
  assert.notEqual(f.submissions[0].sources[0].locator,f.submissions[1].sources[0].locator);
  assert.equal(f.submissions[1].sources[0].locator,`research-library:file:v1:${createHash('sha256').update('synthetic report v2').digest('hex')}`);
});
test('file replacement after confirmation hash and before archive snapshot cannot upload changed bytes',async t=>{
  for(const size of [37,11*1048576]){
    const f=await fixture(t), input=path.join(f.root,'report.pptx');
    await fs.writeFile(input,Buffer.alloc(size,51));
    const names=await f.call('task-dsh-stage-delivery',[input]);
    const state=await f.call('task-dsh-status');
    f.set({duringCollection:()=>require('node:fs').writeFileSync(path.join(state.binding.directory,names[0]),Buffer.alloc(size,52))});
    await assert.rejects(f.call('task-dsh-submit','Report',names),/文件已经变化/);
    assert.equal(f.uploads(),0);assert.equal(f.submissions.length,0);
    assert.equal((await fs.readdir(path.dirname(path.dirname(state.binding.directory)))).some(name=>name.endsWith('.snapshot')),false);
  }
});

test('definite automatic collection conflict retries the frozen batch with the current collection version',async t=>{
  const f=await fixture(t), input=path.join(f.root,'report.pdf');await fs.writeFile(input,'synthetic report');
  const names=await f.call('task-dsh-stage-delivery',[input]);
  f.set({conflictUpload:true});await assert.rejects(f.call('task-dsh-submit','Report',names),/collection changed/);
  assert.equal((await f.call('task-dsh-status')).binding.archive.versionConflict,true);
  await f.call('task-dsh-submit','Report',names);
  assert.equal(f.uploads(),1);assert.equal(f.submissions.length,1);
  assert.equal((await f.call('task-dsh-status')).binding.delivery.status,'submitted');
});


test('personal direct file delivery uses the same verified upload, receipt, and authorized download',async t=>{
  const f=await fixture(t,undefined,'personal'),input=path.join(f.root,'report.pptx'),bytes=Buffer.from('synthetic personal original');
  await fs.writeFile(input,bytes);f.set({original:bytes});
  const names=await f.call('task-dsh-stage-delivery',[input]);
  await f.call('task-dsh-submit','Personal report',names);
  assert.equal(f.uploads(),1);
  assert.equal(f.submissions.length,1);
  assert.equal(f.submissions[0].text,'Personal report');
  const locator=f.submissions[0].sources[0].locator;
  assert.equal(await f.call('task-dsh-download-delivery',locator),true);
  assert.deepEqual(await fs.readFile(path.join(f.root,'saved.pptx')),bytes);
  await assert.rejects(f.call('task-dsh-download-delivery',locator.replace(/.$/,'a')),/交付记录/);
});
test('an old personal backend rejects file selection before uploading while exact text still submits',async t=>{
  const f=await fixture(t,undefined,'personal');f.set({fileDeliverySupported:false});
  await assert.rejects(f.call('task-dsh-stage-delivery',[path.join(f.root,'absent.pptx')]),/升级配套后台/);
  assert.equal(f.uploads(),0);
  await f.call('task-dsh-submit','Exact personal text',[]);
  assert.equal(f.submissions[0].text,'Exact personal text');
  assert.equal(f.submissions[0].sources,undefined);
});
