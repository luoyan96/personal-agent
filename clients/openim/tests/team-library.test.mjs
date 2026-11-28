import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {libraryFixture,standaloneLibraryStore,TeamLibraryStore,gitRunner,gitFailureMessage,sha} from './helpers/team-library.mjs';
import {TeamLibraryPath} from '../../../packages/contracts/dist/team-library.js';

test('real Git fetch, verified originals, cached reopen and failed refresh preserve the published version',async t=>{
 const f=await libraryFixture(t),snap=await f.store.sync(),selected={revision:snap.revision,entryId:f.entry.id};
 await f.store.verifyPublishedRevision(snap.revision);
 assert.equal((await f.store.read(selected)).bytes.toString(),f.text);
 const original=await f.store.materialize(selected);assert.equal(await fs.readFile(original.file,'utf8'),f.text);
 assert.equal((await new TeamLibraryStore(path.join(f.root,'cache'),f.binding).cached()).revision,snap.revision);
 f.offline(true);await assert.rejects(f.store.sync(),/offline/);await assert.rejects(f.store.verifyPublishedRevision(snap.revision),/offline/);assert.equal((await f.store.cached()).revision,snap.revision);f.offline(false);
 const corrupt=structuredClone(f.manifest);corrupt.entries[0].source.sha256='0'.repeat(64);await f.publish(corrupt);
 await assert.rejects(f.store.verifyPublishedRevision(snap.revision),/版本已变化/);
 const next=await f.store.sync();await assert.rejects(f.store.read({...selected,revision:next.revision}),/校验失败/);
 await assert.rejects(f.store.read(selected),/版本已变化/);
});
test('an update creates one recoverable review branch, never moves main and does not overwrite another file',async t=>{
 const f=await libraryFixture(t),snap=await f.store.sync();f.lose();
 const body='# 新的项目要求\n\n保留来源，不编造测量。\n';
 await assert.rejects(f.store.propose(snap.revision,f.entry,body),/response lost/);
 const proposal=await f.store.propose(snap.revision,f.entry,body),again=await f.store.propose(snap.revision,f.entry,body);
 assert.equal(proposal.commit,again.commit);assert.equal(f.git(['--git-dir='+f.remote,'rev-parse','main']).toString().trim(),snap.revision);
 const branches=f.git(['--git-dir='+f.remote,'for-each-ref','--format=%(refname)','refs/heads/acceptcat/']).toString().trim().split('\n');assert.equal(branches.length,1);
 const published=JSON.parse(f.git(['--git-dir='+f.remote,'show',proposal.commit+':acceptcat-library.json']));assert.equal(published.entries[0].source.sha256,sha(body));
 await assert.rejects(f.store.propose(snap.revision,{...f.entry,id:'another'},body),/路径已被|路径已有/);
});
test('a canonical cache ancestor is supported while redirected material folders are rejected',async t=>{
 const f=await libraryFixture(t,{aliasCache:true}),snap=await f.store.sync(),selected={revision:snap.revision,entryId:f.entry.id};
 const original=await f.store.materialize(selected);assert.equal(await fs.readFile(original.file,'utf8'),f.text);
 const folder=path.dirname(original.file),redirect=path.join(f.root,'redirect');await fs.mkdir(redirect);
 await fs.rm(folder,{recursive:true});await fs.symlink(redirect,folder,process.platform==='win32'?'junction':'dir');
 await assert.rejects(f.store.materialize(selected),/缓存路径发生变化/);
 assert.deepEqual(await fs.readdir(redirect),[]);
});
test('invalid manifest and cross-workspace fetch leave last-good cache intact',async t=>{
 const f=await libraryFixture(t),snap=await f.store.sync();await f.publish({...f.manifest,workspaceId:'another'});await assert.rejects(f.store.sync(),/空间ID/);
 assert.equal((await f.store.cached()).revision,snap.revision);
 assert.notEqual(new TeamLibraryStore(path.join(f.root,'cache'),{...f.binding,labId:'another'}).directory,f.store.directory);
 assert.notEqual(new TeamLibraryStore(path.join(f.root,'other-account'),f.binding).directory,f.store.directory);
 for(const name of ['../secret','C:/x','a/../../x','x\\y','a/.git/config','NUL.md','a/con.txt','x.','a/x\u0000.md'])assert.equal(TeamLibraryPath.safeParse(name).success,false,name);
});
test('production runner initializes an owned bare repository and cannot use local/file transport',async t=>{
 const f=await libraryFixture(t),folder=path.join(f.root,'production.git'),run=gitRunner(folder);
 await run(['init','--bare',folder]);await run(['config','remote.origin.url',f.remote]);
 await assert.rejects(run(['fetch','origin','main']),/Git操作未完成/);
 assert.equal((await run(['rev-parse','--is-bare-repository'])).toString().trim(),'true');
});
test('a new project is proposed independently with stable retry and no spurious material entry',async t=>{
 const f=await libraryFixture(t),snapshot=await f.store.sync(),project={id:'patent',name:'专利申请',description:'公开示例项目'};
 const result=await f.store.proposeProject(snapshot.revision,project),again=await f.store.proposeProject(snapshot.revision,project);
 assert.equal(result.commit,again.commit);assert.equal(result.entry,null);
 const manifest=JSON.parse(f.git(['--git-dir='+f.remote,'show',result.commit+':acceptcat-library.json']));
 assert.equal(manifest.projects.length,2);assert.equal(manifest.entries.length,1);
 assert.equal(f.git(['--git-dir='+f.remote,'rev-parse','main']).toString().trim(),snapshot.revision);
});
test('the standalone per-file CommonJS store loads without an ESM contracts dependency',async t=>{
 const f=await libraryFixture(t),Store=await standaloneLibraryStore(t);
 assert.equal(await new Store(path.join(f.root,'standalone-cache'),f.binding).cached(),null);
 assert.throws(()=>new Store(path.join(f.root,'standalone-cache'),{...f.binding,url:'file:///secret'}));
});

test('a dropped binary original is versioned in a review branch and retries without duplicating it', async t => {
 const f=await libraryFixture(t),snap=await f.store.sync();
 const bytes=Buffer.from([0x50,0x4b,0,255,13,10,9,128]);
 const entry={...f.entry,id:'template_demo',name:'组会模板.pptx',purpose:'template',source:{kind:'git',path:'模板/组会模板.pptx',sha256:'0'.repeat(64)}};
 const result=await f.store.propose(snap.revision,entry,undefined,bytes);
 const retry=await f.store.propose(snap.revision,entry,undefined,bytes);
 assert.equal(result.commit,retry.commit);
 assert.deepEqual(f.git(['--git-dir='+f.remote,'show',result.commit+':'+entry.source.path]),bytes);
 assert.equal(result.entry.source.sha256,sha(bytes));
 assert.equal(f.git(['--git-dir='+f.remote,'rev-parse','main']).toString().trim(),snap.revision);
 const changed=Buffer.from([0x50,0x4b,1,254]);
 const next=await f.store.propose(snap.revision,entry,undefined,changed);
 assert.notEqual(next.commit,result.commit);
 await assert.rejects(f.store.propose(snap.revision,{...entry,id:'other',source:f.entry.source},undefined,bytes),/路径已被|路径已有/);
 await assert.rejects(f.store.propose(snap.revision,entry,undefined,Buffer.alloc(20*1024*1024+1)),/20 MiB/);
});

test("Git diagnostics select actionable recovery without returning sensitive helper output", () => {
  const secret =
    "https://private-token@github.com/private/repo.git?password=do-not-display";
  for (const [diagnostic, expected] of [
    ["Could not resolve host: github.com", /网络连接失败/],
    ["Failed to connect to github.com port 443", /网络连接失败/],
    ["fatal: Authentication failed", /Git 访问权限不足/],
    ["remote: Permission to synthetic/files.git denied to member.", /Git 访问权限不足/],
    ["remote: Write access to repository not granted.", /Git 访问权限不足/],
    ["RPC failed; curl 56 Recv failure", /网络连接失败/],
    ["fatal: could not read Username: terminal prompts disabled", /Git 访问权限不足/],
    ["remote: Repository not found.", /仓库不存在或当前账号无权访问/],
    ["fatal: couldn't find remote ref refs/heads/published", /仓库发布分支不存在/],
    ["fatal: unexplained helper failure", /Git操作未完成/],
  ]) {
    const message = gitFailureMessage(["fetch"], `${diagnostic}\n${secret}`);
    assert.match(message, /^同步资料失败：/);
    assert.match(message, expected);
    assert.doesNotMatch(
      message,
      /private-token|private\/repo|password|do-not-display|unexplained/,
    );
  }
  assert.match(
    gitFailureMessage(["ls-remote"], "fatal: Authentication failed"),
    /^识别仓库分支失败/,
  );
  assert.match(
    gitFailureMessage(["push"], "fatal: Authentication failed"),
    /^提交待审更新失败/,
  );
});

test("a malformed manifest does not replace the last successful snapshot", async (t) => {
  const f = await libraryFixture(t),
    previous = await f.store.sync();
  await f.publish({ ...f.manifest, entries: "invalid-private-payload" });
  await assert.rejects(f.store.sync(), (error) => {
    assert.match(error.message, /acceptcat-library.json/);
    assert.doesNotMatch(error.message, /invalid-private-payload|ZodError/);
    return true;
  });
  assert.equal((await f.store.cached()).revision, previous.revision);
});

test('Windows Git reads and writes objects beyond MAX_PATH in account-scoped caches', { skip: process.platform !== 'win32' }, async t => {
  const fixture = await libraryFixture(t);
  const folder = path.join(fixture.root, 'a'.repeat(238 - fixture.root.length - 13), 'objects.git');
  await fs.mkdir(path.dirname(folder), { recursive: true });
  const run = gitRunner(folder);
  await run(['init', '--bare', folder]);
  const pack = fixture.git(['pack-objects', '--all', '--stdout']);
  await run(['index-pack', '--stdin', '--promisor'], { input: pack });
  const revision = fixture.git(['rev-parse', 'HEAD']).toString().trim();
  const tree = await run(['ls-tree', '-z', revision, '--', ':(literal)acceptcat-library.json']);
  assert.match(tree.toString(), /acceptcat-library\.json\0$/);
  const sidecar = (await fs.readdir(path.join(folder, 'objects', 'pack'))).find(name => name.endsWith('.promisor'));
  assert.ok(sidecar);
  assert.ok(path.join(folder, 'objects', 'pack', sidecar).length > 260);
});

test('a true Git tree includes unregistered nested files after commit/push without changing the manifest', async t => {
 const f=await libraryFixture(t),before=await f.store.sync();
 await fs.mkdir(path.join(f.work,'nested/子目录'),{recursive:true});
 await fs.mkdir(path.join(f.work,'.github'),{recursive:true});
 await fs.writeFile(path.join(f.work,'nested/子目录/新文件.md'),'# 未登记的新文件\n公开示例。\n');
 await fs.writeFile(path.join(f.work,'.github/notes.md'),'hidden directory text');
 await fs.writeFile(path.join(f.work,'nested/[draft].txt'),'literal pathspec');
 f.git(['add','.']);
 const blob=f.git(['hash-object','-w','--stdin'],{input:Buffer.from('nested/子目录/新文件.md')}).toString().trim();
 f.git(['update-index','--add','--cacheinfo',`120000,${blob},linked.md`]);
 f.git(['update-index','--add','--cacheinfo',`160000,${before.revision},vendor`]);
 f.git(['commit','-m','Synthetic unregistered files']);f.git(['push',f.remote,'main']);
 const snapshot=await f.store.sync();
 assert.deepEqual(snapshot.manifest,before.manifest);
 for(const item of [
  {path:'nested',kind:'folder'},{path:'nested/子目录',kind:'folder'},
  {path:'nested/子目录/新文件.md',kind:'file'},{path:'.github/notes.md',kind:'file'},
  {path:'linked.md',kind:'symlink'},{path:'vendor',kind:'submodule'},
 ]) assert(snapshot.tree.some(value=>value.path===item.path&&value.kind===item.kind),JSON.stringify(item));
 assert.equal((await f.store.readPath({revision:snapshot.revision,path:'nested/子目录/新文件.md'})).bytes.toString(),'# 未登记的新文件\n公开示例。\n');
 assert.equal((await f.store.readPath({revision:snapshot.revision,path:'nested/[draft].txt'})).bytes.toString(),'literal pathspec');
 assert.equal((await f.store.readPath({revision:snapshot.revision,path:'.github/notes.md'})).bytes.toString(),'hidden directory text');
 for(const name of ['nested','linked.md','vendor','not-found.txt']) await assert.rejects(f.store.readPath({revision:snapshot.revision,path:name}),/不是普通文件/);
 await assert.rejects(f.store.readPath({revision:before.revision,path:'nested/子目录/新文件.md'}),/版本已变化/);
 for(const name of ['../secret','a/../secret','/absolute','C:/secret','a\\secret','.git/config','a/.GIT/config','NUL.txt','a/.','a/..','a//b','x\u0000.md'])
  await assert.rejects(f.store.readPath({revision:snapshot.revision,path:name}),/路径无效/,name);
 assert(!f.commands.some(args=>['checkout','submodule'].includes(args[0])));
});

test('tree survives an offline reopen and old cache snapshots upgrade from local Git objects', async t=>{
 const f=await libraryFixture(t),snapshot=await f.store.sync(),file=path.join(f.store.directory,'snapshot.json');
 f.offline(true);
 assert.deepEqual((await f.store.cached()).tree,snapshot.tree);
 f.offline(false);
 const old=JSON.parse(await fs.readFile(file,'utf8'));delete old.tree;await fs.writeFile(file,JSON.stringify(old));
 const count=f.commands.length,upgraded=await f.store.cached();
 assert.deepEqual(upgraded.tree,snapshot.tree);
 assert.equal(JSON.stringify(JSON.parse(await fs.readFile(file,'utf8')).tree),JSON.stringify(snapshot.tree));
 assert(f.commands.slice(count).every(args=>args[0]==='ls-tree'));
 f.offline(true);assert.deepEqual((await f.store.cached()).tree,snapshot.tree);
});

test('plain repositories sync without fabricating registered entries and preserve old binding identity',async t=>{
 const f=await libraryFixture(t);await fs.rm(path.join(f.work,'acceptcat-library.json'));
 f.git(['add','-A']);f.git(['commit','-m','Synthetic plain repository']);f.git(['push',f.remote,'main']);
 const snapshot=await f.store.sync();
 assert.equal(snapshot.manifest.workspaceId,f.binding.workspaceId);
 assert.equal(snapshot.manifest.projects.length,0);assert.equal(snapshot.manifest.entries.length,0);
 assert(snapshot.tree.some(item=>item.path===f.entry.source.path&&item.kind==='file'));
 assert.equal((await f.store.readPath({revision:snapshot.revision,path:f.entry.source.path})).bytes.toString(),f.text);
});

test('path browsing rejects LFS pointers and files above the Git byte limit',async t=>{
 const f=await libraryFixture(t);
 await fs.writeFile(path.join(f.work,'pointer.txt'),'version https://git-lfs.github.com/spec/v1\noid sha256:'+ '0'.repeat(64)+'\nsize 1\n');
 await fs.writeFile(path.join(f.work,'large.txt'),Buffer.alloc(20*1024*1024+1,65));
 f.git(['add','.']);f.git(['commit','-m','Synthetic guarded files']);f.git(['push',f.remote,'main']);
 const snapshot=await f.store.sync();
 await assert.rejects(f.store.readPath({revision:snapshot.revision,path:'pointer.txt'}),/LFS/);
 const native=new TeamLibraryStore(path.join(f.root,'cache'),f.binding);
 await assert.rejects(native.readPath({revision:snapshot.revision,path:'large.txt'}),/共享原件服务/);
});
