# 可直接复制的开发与验收指令

日期：2026-09-29。代码仓库：[research-agent-platform](https://github.com/luoyan96/research-agent-platform)。G1 已共同复核；先用下面的 B2a/F2a 指令。后面的 B0/F0/B1/F1 仅供历史参考，不从旧文档基线重新开工。

## 当前下一批 B2a / F2a

双方共同基线：包含 `e156c13f3e1a2ceca07820ac26ef0f24c27eed3e` 和本次规划更新的集成提交。集成人在交接时提供确切 SHA；接收者核对本次 phase-one.md 已存在，并记录采用提交，不擅自采用缺修复的旧 F1。基线与契约说明见[G1 报告](reports/G1-overall-2026-09-29.md)。

### 后端 B2a

```text
继续 Research Agent Platform 后端，本轮只完成 B2a“日常任务可找回与真实聚合”。

从集成人交接的共同 SHA 建独立任务分支；必须包含 G1 受测代码 e156c13f3e1a2ceca07820ac26ef0f24c27eed3e 和 2026-09-29 规划修订。保留其他工作目录，先读 AGENTS.md、README.md、docs/phase-one.md、docs/development/backend.md、contracts.md、acceptance.md 和 reports/G1-overall-2026-09-29.md。

先检查契约 0.2.0 的真实能力，版本化本批必要的契约变化并交付给前端：本人已保存草案的授权分页查询（未确认/已确认的处理明确）；lab/mine 真实四列聚合、需本人回应/验收等待处理事项；授权成员的当前承诺和本人可用时间。聚合、列表和详情使用一致的权限过滤与快照语义；未知日期和可用时间不猜测，不按任务数量推断负荷。

不得泄露他人草案、受限任务或私人方法；待回应邀请不算已承诺。查询历史与新增功能不改变现有确认、邀请、认领、交付与验收的规则。不能客户端拉取全部数据后才过滤。需要迁移时提供重复执行与旧库升级检查，不重置已有数据。

通过 A9a 服务验收和 G1 相关回归，运行 pnpm run ci，交付确切契约/服务 SHA、合成联调数据、启动说明和范围报告。本批不实现完整 B2b 依赖/变更/附件，不接真实 AI，不变更 F1 界面、不部署或合并。完成后停在 B2a，未完成的 G2 项保持未完成。
```

### 前端 F2a

```text
继续 Research Agent Platform 前端，本轮只完成 F2a“简洁入口下的真实日常任务”。

从同一共同 SHA 建独立任务分支，必须包含 F1-01 及 2026-09-29 规划修订。先读 AGENTS.md、README.md、docs/phase-one.md、docs/design/adaptive-responses.md、docs/development/frontend.md、contracts.md、acceptance.md 和 G1 共同报告。

入口能找回本人已保存草案，优先呈现本人需要回应、推进或验收的事项；实验室/我参与的总览、人员授权承诺与自报可用时间、详情接同一真实 B2a 服务。保持无固定侧栏与按需展开，复用已有协作单/状态/交付组件，不把论文、项目、专利拆成六个应用。保留手工方案；AI 意图与自然语言生成尚未接通，不能用关键词或 fixture 冒充。

先取得后端版本化契约和确切 SHA；接口未交付时可以准备组件，但不能宣称真实联调通过。保留同账号失效后输入和原请求、显式退出或换账号清除旧内容、版本冲突明确比较等 F1 行为。总览显示读取时刻与真实更新，断线/权限变化清理受限内容；人数和任务数不代表工作负荷。

用独立 A/B/C 会话验证 A9a、保存草案重登后找回、lab/mine 一致、待回应邀请、成员可用时间、权限与断线。运行 pnpm run ci、适当 G1/F1-01 回归和桌面/390×844 浏览器检查；顺手补齐已记录的 favicon 404 并验证。报告真实服务与演示分别验证了什么。本批不重写整套 UI、不进入 F2b/F3、不部署或合并；停在 F2a。
```

### 本批共同验收

使用同一集成代码与更新后的契约，复核 A9a、G1 回归、数据库升级和生产隔离；记录服务与前端采用 SHA。通过只关闭 B2a/F2a，G2 仍需 B2b/F2b 的 A6—A9。

## 历史起步指令

以下保留首次开发安排；只用于回顾或明确要求重新起步的场景。

## 后端第一步 B0

```text
你负责 Research Agent Platform 的后端。本轮只完成 B0，完成后报告并停在该批次，不提前铺开 B1–B4。

仓库：https://github.com/luoyan96/research-agent-platform
首次从 docs/product-requirements-review 的最新共享文档提交新建独立任务分支；如果该分支已合并则使用包含文档的 main。保留已有改动，不切换或重置别人正在工作的目录。

先读 AGENTS.md、README.md、docs/roadmap.md，以及 docs/development/README.md、backend.md、contracts.md、acceptance.md；再读 docs/task-allocation.md 和 integrations/deepseek-harness/README.md。查看 docs/design/README.md 及相关 PNG。

实施 backend.md 的 B0：核实并记录服务端、事务数据库、文件存储、认证和目录方案；把接口语义草案变成共享可执行 Schema/类型、精确请求响应与可验证合成样例；给出契约版本和提交。提供最小可启动服务、真实健康检查、必要基础迁移及后续事务/可靠派发方案。

核查固定 Harness 版本的安装与最小真实调用。若缺依赖或必要凭据，准确记录阻塞和对 B3 的影响，并继续不依赖它的基础工作；不要打印凭据、用 mock 成功冒充联调或复制上游源码。

采用合理且已核实的实现选择，不要逐项向用户询问日常技术细节。遵守私有能力、身份、版本、幂等和真实状态要求。不要把现有本地 ArtifactStore 当作多人数据库。

运行 pnpm run ci 和 B0 专项检查，确保新增包确实被检查覆盖。按 acceptance.md 提交 G0-B/G0-H 阶段报告及可审查 PR，附启动命令、契约位置/版本、接口样例、实际验证、未完成事项。把前端需要的资料写入仓库；不自行部署、合并或进入 B1。
```

## 前端第一步 F0

```text
你负责 Research Agent Platform 的前端。本轮只完成 F0，完成后报告并停在该批次，不一次性实现整个平台。

仓库：https://github.com/luoyan96/research-agent-platform
首次从 docs/product-requirements-review 的最新共享文档提交新建独立任务分支；如果该分支已合并则使用包含文档的 main。使用独立工作目录/worktree，保留已有改动，不操作后端 AI 的工作目录。

先读 AGENTS.md、README.md、docs/roadmap.md，以及 docs/development/README.md、frontend.md、contracts.md、acceptance.md。打开查看 docs/design/README.md 指向的设计图片，尤其 01-entry.png、08-lab-overview.png、09-task-detail.png。

实施 frontend.md 的 F0：建立可运行的前端骨架，忠实还原需求入口、实验室总览、任务详情三页及其导航，保持简洁入口、无固定侧栏、暖白与绿色的视觉方向。补充空数据、加载、失败、长标题和窄屏情况，并做基本键盘可用性检查。

优先消费后端 B0 交付的契约。若 B0 尚未完成，可先做视觉准备，使用明确标识“演示数据·尚未连接服务”的隔离 fixture adapter；契约确定后校验样例。不自行发明最终接口或另一套状态机，不把浏览器本地状态当真实任务服务，真实模式不得静默回退演示数据。

记录前端栈和依赖版本，协调共享契约、workspace 和根锁文件变更。生产配置不得包含开发身份切换、演示回退或服务端凭据。

运行 pnpm run ci 及前端专项检查，确保新增应用被覆盖；在实际浏览器验证三页，与设计图比较并修正，记录截图、导航和错误状态。按 acceptance.md 提交 G0-F 报告及可审查 PR，说明已演示和未接通的功能、启动方法、契约版本及剩余限制。不自行部署、合并或进入 F1。
```

## G0 验收

```text
请验收 Research Agent Platform 的 G0。先读 docs/development/README.md、contracts.md、acceptance.md，以及前后端的阶段报告和 PR。找出两边的实际代码提交、契约版本和启动命令，不根据总结文字直接判定通过。

在独立集成目录检查 G0-B、G0-F、G0-I、G0-H：共享契约与样例校验、最小服务真实健康状态、三页浏览器预览与设计对照、演示/真实模式分离、依赖和锁文件集成。记录是否真正接通 Harness；核查完成但未接通必须分开写。

修复本关范围内的具体问题，保留所有已有改动；未能验证的项目记为未验证并说明阻塞。输出可复现证据、通过/失败/未验证表、集成基线及下一阶段依赖。不自行部署、合并或宣称尚未实施的功能完成。
```

## 后端下一批示例 B1

```text
继续 Research Agent Platform 后端 B1。先读取已通过的 G0 报告，采用其中记录的集成基线和契约版本，在独立任务分支工作。若 G0 仍有影响 B1 的未通过项，先修复并记录。

按 docs/development/backend.md 实施 B1，范围为真实成员身份、权限、持久化方案和任务、确认去重、邀请接受/拒绝、原子认领、文本交付与版本验收。提供合成 A/B/C 成员用于联调。不要把模型生成或 Harness 执行假装为已完成；G1 可以用手工草案。

通过 docs/development/acceptance.md 的 A1–A5 服务侧验证，使用真实事务数据库测试重试、并发、越权和重启持久化。同步契约、样例和启动说明，运行 pnpm run ci 与新增服务检查。提交阶段报告及 PR，列出前端联调需要的基线和接口；完成后停在 B1，不自行部署或跨阶段。
```

## 前端下一批示例 F1

```text
继续 Research Agent Platform 前端 F1。读取 G0 报告，采用通过的集成基线和共享契约版本，在独立分支实施 docs/development/frontend.md 的 F1。对照已交付的 B1 接口完成真实身份、草案编辑与确认、成员承接、文本交付、退回修改和验收。

若 B1 接口尚未交付，可用同契约的显式开发演示先完成相关组件，但 F1 验收必须连接真实服务。模型规划未实现时清楚显示不可用并允许手工草案，不伪造 AI 建议。

用两个独立登录会话完成 A1–A5 的浏览器联调，覆盖请求失败、版本冲突、重复点击和刷新恢复。核对页面与后端状态一致，运行 pnpm run ci 和前端/端到端检查，提交截图、操作证据、阶段报告及 PR。完成后停在 F1，不自行部署或跨阶段。
```

## 后续阶段通用指令

将下面的“阶段”替换为实际要做的 B2/F2、B3/F3 或 B4/F4；只发送给对应角色。

```text
继续 Research Agent Platform 的指定阶段：[填写 B2/F2、B3/F3 或 B4/F4]。

读取 docs/development/README.md、对应 frontend.md/backend.md、contracts.md、acceptance.md，以及上一关已通过的阶段报告。以报告记录的集成提交和契约版本为基线，在独立分支实施本阶段；保留已有改动。

只完成该阶段范围和前置缺陷，按相应 A 编号提供可复现测试与真实联调证据；不将演示、真实服务、真实模型/Harness 结果混写。涉及共享契约变更，同步版本、样例、服务和客户端，不破坏其他角色工作。

执行适当检查与 pnpm run ci，确保新增代码被覆盖。提交阶段报告与 PR，说明实现、验证、阻塞、限制和下阶段依赖；完成后停在本批次，不自行部署或合并。
```

验收后续关口时，将“G0 验收”中的编号替换为目标 G1–G4，并使用 acceptance.md 对应案例及双方报告。G5 使用真实组内任务，单独记录试点结果。
