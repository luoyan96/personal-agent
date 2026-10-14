# 科研 Skill 连续输入与资料调用修复（2026-10-14）

`acceptcat-2`继续已有科研技能库的实际调用质量。分支 `fix/skill-continuous-routing` 基于 PR41 / `e95db40`，生产提交 **7d2a9c872e8855a37038737cb24969d4d94d6370**，[草稿 PR42](https://github.com/luoyan96/personal-agent/pull/42)。不扩充社区目录或引入执行沙箱；保留 `agents/skills` 单一来源。

## 复现与修复

API首次接受明确所选 Skill 时原本会排除助理分派与创建 Agent，但连续消息路径有三处缺少相同条件：首条带创建词句、合并后按整批文字重算目的，会变成 create_agent；首条带科研工作指令，合并后变成 coordinate；补充带工作指令，提前取消原批而另建一个回合。前两种路径的 ChatWorker 进入创建/分派分支，所选技能说明和参考文件没有进入模型；资料绑定也可能因为这些标记被排除。不能把正常私人文字技能误称为脚本已执行或工作已委派。

在现有 API 聊天分流的三处补齐 `!skill`，让相同 Skill/版本/选定参考的补充继续走普通文字调用。已存在的不同 Skill、参考、附件等批次边界以及授权/版本守卫保持。普通无 Skill 的显式创建与个人助理分派继续按既有路径执行。

`checkTurnInput`同时拒绝已存储的 Skill 与 purpose/assistantMode/personalAssistant 混合状态，包含 worker 执行前、晚回执检查和重试。旧版排队异常请求取消为 INPUT_CHANGED，零模型尝试、没有输出，不能直接重试混合指令；需要用户按当前所选 Skill 发起新消息。此修复不重写历史输入，不撤销已经发生的旧版创建/分派，也不自动把异常回合改成成功。

## 实际检查

Git 外证据：`D:/deepseek-agent/.runtime/skill-routing-20261014`。仅合成账号、材料与模型；没有真实供应商调用或已安装桌面二进制验收。测试服务为临时 loopback HTTP / SQLite / 真实 ChatWorker，测试结束自动关闭并清理自己的临时目录。

- `baseline-confirmed.log`：旧代码三个新增案例全部复现失败，分别为 create_agent、coordinate、两个不同 turn ID。更早 `baseline-failure.log`第一案例的无回执期望错误和缺少分隔符保留；调整为确实符合现有识别器的创建词句后才记复现。
- `focused-final.log`：**23项**定向检查通过（Skill13项、continuous-chat10项）。新增**7个场景**，检查真实请求/所选说明与参考/完整当前批输入/模型调用数/保存的消息与使用记录；不依赖固定 UI 字样宣称成功。未选参考秘密标记不进 prompt，另一个账号不能读私人 Skill 或资料。
- canonical SLR 使用当前打包来源的完整说明和 `references/slr-checklist.md`，经实际私人安装、绑定、连续消息调用。合成 TXT 中 S1无对照、S2仅有摘要；获准片段带来源ID、版本、SHA，模型夹具回复和真实读取回执保存。夹具回复明确是“不完整范围综述，未创建文件”；这不是模型学术质量评估或 PRISMA完成证据。
- 相同流程在执行前撤回私人集合：零模型调用、零尝试、无成功输出。旧混合状态两例：零模型调用/尝试、取消为 INPUT_CHANGED、重试409，新 Skill 消息可成功回复。
- `focused-library-first.log`撤回夹具使用了导入前的旧集合版本导致409；改为通过实际读取取得当前版本后执行撤回，没有改变 API 版本规则。`foundation-ci.log`的新夹具空数组被推断为 never[]、`foundation-ci-final.log`漏导入类型失败保留；补齐测试契约类型后 `typecheck-final.log`通过。未放宽测试时限、权限或生产检查。

`foundation-ci-passed.log`：最终完整 **pnpm run ci**通过 **52文件 / 656测试**（146.19秒）、真实生产CLI/HTTP两项、B0进程与生产夹具隔离，包含固定Harness构建/类型与缺凭据边界。前两次全检查都在新增测试类型处失败，未重复一个已经通过的完整门槛。后续仅文档，不再重复全检查。本轮未修改前端，不重复渲染/桌面构建验证。

复现命令（仓库根，先按项目正常构建）：

```powershell
node node_modules/vitest/vitest.mjs run apps/api/tests/skills.spec.ts apps/api/tests/continuous-chat.spec.ts
pnpm run ci
```

后续文档 `check:content`通过178份Markdown / 10个内置Skill定义（`content-final.log`）。PR42生产提交的 GitHub `38505283235`另跟踪：交接时Ubuntu22.19/24已成功、Windows24仍运行，快照 `pr42-ci-production.json`；不能借PR41成功宣称新PR全部远端矩阵通过。

后续确认同一生产提交的GitHub38505283235三平台**全部成功**（不是后续文档HEAD），记录 `pr42-ci-production-passed.json`。PR说明更新一次TLS handshake timeout，随后元数据读取EOF，属于网络失败；Git推送与上述成功矩阵无误，PR说明以同正文可重试。一次交接补丁引用了不存在的文本导致校验失败、零文件改动，改用已读取的准确锚点后补录。

## 发布与协调

**没有安装包、Release、部署、迁移或用户客户端重启。** 沿用2026-10-10 `aee02447` / Windows0.10.0 / contract0.24 / schema022部署记录，公开更新源此前0.6.0，本轮未重验线上。补丁需后续成对更新 API/worker；当前已安装用户不能被告知已经获得此修复。

没有新增依赖、API字段、权限策略或第三方素材；内置技能正文及引用保持。本批包含 PR37—41链，不含独立兄弟 PR35/36，合并协调 `chat.ts`及状态/评估文档。承接 PR41生产 `db9ec3d` 的 GitHub `38502596075`，本轮确认 Ubuntu22.19/24和Windows24全部成功，证据 `pr41-ci-passed.json`；PR42矩阵独立追踪。

文字执行器依然不提供联网、Python/shell、绘图或 artifact_save。接续优先做明确输入输出、可检查失败与真实科研结果的工具适配；真实供应商和师生持续使用需独立验收。界面里的参考选择/依赖说明也可继续改进，不以本批调用可靠性修复计为工具执行完成。
