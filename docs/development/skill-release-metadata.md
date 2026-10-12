# 科研 Skill 版本元数据修复（2026-10-13）

`acceptcat-2`本轮继续已有技能库的安装/版本/权限质量，不重复Zotero接入或扩充外部目录。分支 `fix/skill-release-metadata` 基于 `feature/zotero-local-library` / `90dac3ca7fadb382522a0e735b3aba0036864e6e`；生产代码 **4cb23e515794983d1f0832a944648b37c3389b62**，[草稿PR39](https://github.com/luoyan96/personal-agent/pull/39)。PR35源码授权发现与PR36附件恢复仍为未包含的兄弟分支，合并时协调共享文件及状态文档。

## 实际问题与修复

上一轮科研稿件Skill审阅记录了`metadata.version=2.1`，但原安装器只检查根`version`和正文Version标记，预览和保存会变成“未标注”。未加引号的数字版本如`2.10`若转为JavaScript Number也会变成`2.1`，影响更新与回退时的识别。

在唯一共享导入器`packages/research-skills/src/import.ts`使用已有yaml2.8.3的文档节点，按根`version`→`metadata.version`→既有正文Version标记选择自报标签。数字保留标量原写法，空缺/null继续兼容旧fallback；布尔/集合/非有限数字、控制字符和超100字符明确报错，不静默截断。无效YAML、重复键及禁止别名的边界保持。

没有改ImportedSkill/SkillPackage字段或契约，正文/参考/脚本与素材计数、依赖提示均保持。只影响新解析；已安装数据库包、摘要、权限代数、固定Git提交和本机原件不自动改写。已安装“未标注”版本若要采用新标签，需用户按现有流程明确更新为新修订；回退显示保存的旧标签。自报版本不证明作者、出处或科研质量，不能依据标签自动升级或授予权限。

## 实际验证

证据仅在Git外 `D:/deepseek-agent/.runtime/skill-release-20261013`，使用合成数据与上轮已独立核验的公开原包缓存，无个人材料/凭据。

- `parser-first.log` / `focused-final.log`：14项解析用例、6项真实HTTP/SQLite/ChatWorker技能流程，共**20项**通过。覆盖nested/root/数字原写法/正文fallback、空缺元数据、invalid/alias/长度边界，私人默认、版本更新/同编号重放/回退，旧DB修订完整行不变、旧调用守卫阻止模型、其他账号源码不可读。现有调用流程仍为合成模型，未证明真实供应商科研质量。
- 首轮新用例把既有reviseSkill200误写成201导致失败；仅修正测试期望，`focused-first.log`失败保留，未改API契约或状态码。实际响应已包含正确2.10。
- **完整`pnpm run ci`**通过52文件/**649项**、生产CLI/HTTP两项、B0进程及生产夹具隔离，包含固定Harness适配构建/类型与缺凭据边界。仅运行一次通过的全检查，日志`ci-final.log`；没有真实模型Key或Harness质量调用。
- `desktop-import-regression.log`：6项社区/固定目录导入及3项旧桌面导入，共**9项**通过。未修改React界面布局/交互，不重复先前全界面或长网络包验收。
- `native-proof.json`：真实当前原生ZIP导入器和SkillBundleStore读取固定Writer包，提交 `529b9f73ab4b48925027145800d7b49e96ccfd3c`，ZIP **9,893,431字节**/SHA256 `71ac931d618219cc1df8764483d3787925da9887f9f2edbdd6210d3661eb5859`。新解析标签2.1；其他正规化字段与旧预览逐项一致，32份原件/完整ZIP哈希保持，旧存储32份仍可读，新摘要下全部往返通过。没有脚本执行、依赖安装或供应商调用。

旧packageDigest `75d25c483eaa4f029b60147996771bff6ccedc769e940c92c0e8f2a8e73af8ab`，新`2d1ac86e7ed29441c42ee4a495941032cb232fe0d2807f4fead3836379a4beb2`；原bundle/原件哈希不变。摘要变化是新正规化标签的一部分，不冒称同一新旧软件包；不能把旧locator自动替换为新摘要。

复现（仓库根目录，先正常构建）：

```powershell
pnpm run ci
node node_modules/vitest/vitest.mjs run packages/research-skills/tests/import-release.spec.ts apps/api/tests/skills.spec.ts
```

桌面导入回归（clients/openim）：

```powershell
node --test tests/community-research-catalog.test.mjs tests/skill-import.test.mjs
```

## 发布、协调与下一步

只提交草稿PR39和文档，不更新安装版本、公开Release、部署网页/API/worker、迁移数据库或重启用户客户端。沿用2026-10-10aee02447/Windows0.10.0/schema022记录，公开版本此前核对为0.6.0，本轮未重验线上。新解析器需要实际新客户端构建后才能在安装器使用；本轮没有把测试输出描述成用户已安装版本。

`agents/skills`内置十项内容和参考目录不变，仍为单一来源。公共目录、课题组资料、私人方法、绑定和授权流程不改变；版本标签不会授予脚本/绘图/知识库能力。后续再围绕明确依赖的技能执行及可检查科研交付补齐，保持真实输出、实际读取范围与原件分开。原来的已安装包需用户决定是否更新；没有自动下载新HEAD或重写历史。
