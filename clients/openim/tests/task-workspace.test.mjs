import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { routes } from "../../../packages/contracts/dist/routes.js";
import { buildLocalDshRuntime } from "../../../integrations/deepseek-harness/desktop/build.mjs";
const require = createRequire(import.meta.url),
  module = { exports: {} };
vm.runInNewContext(
  buildLocalDshRuntime(fileURLToPath(new URL("../", import.meta.url))).outputFiles[0]
    .text,
  {
    module,
    exports: module.exports,
    require,
    process,
    Buffer,TextEncoder,
    URL,
    setTimeout,
    clearTimeout,
  },
);
const { DshTaskWorkspace } = module.exports;
const context = {
  kind: "research",
  taskId: "task_synthetic",
  title: "Synthetic comparison",
  goal: "Compare the fixture papers",
  version: 3,
};
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acceptcat-task-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sessions = new Map(),
    calls = [];
  let lose = false,
    deny = false;
  const rpc = async (method, args) => {
    calls.push({ method, args });
    if (method === "session/projections")
      return sessions.has(args.sessionId) ? { kind: "sequenced", asOfSeq: 0 } : null;
    if (method === "workspace/create") return { workspace: { workspaceId: args.path } };
    if (method === "session/create") {
      sessions.set(args.sessionId, args);
      return { sessionId: args.sessionId };
    }
    if (method === "session/prompt" && lose) {
      lose = false;
      throw Error("response lost");
    }
    if (method === "session/page") return { records: [], hasMore: false };
    if (method === "session/list")
      return {
        items: [...sessions.keys()].map((sessionId) => ({ sessionId, running: false })),
      };
    return {};
  };
  const valid = async () => {
    if (deny) throw Error("session expired");
  };
  return {
    root,
    calls,
    sessions,
    store: new DshTaskWorkspace(root, rpc, valid),
    restart: () => new DshTaskWorkspace(root, rpc, valid),
    lose: () => (lose = true),
    deny: () => (deny = true),
  };
}
test("concurrent open and restart recover the exact task session; another task has a separate directory", async (t) => {
  const f = await fixture(t);
  const [a, b] = await Promise.all([f.store.open(context), f.store.open(context)]);
  assert.equal(a.sessionId, b.sessionId);
  assert.equal(f.calls.filter((c) => c.method === "session/create").length, 1);
  assert.equal((await f.restart().open(context)).sessionId, a.sessionId);
  const c = await f.store.open({ ...context, taskId: "other" });
  assert.notEqual(a.directory, c.directory);
  assert.notEqual(a.sessionId, c.sessionId);
});

test("direct deliverables persist and submit without a DSH session, then can open in the workbench", async t => {
  const f = await fixture(t);
  const file = path.join(f.root, 'result.pdf');
  await fs.writeFile(file, '%PDF-1.4\nsynthetic result');
  const names = await f.store.addDeliverables(context, [file]);
  assert.equal(f.calls.length, 0);
  const state = await f.restart().status(context);
  assert.equal(state.binding.submissionOnly, true);
  assert.equal(state.files[0].name, names[0]);
  const again = await f.restart().addDeliverables(context, [file]);
  assert.deepEqual(again, names);
  const writes = [];
  const post = async (url, body, key) => {
    writes.push({url,body,key});
    return {id:'artifact_synthetic'};
  };
  await f.store.deliver(context, 'Synthetic result', names, post, true);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].body.filename, 'result.pdf');
  assert.equal(Buffer.from(writes[0].body.contentBase64, 'base64').toString(), '%PDF-1.4\nsynthetic result');
  await f.restart().deliver(context, 'Synthetic result', names, post, true);
  assert.equal(writes.length, 2);
  await f.restart().open(context);
  assert.equal((await f.store.load(context)).submissionOnly, undefined);
  assert.equal(f.sessions.size, 1);
});

test("direct delivery validates the whole selection and keeps same-name files distinct", async t => {
  const f = await fixture(t);
  const first = path.join(f.root, 'result.txt');
  const other = path.join(f.root, 'other');
  await fs.mkdir(other);
  const second = path.join(other, 'result.txt');
  const unsupported = path.join(f.root, 'slides.pptx');
  await fs.writeFile(first, 'one');await fs.writeFile(second, 'two');
  await fs.writeFile(unsupported, 'synthetic');
  await assert.rejects(f.store.addDeliverables(context, [first, unsupported]), /Office/);
  assert.equal(await f.store.load(context), undefined);
  const names = await f.store.addDeliverables(context, [first, second]);
  assert.equal(names.length, 2);
  assert.notEqual(names[0], names[1]);
  assert.equal((await f.store.readOutput(context,names[0])).toString(),'one');
  assert.equal((await f.store.readOutput(context,names[1])).toString(),'two');
  f.deny();
  await assert.rejects(f.store.addDeliverables(context, [first]), /expired/);
});
test("a default work folder is readable, stays under the account root, and never carries a bare task id", async (t) => {
  const f = await fixture(t);
  const b = await f.store.open({ ...context, title: 'Plan: A/B? 复盘' });
  assert.equal(path.basename(b.directory), "research-Plan-A-B-复盘-task_syn");
  // realpath: Windows runners may hand out 8.3 short names for the temp root.
  assert.equal(
    await fs.realpath(path.dirname(b.directory)),
    await fs.realpath(path.join(f.root, "files")),
  );
});
test("ambiguous prompt survives restart and retries the exact request, blocking a different intent", async (t) => {
  const f = await fixture(t);
  await f.store.open(context);
  f.lose();
  await assert.rejects(
    f.store.prompt(context, "read paper", "same_request_123"),
    /response lost/,
  );
  const restored = f.restart();
  await assert.rejects(
    restored.prompt(context, "write something", "another_request_123"),
    /上一条/,
  );
  await restored.prompt(
    context,
    "changed draft must not replace accepted content",
    "same_request_123",
  );
  const calls = f.calls.filter((c) => c.method === "session/prompt");
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(calls[0].args), JSON.stringify(calls[1].args));
  await restored.prompt(context, "duplicate click", "same_request_123");
  assert.equal(f.calls.filter((c) => c.method === "session/prompt").length, 2);
});
test("selected immutable source is hash checked; traversal and symlinks cannot expose another folder", async (t) => {
  const f = await fixture(t),
    b = await f.store.open(context),
    bytes = Buffer.from("synthetic paper");
  const s = {
    kind: "artifact",
    id: "paper_a",
    version: 1,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    filename: "paper.txt",
  };
  await assert.rejects(f.store.importSource(context, s, Buffer.from("wrong")), /校验/);
  await f.store.importSource(context, s, bytes);
  await f.store.importSource(context, s, bytes);
  assert.equal((await f.store.load(context)).sources.length, 1);
  await assert.rejects(f.store.readOutput(context, "../secret.txt"), /路径/);
  const outside = path.join(f.root, "outside");
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "secret.txt"), "private");
  await fs.symlink(outside, path.join(b.directory, "linked"), "junction");
  await assert.rejects(f.store.readOutput(context, "linked/secret.txt"), /链接/);
});
test("lost upload and submit responses retry persisted bytes and keys without a second deliverable", async (t) => {
  const f = await fixture(t),
    b = await f.store.open(context);
  await fs.writeFile(path.join(b.directory, "result.md"), "synthetic comparison");
  const accepted = new Map();
  let lostUpload = true,
    lostSubmit = true,
    version = 3,
    uploads = 0,
    submits = 0;
  const post = async (url, body, key) => {
    if (accepted.has(key)) {
      assert.equal(accepted.get(key).body, JSON.stringify(body));
      return accepted.get(key).value;
    }
    assert.equal(body.expectedVersion, version);
    const upload = url.endsWith("artifacts");
    const value = { id: upload ? "artifact-result" : "delivery-result" };
    accepted.set(key, { body: JSON.stringify(body), value });
    version++;
    if (upload) {
      uploads++;
      if (lostUpload) {
        lostUpload = false;
        throw Error("upload lost");
      }
    } else {
      submits++;
      if (lostSubmit) {
        lostSubmit = false;
        throw Error("submit lost");
      }
    }
    return value;
  };
  await assert.rejects(
    f.store.deliver(context, "Ready for review", ["result.md"], post, true),
    /upload lost/,
  );
  await fs.writeFile(path.join(b.directory, "result.md"), "changed after upload");
  await assert.rejects(
    f
      .restart()
      .deliver(
        { ...context, version: 4 },
        "Ready for review",
        ["result.md"],
        post,
        true,
      ),
    /submit lost/,
  );
  const r = await f
    .restart()
    .deliver(
      { ...context, version: 5 },
      "Ready for review",
      ["result.md"],
      post,
      false,
    );
  assert.equal(r.id, "delivery-result");
  assert.equal(uploads, 1);
  assert.equal(submits, 1);
  await f
    .restart()
    .deliver(
      { ...context, version: 5 },
      "Ready for review",
      ["result.md"],
      post,
      false,
    );
  assert.equal(submits, 1);
});
test("account lease expiry blocks local receipts and all later task operations", async (t) => {
  const f = await fixture(t);
  await f.store.open(context);
  f.deny();
  await assert.rejects(f.store.status(context), /expired/);
  await assert.rejects(f.store.prompt(context, "hello", "request_123"), /expired/);
});

test("delivery includes referenced source artifacts and obeys the actual submission contract", async (t) => {
  const f = await fixture(t),
    b = await f.store.open(context),
    bytes = Buffer.from("synthetic source");
  await f.store.importSource(
    context,
    {
      kind: "artifact",
      id: "source_a",
      version: 1,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      filename: "a.txt",
    },
    bytes,
  );
  await fs.writeFile(path.join(b.directory, "result.md"), "result");
  await f.store.deliver(
    context,
    "Reviewed comparison",
    ["result.md"],
    async (url, body) => {
      if (url.endsWith("/artifacts")) return { id: "output_a" };
      const parsed = routes.submit.request.shape.body.parse(body);
      assert.deepEqual([...parsed.artifactRefs], ["output_a", "source_a"]);
      assert.equal(parsed.sources[0].locator, "source_a");
      return { id: "delivered_a" };
    },
    true,
  );
});

test("definite version conflict can be explicitly rebased without reupload; ambiguous results cannot", async (t) => {
  const f = await fixture(t),
    b = await f.store.open(context);
  await fs.writeFile(path.join(b.directory, "result.md"), "result");
  let uploads = 0,
    conflict = true;
  const keys = [];
  const post = async (url, body, key) => {
    if (url.endsWith("/artifacts")) {
      uploads++;
      return { id: "out" };
    }
    keys.push(key);
    if (conflict) throw Object.assign(Error("conflict"), { code: "VERSION_CONFLICT" });
    assert.equal(body.expectedVersion, 8);
    return { id: "done" };
  };
  await assert.rejects(
    f.store.deliver(context, "summary", ["result.md"], post, true),
    /conflict/,
  );
  assert.equal((await f.store.load(context)).delivery.versionConflict, true);
  conflict = false;
  await f.restart().rebaseDelivery({ ...context, version: 8 });
  await f
    .restart()
    .deliver({ ...context, version: 8 }, "summary", ["result.md"], post, true);
  assert.equal(uploads, 1);
  assert.notEqual(keys[0], keys[1]);
  await assert.rejects(f.store.rebaseDelivery({ ...context, version: 9 }), /核对/);
});

test("official turn reasons, pending approvals and hidden injected context are projected accurately", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acceptcat-status-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let exists = false,
    running = true;
  const events = [
    { seq: 1, type: "turn/start", data: { turn: 1 } },
    {
      seq: 2,
      type: "user/message",
      data: {
        source: { kind: "runtime-context" },
        content: [{ type: "text", text: "hidden" }],
      },
    },
    { seq: 3, type: "approval/asked", data: { id: "approve_a" } },
    {
      seq: 4,
      type: "assistant/message",
      data: {
        message: {
          content: [
            { type: "thinking", thinking: "private" },
            { type: "text", text: "visible" },
          ],
        },
      },
    },
  ];
  const s = new DshTaskWorkspace(
    root,
    async (m, a) => {
      if (m === "session/projections")
        return exists ? { kind: "sequenced", asOfSeq: events.length } : null;
      if (m === "workspace/create") return { workspace: { workspaceId: "work" } };
      if (m === "session/create") {
        exists = true;
        return { sessionId: a.sessionId };
      }
      if (m === "session/page")
        return { records: events.map((event) => ({ event })), hasMore: false };
      if (m === "session/list")
        return { items: [{ sessionId: (await s.load(context)).sessionId, running }] };
      return {};
    },
    async () => {},
  );
  await s.open(context);
  let state = await s.status(context);
  assert.equal(state.needsApproval, true);
  assert.equal(
    state.events.some((e) => e.type === "user/message"),
    false,
  );
  assert.equal(state.events.at(-1).data.message.content.length, 1);
  events.push(
    { seq: 5, type: "approval/decided", data: { id: "approve_a" } },
    { seq: 6, type: "turn/end", data: { reason: { kind: "completed" } } },
  );
  running = false;
  state = await s.status(context);
  assert.equal(state.phase, "finished");
  assert.equal(state.needsApproval, false);
  events.at(-1).data.reason.kind = "aborted";
  assert.equal((await s.status(context)).phase, "interrupted");
});

const {packWorkContext}=module.exports;
const workInput=(fingerprint='policy_v1',extra=[])=>({fingerprint,entries:[{id:'platform',version:1,kind:'platform',title:'Platform',content:'Require evidence.'},...extra],omitted:[]});
test('a greeting does not load task archives, handoff, personal memories, or skill bodies',()=>{
 const packed=packWorkContext('你好',workInput('v1',[{id:'secret',version:1,kind:'memory',title:'Private',content:'PRIVATE_SENTINEL'},{id:'method',version:1,kind:'skill',title:'Method',content:'SKILL_SENTINEL'}]),{id:'task',version:1,kind:'task',title:'Task',content:'ARCHIVE_SENTINEL'});
 assert(!packed.content.includes('PRIVATE_SENTINEL'));assert(!packed.content.includes('SKILL_SENTINEL'));assert(!packed.content.includes('ARCHIVE_SENTINEL'));
 assert.equal(packed.receipt.greeting,true);assert(packed.receipt.bytes<1500);
});
test('confirmed handoff follows a new session, original history and output hashes survive restart',async t=>{
 const f=await fixture(t),b=await f.store.open(context);
 await fs.writeFile(path.join(b.directory,'result.md'),'Synthetic result');
 await f.store.prompt(context,'Compare papers','checkpoint_request_1',workInput());
 const h=await f.store.checkpoint(context,{conclusion:'Compared A',evidence:'result.md',next:'Compare B',blockers:''},0,'policy_v1');
 assert.equal(h.outputs[0].sha256,createHash('sha256').update('Synthetic result').digest('hex'));
 await f.store.newSession(context);const next=await f.store.load(context);assert.notEqual(next.sessionId,b.sessionId);assert.equal(next.sessionHistory[0].sessionId,b.sessionId);
 await f.restart().prompt(context,'Continue','checkpoint_request_2',workInput());
 const message=f.calls.filter(c=>c.method==='session/prompt').at(-1).args.content[0].text;
 assert(message.includes('Compared A'));assert(message.includes('Compare B'));assert(message.includes('result.md'));
 await assert.rejects(f.store.checkpoint(context,{conclusion:'stale',evidence:'',next:'stale',blockers:''},0,'policy_v1'),/已更新/);
});
test('changed rules or corrected memories rotate the host session and exclude stale handoff',async t=>{
 const f=await fixture(t);await f.store.open(context);await f.store.prompt(context,'Work','old_request_1',workInput());
 const old=(await f.store.load(context)).sessionId;
 await f.store.checkpoint(context,{conclusion:'OLD_VALUE',evidence:'',next:'old step',blockers:''},0,'policy_v1');
 await f.store.prompt(context,'Continue','new_request_1',workInput('policy_v2',[{id:'personal',version:2,kind:'memory',title:'Preference',content:'NEW_VALUE'}]));
 const state=await f.store.load(context),last=f.calls.filter(c=>c.method==='session/prompt').at(-1);
 assert.notEqual(last.args.sessionId,old);assert(last.args.content[0].text.includes('NEW_VALUE'));assert(!last.args.content[0].text.includes('OLD_VALUE'));assert(state.contextReceipt.omitted.some(s=>s.includes('交接')));
});
test('a valid near-limit handoff and task memories survive packing beyond the personal preference budget',async t=>{
 const f=await fixture(t);await f.store.open(context);
 const inputs=workInput('policy_v1',[{id:'task-memory',version:1,kind:'memory',title:'Task memory',content:'M'.repeat(2500)}]);
 await f.store.prompt(context,'Work','long_handoff_request_1',inputs);
 const conclusion='C'.repeat(3600);
 await f.store.checkpoint(context,{conclusion,evidence:'result.md',next:'Continue with the accepted inputs',blockers:''},0,'policy_v1');
 await f.store.newSession(context);
 await f.restart().prompt(context,'Continue','long_handoff_request_2',inputs);
 const message=f.calls.filter(c=>c.method==='session/prompt').at(-1).args.content[0].text;
 assert(message.includes(conclusion));assert(message.includes('M'.repeat(2500)));
 const receipt=(await f.store.load(context)).contextReceipt;
 assert(receipt.entries.some(e=>e.kind==='handoff'));assert(receipt.entries.some(e=>e.id==='task-memory'));
 assert(!receipt.omitted.includes('Task memory'));
});
test('ambiguous request freezes its context and blocks replay after memory revocation',async t=>{
 const f=await fixture(t);await f.store.open(context);f.lose();
 await assert.rejects(f.store.prompt(context,'Work','uncertain_request_1',workInput()),/response lost/);
 const pending=(await f.store.load(context)).pending;assert.equal(pending.userText,'Work');
 await assert.rejects(f.restart().prompt(context,'Work','uncertain_request_1',workInput('revoked')),/已变化/);
 await f.restart().prompt(context,'Work','uncertain_request_1',workInput());
 assert.equal(f.calls.filter(c=>c.method==='session/prompt').at(-1).args.content[0].text,pending.text);
});
test('rules overflow fails explicitly; optional context is omitted with a visible receipt',()=>{
 const large={id:'r',version:1,kind:'rule',title:'Rule',content:'x'.repeat(13000)};
 assert.throws(()=>packWorkContext('work',workInput('x',[large]),{id:'t',version:1,kind:'task',title:'T',content:'G'}),/预算/);
 const packed=packWorkContext('work',workInput('x',[{...large,kind:'skill',content:'x'.repeat(40000)}]),{id:'t',version:1,kind:'task',title:'T',content:'G'});
 assert(packed.receipt.omitted.includes('Rule'));assert(packed.receipt.bytes<1500);
});


test('Electron CommonJS bundle validates canonical work context without requiring ESM contracts', () => {
  const { WorkContext } = module.exports;
  const policy = {platform:{version:'1',content:'Synthetic rule'},scopes:[],records:[],privateMemoryAllowed:false};
  assert.equal(WorkContext.parse(policy).privateMemoryAllowed, false);
  assert.equal(WorkContext.safeParse({...policy,privateMemoryAllowed:'yes'}).success, false);
  assert.equal(WorkContext.safeParse({...policy,unexpected:'not admitted'}).success, false);
});

test('personal constraints remain mandatory while reusable methods are optional and absent from a greeting',()=>{
 const entries=[{id:'personal',version:2,kind:'rule',layer:'personal',title:'本人偏好',content:'PERSONAL_CONSTRAINT'}, {id:'method',version:1,kind:'link',layer:'lab',title:'组内方法',content:'OPTIONAL_METHOD'}];
 const task={id:'t',version:1,kind:'task',title:'Task',content:'Synthetic goal'};
 const greeting=packWorkContext('你好',workInput('personal-v2',entries),task);
 assert(greeting.content.includes('PERSONAL_CONSTRAINT'));assert(!greeting.content.includes('OPTIONAL_METHOD'));
 const work=packWorkContext('开始工作',workInput('personal-v2',entries),task);
 assert(work.receipt.entries.some(e=>e.id==='personal'&&e.layer==='personal'&&e.version===2));
 assert(work.receipt.entries.some(e=>e.id==='method'&&e.kind==='link'));
});

test('local files stay local, same-content shared material reuses the copy, and the prompt lists provenance not file contents', async t => {
  const f = await fixture(t), dir = path.join(f.root, 'chosen-work');
  await fs.mkdir(dir);
  await fs.writeFile(path.join(dir, 'existing.csv'), 'actual,local\n1,2');
  const b = await f.store.open(context, dir), local = path.join(f.root, 'input.txt');
  await fs.writeFile(local, 'LOCAL_CONTENT_NOT_A_MEMORY');
  await f.store.importLocal(context, [local, path.join(dir, 'existing.csv')]);
  const recorded = (await f.store.load(context)).localMaterials;
  assert.equal(recorded.length, 2);
  assert.equal(recorded[1].localName, 'existing.csv');
  const bytes = Buffer.from('LOCAL_CONTENT_NOT_A_MEMORY');
  const source = await f.store.importSource(context, {kind:'library',id:'library-source',version:2,filename:'different-name.txt',sha256:createHash('sha256').update(bytes).digest('hex')}, bytes);
  assert.equal(source.localName, recorded[0].localName);
  assert.equal((await fs.readdir(b.directory)).length, 2);
  await f.store.prompt(context, 'Make a presentation using the materials', 'local_material_request', workInput());
  const prompt = f.calls.filter(c => c.method === 'session/prompt').at(-1).args.content[0].text;
  assert(prompt.includes('existing.csv')); assert(prompt.includes('library-source'));
  assert(!prompt.includes('LOCAL_CONTENT_NOT_A_MEMORY'));
  assert(!f.calls.some(c => c.method.includes('upload')));
  await fs.writeFile(path.join(b.directory, source.localName), 'edited');
  const second = await f.store.importSource(context, {kind:'library',id:'another-source',version:1,filename:'original.txt',sha256:recorded[0].sha256}, bytes);
  assert.notEqual(second.localName, source.localName);
  assert.equal(await fs.readFile(path.join(b.directory, source.localName), 'utf8'), 'edited');
});

const archiveSelection = (names, overrides = {}) => ({requestId:'archive_request_fixture_001', collectionId:'collection_synthetic', collectionName:'Synthetic shared files', scope:'lab_shared', expectedCollectionVersion:1, names, ...overrides});
test('archive lost responses replay original PPT bytes and keys after restart; changed drafts do not create duplicates', async t => {
  const f=await fixture(t), b=await f.store.open(context);
  await fs.writeFile(path.join(b.directory,'plan.pptx'),'synthetic ppt bytes');
  await fs.writeFile(path.join(b.directory,'data.xlsx'),'synthetic workbook');
  const selection=archiveSelection(['plan.pptx','data.xlsx']), accepted=new Map();
  let version=1, lose=true;
  const post=async(url,body,key)=>{
    routes.importResearchFile.request.parse({params:{id:selection.collectionId},query:{},body,headers:{'Idempotency-Key':key}});
    assert.equal(url,'/api/v1/research-library/collections/collection_synthetic/files');
    if(accepted.has(key)){ assert.equal(JSON.stringify(body),accepted.get(key).body); return accepted.get(key).result; }
    assert.equal(body.expectedCollectionVersion,version++);
    assert(!body.metadata.note.includes(b.directory));
    assert(body.mediaType.includes('openxmlformats'));
    const result={id:'saved-'+version,version:1,sha256:createHash('sha256').update(Buffer.from(body.contentBase64,'base64')).digest('hex'),extraction:'original_only'};
    accepted.set(key,{body:JSON.stringify(body),result});
    if(lose){lose=false;throw Error('lost response');}
    return result;
  };
  await assert.rejects(f.store.archive(context,selection,async()=>{},post),/lost response/);
  await fs.writeFile(path.join(b.directory,'plan.pptx'),'changed after first upload');
  await assert.rejects(f.restart().archive(context,{...selection,names:['data.xlsx']},async()=>{},post),/原归档/);
  const result=await f.restart().archive(context,selection,async()=>{},post);
  assert.equal(result.status,'archived');assert.equal(result.files.length,2);assert.equal(accepted.size,2);
  assert.equal(result.files[0].sha256,createHash('sha256').update('synthetic ppt bytes').digest('hex'));
  await f.restart().archive(context,selection,async()=>{},post);assert.equal(accepted.size,2);
});

test('archive checks current collection permission on replay and only rebases a definite version rejection', async t => {
  const f=await fixture(t),b=await f.store.open(context);
  await fs.writeFile(path.join(b.directory,'result.md'),'synthetic result');
  const s=archiveSelection(['result.md']);let reject=true,calls=0;const keys=[];
  const post=async(_url,body,key)=>{calls++;keys.push(key);if(reject)throw Object.assign(Error('conflict'),{code:'VERSION_CONFLICT'});assert.equal(body.expectedCollectionVersion,5);return{id:'saved',version:1,sha256:'a'.repeat(64),extraction:'text_extracted'};};
  await assert.rejects(f.store.archive(context,s,async()=>{},post),/conflict/);
  assert.equal((await f.store.load(context)).archive.versionConflict,true);
  await assert.rejects(f.restart().archive(context,s,async()=>{throw Error('revoked');},post),/revoked/);assert.equal(calls,1);
  reject=false;
  await f.restart().archive(context,{...s,expectedCollectionVersion:5},async()=>{},post,true);
  assert.equal(calls,2);assert.notEqual(keys[0],keys[1]);
  const next=archiveSelection(['result.md'],{requestId:'archive_request_fixture_002',expectedCollectionVersion:6});
  await assert.rejects(f.store.archive(context,next,async()=>{},post,true),/原归档/);
});

test('archive rejects traversal, links and oversize files before any upload, and does not turn local files into submitted tasks', async t => {
  const f=await fixture(t),b=await f.store.open(context);let uploads=0;
  const post=async()=>{uploads++;return{};};
  await assert.rejects(f.store.archive(context,archiveSelection(['../private.txt']),async()=>{},post),/路径/);
  const outside=path.join(f.root,'outside-archive');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'private.txt'),'private');
  await fs.symlink(outside,path.join(b.directory,'linked'),'junction');
  await assert.rejects(f.store.archive(context,archiveSelection(['linked/private.txt']),async()=>{},post),/链接/);
  const oversized=await fs.open(path.join(b.directory,'large.pptx'),'w');await oversized.truncate(512*1048576+1);await oversized.close();
  await assert.rejects(f.store.archive(context,archiveSelection(['large.pptx']),async()=>{},post),/512 MiB/);
  assert.equal(uploads,0);assert.equal((await f.store.load(context)).delivery,undefined);
  f.deny();await assert.rejects(f.store.archive(context,archiveSelection(['large.pptx']),async()=>{},post),/expired/);
});

test('large originals use bounded chunks and persisted snapshots across interruption and lost completion acknowledgement',async t=>{
  const f=await fixture(t),b=await f.store.open(context),original=Buffer.alloc(11*1048576+3,81);
  const file=path.join(b.directory,'large.pptx');await fs.writeFile(file,original);
  const selected=archiveSelection(['large.pptx']);const parts=new Map();let manifest,stop=true,lose=true,published,chunkCalls=0;
  const post=async(url,body,key)=>{
    if(url.endsWith('/uploads')){manifest??=structuredClone(body);assert.equal(JSON.stringify(body),JSON.stringify(manifest));return{chunkBytes:1048576,receivedParts:[...parts.keys()]};}
    if(url.endsWith('/parts')){
      const bytes=Buffer.from(body.contentBase64,'base64');assert(bytes.length<=1048576);chunkCalls++;
      parts.set(body.index,bytes);if(body.index===2&&stop){stop=false;throw Error('network interruption');}return{accepted:true};
    }
    assert(url.endsWith('/complete'));
    if(!published){const bytes=Buffer.concat([...parts.entries()].sort((a,b)=>a[0]-b[0]).map(e=>e[1]));assert.deepEqual(bytes,original);published={id:'large',version:1,sha256:createHash('sha256').update(bytes).digest('hex'),extraction:'original_only'};}
    if(lose){lose=false;throw Error('lost completion');}return published;
  };
  await assert.rejects(f.store.archive(context,selected,async()=>{},post),/network interruption/);
  await fs.writeFile(file,'changed source after snapshot');
  await assert.rejects(f.restart().archive(context,selected,async()=>{},post),/lost completion/);
  const calls=chunkCalls;const result=await f.restart().archive(context,selected,async()=>{},post);
  assert.equal(result.status,'archived');assert.equal(chunkCalls,calls);assert.equal(parts.size,12);
  assert.equal((await fs.readdir(f.store.root)).filter(n=>n.endsWith('.snapshot')).length,0);
});

test('local material copies and shared originals larger than 10 MiB remain file based',async t=>{
  const f=await fixture(t),b=await f.store.open(context),original=Buffer.alloc(51*1048576,29),input=path.join(f.root,'large-local.pptx');
  await fs.writeFile(input,original);await f.store.importLocal(context,[input]);
  const saved=await f.store.load(context);assert.equal(saved.localMaterials[0].size,original.length);
  const source={kind:'library',id:'large_shared',version:1,filename:'shared.pptx',sha256:createHash('sha256').update(original).digest('hex')};
  const selected=await f.store.importOriginal(context,source,input);assert.equal(selected.localName,saved.localMaterials[0].localName);
  assert.deepEqual(await fs.readFile(path.join(b.directory,selected.localName)),original);
});
