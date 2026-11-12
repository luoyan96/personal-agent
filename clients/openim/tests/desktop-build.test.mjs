import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyWorkspaceLinks, verifyWorkspaceOutputs, verifyBuilderToolchain, runtimeEntryFiles, verifyArchiveEntries, runPnpm } from '../scripts/workspace-build.mjs';

function fixture(t) {
  const temporary = mkdtempSync(path.join(tmpdir(), 'acceptcat-build-'));
  t.after(() => {
    const resolved = realpathSync(temporary);
    assert.equal(path.dirname(resolved), realpathSync(tmpdir()));
    assert.match(path.basename(resolved), /^acceptcat-build-/);
    rmSync(resolved, { recursive: true });
  });
  const workspace = path.join(temporary, 'repo'), client = path.join(workspace, 'clients/openim');
  const put = (relative, text) => { const target = path.join(workspace, relative); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, text); return target; };
  const manifests = {
    contracts: {name:'@research-agent-platform/contracts',version:'0.30.0'},
    'research-skills': {name:'@research-agent-platform/research-skills',version:'0.1.0',exports:{'./import':{require:'./dist/import.cjs',import:'./dist/import.js'}}},
  };
  put('clients/openim/package.json', JSON.stringify({packageManager:'pnpm@10.28.0',dependencies:Object.fromEntries(Object.entries(manifests).map(([name,m])=>[m.name,`link:../../packages/${name}`])),devDependencies:{electron:'22.3.27','electron-builder':'23.6.0'}}));
  for (const [name,m] of Object.entries(manifests)) {
    put(`packages/${name}/package.json`, JSON.stringify(m));
    put(`packages/${name}/src/index.ts`, 'export const value=1');
    put(`packages/${name}/dist/index.js`, 'export const value=1');
    const installed = path.join(client, 'node_modules', m.name);
    mkdirSync(path.dirname(installed), {recursive:true});
    symlinkSync(path.join(workspace, 'packages', name), installed, process.platform==='win32'?'junction':'dir');
  }
  put('packages/contracts/src/lab-membership.ts','export const lab=1');
  put('packages/contracts/dist/lab-membership.js','export const lab=1');
  put('packages/research-skills/src/import.ts','export const importer=1');
  put('packages/research-skills/dist/import.js','export const importer=1');
  put('packages/research-skills/dist/import.cjs','module.exports={importer:1}');
  put('packages/research-skills/dist/role-catalog.js','export const agentRoles=[]');
  put('packages/research-skills/dist/builtin-methods.js','export const builtinMethods=[]');
  put('agents/roles/sample/persona.md','Synthetic colleague');
  put('packages/research-skills/dist/roles/sample/persona.md','Synthetic colleague');
  put('agents/skills/sample/SKILL.md','Synthetic build fixture');
  put('packages/research-skills/dist/skills/sample/SKILL.md','Synthetic build fixture');
  return {temporary,workspace,client,put};
}

test('rejects an old file snapshot even when its manifest version matches; accepts live workspace links', t => {
  const f=fixture(t);verifyWorkspaceLinks(f.client);
  const installed=path.join(f.client,'node_modules/@research-agent-platform/contracts');
  f.put('packages/contracts/dist/new-contract.js','export const addedAfterInstall=1');
  assert.equal(readFileSync(path.join(installed,'dist/new-contract.js'),'utf8'),'export const addedAfterInstall=1');
  rmSync(installed);mkdirSync(installed);writeFileSync(path.join(installed,'package.json'),JSON.stringify({name:'@research-agent-platform/contracts',version:'0.30.0'}));
  assert.throws(()=>verifyWorkspaceLinks(f.client),/Stale\/missing workspace dependency/);
});

test('blocks missing newly added contract modules and the Electron CommonJS skill entry', t => {
  const f=fixture(t);verifyWorkspaceOutputs(f.client);
  rmSync(path.join(f.workspace,'packages/contracts/dist/lab-membership.js'));
  assert.throws(()=>verifyWorkspaceOutputs(f.client),/lab-membership\.js/);
  f.put('packages/contracts/dist/lab-membership.js','export const lab=1');
  rmSync(path.join(f.workspace,'packages/research-skills/dist/import.cjs'));
  assert.throws(()=>verifyWorkspaceOutputs(f.client),/import\.cjs/);
});

test('blocks stale packaged skill text', t => {
  const f=fixture(t);f.put('agents/skills/sample/SKILL.md','Updated source');
  assert.throws(()=>verifyWorkspaceOutputs(f.client),/Stale built skill/);
});

test('blocks stale role Markdown and missing generated catalog before desktop bundling', t => {
  const f=fixture(t);verifyWorkspaceOutputs(f.client);
  f.put('agents/roles/sample/persona.md','Changed colleague');
  assert.throws(()=>verifyWorkspaceOutputs(f.client),/Stale built role/);
  f.put('packages/research-skills/dist/roles/sample/persona.md','Changed colleague');
  rmSync(path.join(f.workspace,'packages/research-skills/dist/builtin-methods.js'));
  assert.throws(()=>verifyWorkspaceOutputs(f.client),/builtin-methods/);
  f.put('packages/research-skills/dist/builtin-methods.js','export const builtinMethods=[]');
  rmSync(path.join(f.workspace,'packages/research-skills/dist/role-catalog.js'));
  assert.throws(()=>verifyWorkspaceOutputs(f.client),/role-catalog/);
});

test('detects mixed builder components rather than trusting only the top-level version', t => {
  const f=fixture(t);
  f.put('clients/openim/node_modules/electron-builder/package.json',JSON.stringify({version:'23.6.0',dependencies:{'app-builder-lib':'23.6.0'}}));
  f.put('clients/openim/node_modules/app-builder-lib/package.json',JSON.stringify({version:'24.0.0'}));
  f.put('clients/openim/node_modules/electron/package.json',JSON.stringify({version:'22.3.27'}));
  assert.throws(()=>verifyBuilderToolchain(f.client),/Mixed electron-builder toolchain/);
  f.put('clients/openim/node_modules/app-builder-lib/package.json',JSON.stringify({version:'23.6.0'}));
  verifyBuilderToolchain(f.client);
});

test('requires the CommonJS skill importer and its YAML dependency inside the standalone runtime', t => {
  const f=fixture(t),stage=path.join(f.workspace,'stage');
  f.put('stage/package.json','{}');f.put('stage/dist/index.html','<!doctype html>');f.put('stage/dist-electron/main/bootstrap.js','require("electron")');
  const source=path.join(stage,'node_modules/@research-agent-platform/research-skills');mkdirSync(path.dirname(source),{recursive:true});
  symlinkSync(path.join(f.workspace,'packages/research-skills'),source,process.platform==='win32'?'junction':'dir');
  f.put('stage/node_modules/yaml/package.json','{"main":"index.js"}');f.put('stage/node_modules/yaml/index.js','module.exports={}');
  // A development fallback outside staging is never a complete app.
  assert.throws(()=>runtimeEntryFiles(stage),/Cannot find module|escaped staging/);
  // Use a new directory: Node caches realpaths of already-resolved symlinks.
  f.put('standalone/package.json','{}');f.put('standalone/dist/index.html','<!doctype html>');f.put('standalone/dist-electron/main/bootstrap.js','require("electron")');
  f.put('standalone/node_modules/@research-agent-platform/research-skills/package.json','{"exports":{"./import":{"require":"./dist/import.cjs"}}}');
  f.put('standalone/node_modules/@research-agent-platform/research-skills/dist/import.cjs','module.exports={}');
  f.put('standalone/node_modules/yaml/package.json','{"main":"index.js"}');f.put('standalone/node_modules/yaml/index.js','module.exports={}');
  assert.throws(()=>runtimeEntryFiles(path.join(f.workspace,'standalone')), /localDshRuntime/);
  f.put('standalone/dist-electron/main/localDshRuntime.js','module.exports={}');
  assert.throws(()=>runtimeEntryFiles(path.join(f.workspace,'standalone')), /localDsh/);
  f.put('standalone/dist-electron/preload/localDsh.js','require("electron")');
  f.put('standalone/dist-electron/preload/screenshotEditor.js','require("electron")');
  f.put('standalone/dist-electron/main/screenshotEditorManage.js','exports.registerScreenshotEditor=()=>{}');
  f.put('standalone/dist-electron/utils/screenshotEditorHtml.js','exports.screenshotEditorHtml=()=>{}');
  f.put('standalone/dist-electron/main/teamLibraryManage.js','exports.registerTeamLibraryBridge=()=>{}');
  f.put('standalone/dist-electron/utils/teamLibrary.js','exports.TeamLibraryStore=class {}');
  assert.throws(()=>runtimeEntryFiles(path.join(f.workspace,'standalone')), /wechatImportRuntime/);
  f.put('standalone/dist-electron/main/wechatImportRuntime.js','exports.registerWeChatImport=()=>{}');
  f.put('standalone/dist-electron/preload/wechatImportClient.js','exports.createWeChatImportClient=()=>{}');
  assert.equal(runtimeEntryFiles(path.join(f.workspace,'standalone')).length,13);
});

test('checks the actual archive, not just the staging directory', async t => {
  const f=fixture(t),actualClient=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const clientRequire=createRequire(path.join(actualClient,'package.json'));
  const asar=createRequire(clientRequire.resolve('electron-builder/package.json'))('asar');
  f.put('archive-source/package.json','{}');
  f.put('archive-source/nested/folder/entry.cjs','module.exports={}');
  const archive=path.join(f.temporary,'app.asar');await asar.createPackage(path.join(f.workspace,'archive-source'),archive);
  verifyArchiveEntries(archive,['package.json','nested/folder/entry.cjs'],asar);
  assert.throws(()=>verifyArchiveEntries(archive,['node_modules/@research-agent-platform/research-skills/dist/import.cjs'],asar));
});

test('rejects shell metacharacters before invoking a package manager', t => {
  const f=fixture(t);
  assert.throws(()=>runPnpm(f.client,['install','--force&echo']),/Unexpected build command argument/);
});

test('a fresh monorepo install skips standalone Husky without looking for Git inside the client', t => {
  const f=fixture(t),client=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const script=f.put('clients/openim/scripts/prepare-hooks.mjs',readFileSync(path.join(client,'scripts/prepare-hooks.mjs'),'utf8'));
  const result=spawnSync(process.execPath,[script],{cwd:f.client,encoding:'utf8',env:{...process.env,CI:'',HUSKY:''}});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Skip standalone Husky setup/);
});
