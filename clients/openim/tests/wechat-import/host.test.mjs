import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {registerWeChatImport} from '../../electron/wechat-import/electron.mjs';
import {makeZip,text} from './fixtures.mjs';
const client=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(path.join(client,'package.json'));
const esbuild=createRequire(require.resolve('vite'))('esbuild');
const build=await esbuild.build({entryPoints:[path.join(client,'electron/main/wechatImportManage.ts')],bundle:true,write:false,platform:'node',format:'cjs',
 external:['electron','./wechatImportRuntime'],plugins:[{name:'host-fixture',setup(b){
 b.onLoad({filter:/localFolderManage\.ts$/},()=>({contents:'export const authority=e=>{if(!e.trusted)throw Error("untrusted");return {owner:e.owner,contents:{}}};',loader:'js'}));
 b.onLoad({filter:/chatHistoryManage\.ts$/},()=>({contents:'export const credentials=e=>globalThis.getCredentials(e);export const sessionMemberId=async c=>"member_synthetic";',loader:'js'}));
 b.onLoad({filter:/windowManage\.ts$/},()=>({contents:'export const getWebContents=()=>({send:()=>{}});',loader:'js'}));
 }}]});
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'acceptcat-wechat-host-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const archive=path.join(root,'synthetic.zip');await fs.writeFile(archive,makeZip([{name:'聊天记录.txt',text},{name:'image.png',text:'synthetic image'}]));
 const handlers=new Map(),cleanup=[];let token='session_one',during=()=>{},cancelled=false;
 const event={trusted:true,owner:'window_one'};
 const electron={app:{getPath:()=>root,once:(_name,fn)=>cleanup.push(fn)},BrowserWindow:{fromWebContents:()=>({isDestroyed:()=>false})},
 dialog:{showOpenDialog:async()=>{await during();return {canceled:cancelled,filePaths:[archive]};}},ipcMain:{handle:(name,fn)=>handlers.set(name,fn),removeHandler:name=>handlers.delete(name)}};
 const module={exports:{}};
 vm.runInNewContext(build.outputFiles[0].text,{module,exports:module.exports,Buffer,URL,process:{env:{LOCALAPPDATA:root}},getCredentials:async e=>({token,owner:e.owner,service:'https://fixture',session:{}}),
 require:name=>name==='electron'?electron:name==='./wechatImportRuntime'?{registerWeChatImport}:require(name)});
 module.exports.registerWeChatImportBridge();t.after(()=>cleanup.forEach(fn=>fn()));
 const call=(name,...args)=>handlers.get(name)(event,...args);
 const context=()=>call('wechat-import-context',{conversationID:'conversation_synthetic',memberId:'member_synthetic',visit:'11111111-1111-1111-1111-111111111111'});
 return {root,event,call,context,receive:module.exports.receiveWindowsShare,set:values=>{if('token'in values)token=values.token;if('during'in values)during=values.during;if('cancelled'in values)cancelled=values.cancelled;}};
}
test('native scope is issued by the host and expires on cookie, conversation revisit, and untrusted frame changes',async t=>{
 const f=await fixture(t);let scope=await f.context();
 const preview=await f.call('wechat-import:choose',scope);
 assert.equal(preview.rawText,text);assert.equal(preview.attachments.length,1);
 const next=await f.context();assert.notEqual(next,scope);
 await assert.rejects(f.call('wechat-import:read',scope,preview.token,'original'),/会话/);
 scope=next;const second=await f.call('wechat-import:choose',scope);
 f.set({token:'different'});await assert.rejects(f.call('wechat-import:read',scope,second.token,'original'),/账号/);
 f.event.trusted=false;await assert.rejects(f.context(),/untrusted/);
});
test('switching away while the OS picker is open cannot deliver a preview to the new chat',async t=>{
 const f=await fixture(t),scope=await f.context();
 f.set({during:()=>f.call('wechat-import-context',null)});
 await assert.rejects(f.call('wechat-import:choose',scope),/会话/);
});
test('cold/second-instance activation accepts only staged application batches and exposes no local paths',async t=>{
 const f=await fixture(t),scope=await f.context(),id='a'.repeat(32);
 const directory=path.join(f.root,'AcceptCat','ShareInbox',id);await fs.mkdir(directory,{recursive:true});
 await fs.writeFile(path.join(directory,'source.zip'),makeZip([{name:'聊天记录.txt',text}]));
 await fs.writeFile(path.join(directory,'metadata.json'),JSON.stringify({id,name:'shared.zip'}));
 await f.receive(['--acceptcat-share='+id]);await f.receive(['--acceptcat-share='+id]);
 const pending=await f.call('wechat-import-pending',scope);assert.equal(pending.length,1);assert.equal(pending[0].file,undefined);
 const preview=await f.call('wechat-import:choose',scope,id);assert.equal(preview.archiveName,'shared.zip');assert.equal(preview.rawText,text);
 await assert.rejects(f.call('wechat-import:choose',scope,'../private'),/无效|待处理/);
 await f.call('wechat-import-acknowledge',scope,id);assert.equal((await f.call('wechat-import-pending',scope)).length,0);
 await assert.rejects(fs.stat(directory),/ENOENT/);
});

const draftBundle=await esbuild.build({entryPoints:[path.join(client,'src/research/wechat-import-draft.ts')],bundle:true,platform:'node',format:'cjs',write:false,alias:{'@':path.join(client,'src')}});
const draftModule={exports:{}};vm.runInNewContext(draftBundle.outputFiles[0].text,{module:draftModule,exports:draftModule.exports,require,File,crypto});
const {prepareImportedComposerDraft}=draftModule.exports;
test('draft checks preserve prior HTML and escape imported markup before appending',()=>{
 const original={text:'<img src=x onerror="execute()">\n@someone',files:[],html:'<p>Keep my draft</p>',plainText:'Keep my draft',documents:[],images:[],queued:[]};
 const result=prepareImportedComposerDraft(original);
 assert.ok(result.startsWith(original.html));assert.match(result,/&lt;img/);assert.doesNotMatch(result,/<img/);assert.match(result,/@someone/);
 assert.equal(original.html,'<p>Keep my draft</p>');
 assert.throws(()=>prepareImportedComposerDraft({...original,text:'x'.repeat(8001)}),/8000/);
});
test('document and image capacity fail before any draft mutation and binary-MIME PNG keeps image semantics',()=>{
 const base={text:'source',files:[new File(['data'],'plot.png',{type:'application/octet-stream'})],html:'',plainText:'',documents:[],images:[],queued:[]};
 assert.ok(prepareImportedComposerDraft(base));
 assert.throws(()=>prepareImportedComposerDraft({...base,images:Array.from({length:20},(_,n)=>({id:String(n),name:'old.png',size:1,mediaType:'image/png'}))}),/图片/);
 assert.throws(()=>prepareImportedComposerDraft({...base,files:[new File(['data'],'notes.pdf')],documents:Array(20).fill(new File(['x'],'old.pdf'))}),/20/);
 assert.throws(()=>prepareImportedComposerDraft({...base,files:[new File([],'empty.png')]}),/空文件/);
});
