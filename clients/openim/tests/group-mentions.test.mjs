import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild');
const dir = await mkdtemp(path.join(tmpdir(), 'group-mentions-'));
const output = path.join(dir, 'mentions.cjs');
await esbuild.build({entryPoints:[fileURLToPath(new URL('../src/research/group-mentions.ts', import.meta.url))],outfile:output,bundle:true,format:'cjs',platform:'node'});
const { groupMentions } = require(output);
const agent = {id:'agent',displayName:'文献助手',agent:true,external:false};
const human = {id:'human',displayName:'小林',agent:false,external:false};
test('explicit leading Agent address has exact UTF-16 ranges',()=>{
  assert.deepEqual(groupMentions('  @文献助手 整理摘要',[agent,human]),{mentions:[{contactId:'agent',start:2,end:7}],agentContactId:'agent'});
  const emoji={...human,displayName:'小林😀'};
  assert.equal(groupMentions('@小林😀 你好',[emoji]).mentions[0].end,5);
});
test('ordinary or quoted @ content does not dispatch',()=>{
  for(const text of ['转述：@文献助手 整理摘要','“@文献助手 整理摘要”','请看邮箱 a@b.com'])assert.equal(groupMentions(text,[agent,human]),undefined);
});
test('human mention stays chat; one human and Agent are both addressed',()=>{
  assert.equal(groupMentions('@小林 你好',[agent,human]).agentContactId,undefined);
  const result=groupMentions('@小林 @文献助手 对照结果',[agent,human]);
  assert.equal(result.agentContactId,'agent');assert.equal(result.mentions.length,2);
});
test('unknown, unjoined, duplicate and ambiguous names are rejected',()=>{
  assert.throws(()=>groupMentions('@未入群 去做',[agent,human]));
  assert.throws(()=>groupMentions('@文献助手 去做',[]));
  assert.throws(()=>groupMentions('@小林 @小林 你好',[human]));
  assert.throws(()=>groupMentions('@小林 你好',[human,{...human,id:'other'}]));
});
test('external or several Agents require separate explicit dispatch',()=>{
  assert.throws(()=>groupMentions('@文献助手 去做',[{...agent,external:true}]));
  assert.throws(()=>groupMentions('@文献助手 @统计助手 去做',[agent,{...agent,id:'second',displayName:'统计助手'}]));
});
test('address boundary and nonempty message are required',()=>{
  assert.throws(()=>groupMentions('@小林同学 你好',[human]));
  assert.throws(()=>groupMentions('@小林   ',[human]));
  assert.equal(groupMentions('@小林 你好 @文献助手 这句只转述',[agent,human]).mentions.length,1);
});
