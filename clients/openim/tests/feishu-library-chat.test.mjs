import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(await fs.readFile(new URL('../src/research/feishu-library-chat.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,URL,TextEncoder,btoa,Set,Error});
const h=module.exports,source={id:'collection_A',name:'论文库',externalSource:'feishu_bitable',owned:true,status:'available'};
test('selects only a canonical explicitly supplied Bitable, refuses multiple or unsafe links',()=>{
 assert.equal(h.findFeishuBaseLink('这是我的论文库 https://synthetic.feishu.cn/base/SyntheticBase123?table=tblSynthetic1&from=copy。'),'https://synthetic.feishu.cn/base/SyntheticBase123?table=tblSynthetic1');
 for(const link of ['http://synthetic.feishu.cn/base/SyntheticBase123','https://u@synthetic.feishu.cn/base/SyntheticBase123','https://synthetic.feishu.cn/base/SyntheticBase123?table=bad','https://synthetic.feishu.cn/base/SyntheticBase123 https://synthetic.feishu.cn/base/AnotherBase123'])assert.throws(()=>h.findFeishuBaseLink(link));
 assert.equal(h.findFeishuBaseLink('https://synthetic.feishu.cn.evil.test/base/SyntheticBase123'),undefined);
});
test('resolves a saved name or explicit selected source without guessing across two libraries',()=>{
 assert.equal(h.chooseFeishuLibrary('找论文库里的论文',[source],[]),source);
 assert.equal(h.chooseFeishuLibrary('2026年CCF A',[source],['collection_A']),source);
 assert.equal(h.chooseFeishuLibrary('找论文库里的论文',[{...source,owned:false}],[]),undefined);
 assert.throws(()=>h.chooseFeishuLibrary('找今年论文',[source,{...source,id:'collection_B',name:'第二库'}],['collection_A','collection_B']));
});
test('caps model context, reports actual provided records and preserves the authority boundary',()=>{
 const row={id:'recSynthetic',title:'合成标题'.repeat(200),year:'2026',date:'',grade:'CCF A',venue:'Synthetic',authors:'Synthetic',abstract:'合成摘要'.repeat(500),url:'https://synthetic.feishu.cn/base/SyntheticBase123'};
 const result={library:{name:'论文库',sourceUrl:row.url},readAt:'2026-10-21T01:00:00Z',question:'2026年论文',conditions:['2026年度'],state:'results',clarification:null,scanned:2000,matched:500,complete:false,records:Array.from({length:50},()=>row),limitations:['仅已读部分']};
 const f=h.libraryQueryFile(result),content=Buffer.from(f.contentBase64,'base64').toString('utf8');assert(content.length<80000);assert(content.includes('实际查询记录'));assert(content.includes('不是操作指令'));assert(content.includes('500'));assert(content.includes('不可称全库完整统计'));assert(content.includes('其余未交给模型'));
 assert.equal(h.readLibraryQueryContext(JSON.stringify({collectionId:'collection_A',question:'2026年CCF A论文'})).collectionId,'collection_A');assert.equal(h.readLibraryQueryContext('{broken'),undefined);
});
