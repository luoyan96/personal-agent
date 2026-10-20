import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feishuPlanningDraft, stageFeishuPlanning, takeFeishuPlanning } from '../src/research/feishu-planning.ts';
const document={title:'合成申请书',sourceUrl:'https://synthetic.feishu.cn/docx/SyntheticDocument123',revision:7,readAt:'2026-10-20T00:00:00.000Z',content:'研究目标：验证材料方法。\n成果：对照报告。'};
test('planning uses an exact selected source span with revision and copy locator, rejecting invented or excessive excerpts',()=>{
 const text=feishuPlanningDraft(document,'synthetic_copy','成果：对照报告。');
 assert(text.includes(document.sourceUrl));assert(text.includes('飞书修订：7'));assert(text.includes('synthetic_copy'));assert(text.length<4000);assert(text.includes('不能据此声称已阅读整篇'));
 for(const excerpt of ['', '虚构的正文', 'x'.repeat(2201)])assert.throws(()=>feishuPlanningDraft(document,'copy',excerpt));
});
test('handoff is one-use and rejects another account, changed service/session generation or nonce',()=>{
 const nonce=stageFeishuPlanning('member_A',1,'private source');assert.equal(takeFeishuPlanning(nonce,'member_A',1),'private source');assert.equal(takeFeishuPlanning(nonce,'member_A',1),undefined);
 const foreign=stageFeishuPlanning('member_A',1,'private');assert.equal(takeFeishuPlanning(foreign,'member_B',1),undefined);
 const generation=stageFeishuPlanning('member_A',1,'private');assert.equal(takeFeishuPlanning(generation,'member_A',2),undefined);
 stageFeishuPlanning('member_A',1,'private');assert.equal(takeFeishuPlanning('wrong','member_A',1),undefined);
});
