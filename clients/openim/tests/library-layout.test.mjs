import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real entry and compatibility hook, controlling only the transport
// result and leaf screens. In particular an actor refresh removes read.data.
async function fixture() {
  let cursor = 0;
  const refs = [];
  const f = { generation: 1, read: { data: undefined, error: '', loading: true, refresh: async () => { f.retries++; } }, retries: 0, panel: '' };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    '@ant-design/icons': new Proxy({}, { get: (_, key) => String(key) }),
    './record-workspace.scss': {},
    react: { useRef(value) { const index = cursor++; return refs[index] ||= { current: value }; }, useEffect() {}, useSyncExternalStore(_subscribe, get) { return get(); } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    antd: { Button: 'Button', Segmented: 'Segmented', Spin: 'Spin' },
    'react-router-dom': { useSearchParams: () => [new URLSearchParams(f.panel), () => {}] },
    './useResearchRead': { useResearchRead: () => f.read },
    './store': { useResearchStore: selector => selector({ generation: f.generation }) },
    './workspace.scss': {}, './library-workspace.scss': {},
    './LabStandards': { LabStandards: 'Standards' },
    './LibraryIndexPage': { LibraryIndexPage: 'Index' },
    './ResearchLibrary': { ResearchLibrary: 'Legacy' },
    './TeamLibraryWorkspace': { TeamLibraryWorkspace: 'Team' },
    './WorkspaceReports': { WorkspaceReports: 'Reports' },
  };
  const load = async file => {
    const source = await readFile(new URL(`../src/research/${file}`, import.meta.url), 'utf8');
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText, { module, exports: module.exports, require: name => {
      assert(Object.hasOwn(imports, name), name); return imports[name];
    } });
    return module.exports;
  };
  imports['./request-deadline'] = {};
  imports['./service-version'] = await load('service-version.ts');
  f.observeVersion = imports['./service-version'].observeServiceVersion;
  imports['./workspace-availability'] = await load('workspace-availability.ts');
  const { useWorkspaceAvailability } = imports['./useWorkspaceAvailability'] = await load('useWorkspaceAvailability.ts');
  const { LibraryWorkspace } = await load('LibraryWorkspace.tsx');
  f.hook = (enabled = true) => { cursor = 0; return useWorkspaceAvailability(enabled); };
  f.render = () => { cursor = 0; return LibraryWorkspace(); };
  f.confirm = version => { f.read = { ...f.read, data: { available: true, version }, error: '', loading: false }; };
  f.pending = () => { f.generation++; f.read = { ...f.read, data: undefined, error: '', loading: true }; };
  return f;
}
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node)
  ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const has = (tree, type) => nodes(tree).some(node => node.type === type);

test('a validated API version opens the correct layout even when the separate probe has stalled', async () => {
  const f = await fixture(); f.observeVersion('0.45.0');
  assert(has(f.render(), 'Team')); f.read.error = 'probe timeout';
  assert.equal(f.hook().error, ''); assert.equal(f.hook().loading, false);
  f.observeVersion('invalid'); assert(has(f.render(), 'Team'));
  f.observeVersion('0.43.0'); assert(has(f.render(), 'Legacy'));
});

test('initial detection mounts neither legacy library/Agent nor team workspace', async () => {
  const f = await fixture();
  const tree = f.render();
  assert.equal(has(tree, 'Legacy'), false);
  assert.equal(has(tree, 'Team'), false);
  assert(nodes(tree).some(node => node.props?.role === 'status'));
  f.confirm('0.45.0');
  assert(has(f.render(), 'Team'));
});
test('actor/lab generation refresh cannot switch confirmed team layout to legacy', async () => {
  const f = await fixture();
  f.confirm('0.45.0'); assert(has(f.render(), 'Team'));
  f.pending();
  assert(has(f.render(), 'Team'));
  assert.equal(has(f.render(), 'Legacy'), false);
  f.read.error = 'offline'; f.read.loading = false;
  assert(has(f.render(), 'Team'));
  f.confirm('0.45.0'); assert(has(f.render(), 'Team'));
});
test('initial failure offers retry, without silently falling back to old UI', async () => {
  const f = await fixture();
  f.read.error = 'offline'; f.read.loading = false;
  const tree = f.render();
  assert.equal(has(tree, 'Legacy'), false);
  assert(nodes(tree).some(node => node.props?.role === 'alert'));
  await nodes(tree).find(node => node.type === 'Button').props.onClick();
  assert.equal(f.retries, 1);
  f.confirm('0.45.0'); assert(has(f.render(), 'Team'));
});
test('a confirmed old server retains legacy screens and can upgrade after a real version response', async () => {
  const f = await fixture();
  f.confirm('0.43.0'); assert(has(f.render(), 'Legacy'));
  f.pending(); assert(has(f.render(), 'Legacy'));
  f.confirm('0.44.0'); assert(has(f.render(), 'Team'));
});
test('confirmed service version changes are honored, not pinned indefinitely', async () => {
  const f = await fixture();
  f.confirm('0.45.0'); assert(has(f.render(), 'Team'));
  f.confirm('0.43.0'); assert(has(f.render(), 'Legacy'));
});
test('local reports work before any health result or during initial failure', async () => {
  const f = await fixture(); f.panel = 'panel=reports';
  assert(has(f.render(), 'Reports'));
  f.read.error = 'offline'; assert(has(f.render(), 'Reports'));
});
test('disabling or creating a fresh renderer does not inherit a confirmed version', async () => {
  const f = await fixture(); f.confirm('0.45.0');
  assert.equal(f.hook().version, '0.45.0');
  f.hook(false); f.pending(); assert.equal(f.hook().version, undefined);
  const fresh = await fixture(); assert.equal(fresh.hook().version, undefined);
});

test('my materials and existing index links mount the local index without a team Git workspace', async () => {
  const f = await fixture(); f.confirm('0.49.0');
  for (const panel of ['scope=mine', 'panel=index']) {
    f.panel = panel;
    const tree = f.render();
    assert(has(tree, 'Index'));
    assert.equal(has(tree, 'Team'), false);
  }
});
