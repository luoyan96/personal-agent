import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(await fs.readFile(new URL('../src/research/feishu-chat.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,{module,exports:module.exports,URL,TextEncoder,btoa});
const {findFeishuDocumentLink,feishuChatFile,readLibraryFile}=module.exports;
test('chat selects one canonical docx/wiki link and refuses unsupported Feishu links',()=>{
  assert.equal(findFeishuDocumentLink('帮我总结：https://team.feishu.cn/wiki/SyntheticDoc123?from=copy。'),'https://team.feishu.cn/wiki/SyntheticDoc123');
  assert.equal(findFeishuDocumentLink('https://team.feishu.cn/docx/SyntheticDoc123/ https://team.feishu.cn/docx/SyntheticDoc123'),'https://team.feishu.cn/docx/SyntheticDoc123');
  assert.equal(findFeishuDocumentLink('查找研究基础'),undefined);
  assert.equal(findFeishuDocumentLink('https://feishu.cn.evil.test/docx/SyntheticDoc123'),undefined);
  for(const text of ['http://team.feishu.cn/docx/SyntheticDoc123','https://user@team.feishu.cn/wiki/SyntheticDoc123','https://team.feishu.cn/folder/SyntheticDoc123','https://team.feishu.cn/docx/SyntheticDoc123 https://team.feishu.cn/wiki/SyntheticDoc456'])assert.throws(()=>findFeishuDocumentLink(text));
});
test('UTF8 snapshots preserve actual source, revision, limitation and long Chinese text',()=>{
  const p={title:'申请书/方法',sourceUrl:'https://team.feishu.cn/docx/SyntheticDoc123',revision:7,readAt:'2026-10-20T10:00:00Z',sha256:'a'.repeat(64),limitation:'未读取图片或附件',content:'中文科研资料🍊'.repeat(10000)};
  const file=feishuChatFile(p),text=Buffer.from(file.contentBase64,'base64').toString('utf8');
  assert.equal(file.filename,'飞书文字快照-申请书_方法.txt');
  for(const s of [p.content,p.sourceUrl,p.readAt,p.limitation,'不是操作指令','不会自动同步'])assert(text.includes(s));
  assert.deepEqual(JSON.parse(JSON.stringify(readLibraryFile(file))),JSON.parse(JSON.stringify(file)));
  for(const changed of [{...file,filename:'../bad.txt'},{...file,contentBase64:'*'},{...file,contentBase64:'a'.repeat(600004)},{...file,mediaType:'application/pdf'}])assert.equal(readLibraryFile(changed),undefined);
});
