import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildLocalDshRuntime } from '../../../../integrations/deepseek-harness/desktop/build.mjs';
const require=createRequire(import.meta.url),client=fileURLToPath(new URL('../../',import.meta.url));
const {build}=createRequire(require.resolve('vite'))('esbuild');
const runtime={exports:{}};vm.runInNewContext(buildLocalDshRuntime(client).outputFiles[0].text,{module:runtime,exports:runtime.exports,require,process,Buffer,TextEncoder,URL,setTimeout,clearTimeout});
export const libraryRuntime=runtime.exports;
const compiled=await build({entryPoints:[path.join(client,'electron/utils/teamLibrary.ts')],bundle:true,platform:'node',format:'cjs',write:false,external:['../main/localDshRuntime']});
const module={exports:{}};vm.runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,require:n=>n==='../main/localDshRuntime'?libraryRuntime:require(n),process,Buffer,TextEncoder,URL,setTimeout,clearTimeout});
export const {TeamLibraryStore,gitRunner,gitFailureMessage,discoverRepository,repositoryUrl}=module.exports;
export async function standaloneLibraryStore(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'acceptcat-library-cjs-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'main'));await fs.mkdir(path.join(root,'utils'));
 await fs.writeFile(path.join(root,'main/localDshRuntime.js'),buildLocalDshRuntime(client).outputFiles[0].text);
 // Match the per-file CJS transform used by vite-electron-plugin, without bundling away imports.
 const {transform}=createRequire(require.resolve('vite'))('esbuild');
 const output=await transform(await fs.readFile(path.join(client,'electron/utils/teamLibrary.ts'),'utf8'),{loader:'ts',format:'cjs',target:'node16'});
 const file=path.join(root,'utils/teamLibrary.js');await fs.writeFile(file,output.code);
 return require(file).TeamLibraryStore;
}
export const sha=value=>createHash('sha256').update(value).digest('hex');
export async function libraryFixture(t,{aliasCache=false}={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'acceptcat-team-git-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const work=path.join(root,'author'),remote=path.join(root,'remote.git');await fs.mkdir(work);
  const git=(args,options={})=>execFileSync('git',['-c','core.hooksPath='+path.join(root,'no-hooks'),'-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid',...args],{cwd:work,windowsHide:true,stdio:['pipe','pipe','pipe'],...options});
  git(['init','-b','main']);
  const text='# 项目要求\n\n所有图表写清来源，示例无真实科研数据。\n';
  const entry={id:'rule_demo',projectId:'project_demo',name:'项目要求.md',purpose:'rule',summary:'公开合成示例',maintainer:'示例维护者',recommended:true,source:{kind:'git',path:'项目/项目要求.md',sha256:sha(text)}};
  const manifest={format:1,workspaceId:'acceptcat-demo',title:'示例实验室',projects:[{id:'project_demo',name:'2026项目申报',description:'公开示例材料'}],entries:[entry]};
  await fs.mkdir(path.join(work,'项目'));await fs.writeFile(path.join(work,'项目/项目要求.md'),text);
  await fs.writeFile(path.join(work,'acceptcat-library.json'),JSON.stringify(manifest));
  git(['add','.']);git(['commit','-m','公开示例目录']);git(['clone','--bare',work,remote]);
  const binding={url:'https://github.com/synthetic/files.git',branch:'main',workspaceId:manifest.workspaceId,labId:'lab_synthetic',version:1,updatedBy:'member_A',updatedAt:new Date().toISOString()};
  let directory,lose=false,offline=false;const commands=[];
  const run=async(args,options={})=>{
    commands.push(args);
    if(offline)throw Error('synthetic offline');
    if(args[0]==='config'&&args[1]==='remote.origin.url')args=[...args.slice(0,2),remote];
    const result=git(['--git-dir='+path.join(directory,'objects.git'),...args],{env:{...process.env,GIT_TERMINAL_PROMPT:'0',...(options.index?{GIT_INDEX_FILE:options.index}:{})},input:options.input,maxBuffer:options.maxBytes??20*1024*1024});
    if(args[0]==='push'&&lose){lose=false;throw Error('synthetic response lost after successful push');}return result;
  };
  const cache=path.join(root,'cache');
  if(aliasCache){const target=path.join(root,'cache-target');await fs.mkdir(target);await fs.symlink(target,cache,process.platform==='win32'?'junction':'dir');}
  const store=new TeamLibraryStore(cache,binding,run);directory=store.directory;
  return{root,work,remote,git,entry,manifest,text,store,binding,commands,lose:()=>lose=true,offline:value=>offline=value,publish:async value=>{await fs.writeFile(path.join(work,'acceptcat-library.json'),JSON.stringify(value));git(['add','.']);git(['commit','-m','更新公开示例']);git(['push',remote,'main']);}};
}
