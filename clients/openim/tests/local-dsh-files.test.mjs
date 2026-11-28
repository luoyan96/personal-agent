import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url), client = fileURLToPath(new URL('../', import.meta.url));
const esbuild = createRequire(require.resolve('vite'))('esbuild');
const preload = (await esbuild.build({entryPoints:[path.join(client,'electron/preload/localDsh.ts')],bundle:true,platform:'node',format:'cjs',external:['electron'],write:false})).outputFiles[0].text;

test('DSH file bridge accepts native Files and material commands require user activation', async () => {
  class File { constructor(path) { this.path = path; } }
  for (const [main,protocol,hostname,enabled] of [[true,'http:','127.0.0.1',true],[false,'http:','127.0.0.1',false],[true,'https:','example.com',false]]) {
    const exposed={},calls=[],activation={isActive:false};
    vm.runInNewContext(preload,{File,navigator:{userActivation:activation},process:{isMainFrame:main},location:{protocol,hostname},require:id=>{
      assert.equal(id,'electron');return{contextBridge:{exposeInMainWorld:(k,v)=>exposed[k]=v},ipcRenderer:{invoke:(...args)=>calls.push(args)},webUtils:{getPathForFile:f=>f.path||''}};
    }});
    assert.equal(Object.keys(exposed).length,enabled?3:0);
    if(!enabled) continue;
    assert.equal(exposed.__DSH_HOST_PATHS__.pathFor(new File('C:\\public\\paper.pdf')),'C:\\public\\paper.pdf');
    assert.equal(exposed.__DSH_HOST_PATHS__.pathFor(new File()),'');
    assert.equal(exposed.__DSH_HOST_PATHS__.pathFor({path:'C:\\forged.pdf'}),'');
    await assert.rejects(exposed.__DSH_WORKBENCH_MATERIALS__.list({kind:'reference'}),/手动选择/);
    await assert.rejects(exposed.__DSH_WORKBENCH_MATERIALS__.read({kind:'reference',id:'synthetic'}),/手动选择/);
    await assert.rejects(exposed.__DSH_WORKBENCH_MATERIALS__.readMany({selections:[]}),/手动选择/);
    assert.deepEqual(calls,[]);
    activation.isActive=true;
    exposed.__DSH_DIRECTORY_PICKER__.pick();
    exposed.__DSH_WORKBENCH_MATERIALS__.list({kind:'template',extensions:['.pptx'],path:'forged'});
    exposed.__DSH_WORKBENCH_MATERIALS__.read({kind:'template',id:'selected',path:'forged'});
    exposed.__DSH_WORKBENCH_MATERIALS__.readMany({selections:[{kind:'reference',id:'other'}],path:'forged'});
    assert.deepEqual(JSON.parse(JSON.stringify(calls)),[
      ['local-dsh-pick-directory'],
      ['dsh-workbench-materials-list',{kind:'template',extensions:['.pptx']}],
      ['dsh-workbench-materials-read',{kind:'template',id:'selected'}],
      ['dsh-workbench-materials-read-many',{selections:[{kind:'reference',id:'other'}]}],
    ]);
  }
});

const managed = (await esbuild.build({entryPoints:[path.join(client,'electron/main/localDshManage.ts')],bundle:true,platform:'node',format:'cjs',write:false,external:['electron','./localDshRuntime'],
  plugins:[{name:'isolated-native-bridge',setup(build){
    build.onLoad({filter:/localFolderManage\.ts$/},()=>({contents:'export const authority=e=>({contents:e.sender});',loader:'js'}));
    build.onLoad({filter:/localDshAccount\.ts$/},()=>({contents:'export const dshAccount=()=>globalThis.fixtureAccount;export const createDshRelay=async()=>({baseURL:"http://127.0.0.1:1",secret:"synthetic",close:async()=>{}});',loader:'js'}));
    build.onLoad({filter:/taskDshManage\.ts$/},()=>({contents:'export const registerTaskDshBridge=()=>{};',loader:'js'}));
    build.onLoad({filter:/dshWorkbenchMaterials\.ts$/},()=>({contents:'export const registerDshWorkbenchMaterialBridge=connect=>globalThis.fixtureMaterials(connect);',loader:'js'}));
    // This fixture tests the frame/account boundary, not package installation.
    // The real bootstrap has separate filesystem/process tests in dsh-plugin.
    build.onLoad({filter:/dshPlugin\.ts$/},()=>({contents:'export const researchPlugin={name:"dsh-research-workbench",version:"0.6.0"};export const ensureResearchPlugin=async()=>({changed:false});export const ensureTaskContextPlugin=async()=>({changed:false});',loader:'js'}));
  }}],
})).outputFiles[0].text;

test('native directory picker is restricted to the owned DSH main frame and rechecks account after the dialog', async () => {
  const handlers=new Map();let view,valid=true,materials,hostUrl='http://app/#/dsh',afterPick=()=>{},selection={canceled:false,filePaths:['C:\\synthetic']},picks=0;
  const owner={isDestroyed:()=>false,removeBrowserView:()=>{}};
  const contents=Object.assign(new EventEmitter(),{getURL:()=>hostUrl});
  class View {
    constructor(){view=this;const wc=this.webContents=Object.assign(new EventEmitter(),{isDestroyed:()=>false,close:()=>{},getURL:()=> 'http://127.0.0.1:1234/',loadURL:async()=>{},setWindowOpenHandler:()=>{},debugger:{attach:()=>{},sendCommand:async()=>{}}});wc.mainFrame={url:'http://127.0.0.1:1234/'};}
  }
  const account={identity:'synthetic',lease:'one',metadata:{enabled:true,fingerprint:'one'},valid:async()=>{if(!valid)throw Error('expired');}};
  const mod={exports:{}};
  vm.runInNewContext(managed,{module:mod,exports:mod.exports,global:{pathConfig:{publicPath:client}},process,URL,__dirname:path.join(client,'dist-electron/main'),fixtureAccount:account,fixtureMaterials:connect=>{materials=connect;},
    setInterval:()=>({unref(){}}),require:id=>id==='electron'?{
      nativeImage:{createFromPath:()=>({resize:()=>({toDataURL:()=>"data:image/png;base64,AA=="})})},
      app:{isPackaged:false,getAppPath:()=>client,getPath:()=>client,on:()=>{}},BrowserView:View,BrowserWindow:{fromWebContents:()=>owner},
      ipcMain:{handle:(k,v)=>handlers.set(k,v)},session:{fromPartition:()=>({setPermissionRequestHandler(){},setPermissionCheckHandler(){}})},
      dialog:{showOpenDialog:async()=>{picks++;afterPick();return selection;}},shell:{},
    }:id==='./localDshRuntime'?{
      prepareAccountProfile:async()=>'',dshBrowserCompatibility:'',
      LocalDshRuntime:class {state={phase:'stopped'};async start(){this.state.phase='running';return 'http://127.0.0.1:1234/';}async stop(){this.state.phase='stopped';}},
    }:require(id),
  });
  mod.exports.registerLocalDshBridge();const snapshot=await handlers.get('local-dsh-connect')({sender:contents});assert.equal(snapshot.error,undefined);
  const pick=handlers.get('local-dsh-pick-directory'),event=()=>({sender:view.webContents,senderFrame:view.webContents.mainFrame});
  await assert.rejects(pick({sender:contents,senderFrame:{url:'http://app/'}}),/连接已变化/);assert.equal(picks,0);
  await assert.rejects(pick({sender:view.webContents,senderFrame:{url:'http://127.0.0.1:1234/'}}),/连接已变化/);
  await assert.rejects(materials({sender:contents,senderFrame:{url:'http://app/'}}),/连接已变化/);
  await assert.rejects(materials({sender:view.webContents,senderFrame:{url:'http://127.0.0.1:1234/'}}),/连接已变化/);
  const authorized=await materials(event());
  assert.equal(authorized.account,account);
  assert.equal(authorized.hostEvent.sender,contents);
  hostUrl='http://app/#/chat';await assert.rejects(authorized.valid(),/连接已变化/);
  hostUrl='http://app/#/dsh';
  assert.equal(await pick(event()),'C:\\synthetic');
  selection={canceled:true,filePaths:[]};assert.equal(await pick(event()),undefined);
  selection={canceled:false,filePaths:['C:\\synthetic']};afterPick=()=>{valid=false;};await assert.rejects(pick(event()),/expired/);
  await assert.rejects(authorized.valid(),/expired/);
});
