import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';

const source = await readFile(new URL('../src/research/RepositoryEditor.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.ReactJSX } }).outputText;
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node)
  ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
function fixture(current) {
  const state = [], refs = [], calls = [];
  let cursor = 0, refCursor = 0, generation = 1, saved = 0;
  const jsx = (type, props) => ({type, props});
  const f = { discover: async url => ({url:url.trim().replace(/(?:\.git)?$/,'.git'),branch:'published',workspaceId:'from-manifest'}), calls,
    expire: () => generation++, get saved() { return saved; } };
  const imports = {
    antd: { Alert:'Alert', Input:'Input', Modal:'Modal' },
    react: { useState(initial) { const i=cursor++; if (!(i in state)) state[i]=initial; return [state[i], v => state[i]=v]; }, useRef(initial) { return refs[refCursor++] ||= {current:initial}; } },
    'react/jsx-runtime': {jsx,jsxs:jsx},
    './api': {researchApi:async (name,request) => { calls.push({name,request}); }},
    './usePersonalOperation': {usePersonalOperation:() => ({capture:() => { const started=generation; return {isCurrent:() => generation===started}; }})},
  };
  const module={exports:{}};
  vm.runInNewContext(code, { module, exports:module.exports, require:name => { assert(Object.hasOwn(imports,name),name); return imports[name]; },
    Error, crypto:{randomUUID}, window:{electronAPI:{teamLibrary:{discover:url => f.discover(url)}}} });
  f.render = () => {cursor=0;refCursor=0;return module.exports.RepositoryEditor({current,onSaved:async()=>saved++,onClose:()=>{}});};
  f.paste = url => nodes(f.render()).find(n=>n.type==='Input').props.onChange({target:{value:url}});
  return f;
}

test('connection form has exactly one blank URL field, no internal ID/branch fields, and disables empty submission', () => {
  const f=fixture(); const tree=f.render(),inputs=nodes(tree).filter(n=>n.type==='Input');
  assert.equal(inputs.length,1);assert.equal(inputs[0].props.value,'');
  assert.equal(tree.props.okText,'连接仓库');assert.equal(tree.props.okButtonProps.disabled,true);
  f.paste('https://github.com/synthetic/files');assert.equal(f.render().props.okButtonProps.disabled,false);
});

test('Enter connects both URL forms through discovery before saving its real metadata, with one stable retry key', async () => {
  for (const url of ['https://github.com/synthetic/files','https://github.com/synthetic/files.git']) {
    const f=fixture();f.paste(url);
    await nodes(f.render()).find(n=>n.type==='Input').props.onPressEnter();
    // The event handler intentionally voids the async action, as React expects.
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.calls.length,1);const {name,request}=f.calls[0];
    assert.equal(name,'saveTeamRepository');assert.equal(request.body.branch,'published');
    assert.equal(request.body.workspaceId,'from-manifest');assert.equal(request.body.expectedVersion,0);
    assert.equal(request.body.url,'https://github.com/synthetic/files.git');assert.equal(f.saved,1);
  }
});

test('discovery failure shows an error and does not overwrite an existing binding; retry uses its version', async () => {
  const f=fixture({binding:{url:'https://github.com/synthetic/files.git',version:7}});
  f.discover=async()=>{throw Error('网络不可用，原配置未更改。');};
  await f.render().props.onOk();assert.equal(f.calls.length,0);
  assert(nodes(f.render()).some(n=>n.type==='Alert'&&/原配置/.test(n.props.message)));
  f.discover=async()=>({url:'https://github.com/synthetic/files.git',branch:'release',workspaceId:'existing'});
  await f.render().props.onOk();assert.equal(f.calls[0].request.body.expectedVersion,7);assert.equal(f.saved,1);
});

test('an account/team change during discovery prevents saving the late result', async () => {
  const f=fixture();f.paste('https://github.com/synthetic/files');
  let resolve;f.discover=()=>new Promise(r=>resolve=r);
  const pending=f.render().props.onOk();
  const busy=f.render();assert.equal(busy.props.closable,false);assert.equal(nodes(busy).find(n=>n.type==='Input').props.disabled,true);
  f.expire();resolve({url:'https://github.com/synthetic/files.git',branch:'main',workspaceId:'old'});
  await pending;assert.equal(f.calls.length,0);assert.equal(f.saved,0);
});
