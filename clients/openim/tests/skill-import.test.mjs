import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(path.join(root,'package.json'));
const {importSkillZip,importSkillFolder}=require(path.join(root,'dist-electron/utils/skillImport.js')),Zip=require('adm-zip');
const skill='---\nname: private-check\ndescription: Review supplied text\n---\nUse selected references/check.md. Do not invent evidence.';
test('ZIP data import preserves complete UTF8 references and reports scripts without executing them',async()=>{
  const z=new Zip();z.addFile('private-check/SKILL.md',Buffer.from(skill));z.addFile('private-check/references/check.md',Buffer.from('完整中文证据\n'.repeat(500)));z.addFile('private-check/scripts/malicious.js',Buffer.from('throw Error("MUST NOT EXECUTE")'));z.addFile('private-check/assets/sample.svg',Buffer.from('<svg onload="alert(1)"/>'));
  const result=await importSkillZip(z.toBuffer());assert.equal(result.scriptCount,1);assert.equal(result.assetCount,1);assert.equal(result.references[0].text,'完整中文证据\n'.repeat(500));assert.deepEqual(result.requirements,['脚本执行']);
});
test('rejects duplicate/absolute/traversal paths, ambiguous roots, oversized text and invalid YAML',async()=>{
  for(const unsafe of ['../secret.md','/private.txt','C:/private.txt','a\\b.md']){const z=new Zip();z.addFile('SKILL.md',Buffer.from(skill));z.addFile('unsafe-placeholder',Buffer.from('secret'));z.getEntry('unsafe-placeholder').entryName=unsafe;await assert.rejects(importSkillZip(z.toBuffer()));}
  const ambiguous=new Zip();ambiguous.addFile('a/SKILL.md',Buffer.from(skill));ambiguous.addFile('b/SKILL.md',Buffer.from(skill));await assert.rejects(importSkillZip(ambiguous.toBuffer()));
  const large=new Zip();large.addFile('SKILL.md',Buffer.from(skill));large.addFile('references/large.md',Buffer.alloc(950000,65));await assert.rejects(importSkillZip(large.toBuffer()),/900 KB/);
  const yaml=new Zip();yaml.addFile('SKILL.md',Buffer.from('---\nname: ../../bad\ndescription: x\n---\nx'));await assert.rejects(importSkillZip(yaml.toBuffer()));
});
test('folder import ignores dependency caches, refuses link escape and detects missing SKILL.md',async()=>{
  const base=path.resolve(root,'../../../.runtime/private-skills-20261008/import-test-'+Date.now());await fs.mkdir(base,{recursive:true});await fs.writeFile(path.join(base,'SKILL.md'),skill);await fs.mkdir(path.join(base,'node_modules'));await fs.writeFile(path.join(base,'node_modules/ignored.txt'),'dependency');assert.equal((await importSkillFolder(base)).name,'private-check');await fs.symlink(path.dirname(base),path.join(base,'escape'),process.platform==='win32'?'junction':'dir');await assert.rejects(importSkillFolder(base),/链接/);
});

