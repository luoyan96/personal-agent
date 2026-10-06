# 初始迁移记录

日期：2026-09-20。方式：从干净的本地源仓库按文件选择性迁入，建立新的单仓库初始提交；未导入完整 Git 历史。原始提交可通过下面的链接追溯，旧仓库未改动或删除。

| 来源 | 原始提交 | 新位置 |
|---|---|---|
| [dsh-research-plugins](https://github.com/luoyan96/dsh-research-plugins) | [42bbeffd85ff76893d59d30080efebd7d7dbd92c](https://github.com/luoyan96/dsh-research-plugins/commit/42bbeffd85ff76893d59d30080efebd7d7dbd92c) | `packages/research-core`、`integrations/deepseek-harness` |
| [dsh-research-skills](https://github.com/luoyan96/dsh-research-skills) | [5cd8a6a4940648bc3679a526da04fa722964c171](https://github.com/luoyan96/dsh-research-skills/commit/5cd8a6a4940648bc3679a526da04fa722964c171) | `agents/skills`、`agents/templates`、`evaluations` |
| 本次产品讨论 | 2026-09-20 产品规划 v0.1 | `docs/product-plan.md`，链接和工程状态说明已适配本仓库 |

## 本次调整

- 从 Harness 插件中提取平台可独立使用的对象与存储逻辑。
- 完整十项 Skills 作为唯一内容来源，移除新代码对旧六项精简正文的依赖。
- 新增 Skill 打包与加载，随包保留相对引用文件。
- 修正成果 ID 重复时先覆盖正文再报错的问题，补充原内容不变的回归验证。
- 同一存储实例的项目创建进入写入队列，避免与创建后保存成果相互覆盖索引；复用项目时统一进行 schema 检查。
- 补充跨盘绝对路径检查。当前文件存储仍不声明跨进程事务或针对恶意本地文件系统的隔离。
- 添加可独立运行的基础检查、演示和协作说明。

## 有意保留为后续参考的内容

科研桌面原型中的固定连接状态、占位成果、未接通的创建项目页面没有迁入。外链门户、主题、桌面壳和第三方任务面板也没有直接合并进平台，以免引入未验证界面和额外依赖。之后按真实任务与交互需要单独选择复用。

未迁入上游 Harness 源码、node_modules、已有构建产物、私有科研文件、运行数据库、API key 或发布凭据。旧 npm 自动发布流程也没有迁入；本仓库两个包及适配包都标记为 private。

## 已观察到的依赖问题

原插件依赖本机相邻 Harness 目录。尝试替换为公开依赖时，原 `0.1.0-rc.5` 工具包不可取得，公开 `0.0.1-rc.1` 的安装又因缺少 `@deepseek-ai/dsh-type-meta` 返回 404。当前以基础包独立开发、适配源码待验证处理，详见[适配说明](../integrations/deepseek-harness/README.md)。

新平台已迁入模块的后续维护以本仓库为主。旧仓库可保持既有用途，后续是否归档或改变发布来源单独决定。

## 2026-09-21 F0 前端

在独立 worktree 中从共享文档提交 ed36ac6 新建 apps/web，不迁入旧探索前端或 Harness 源码。按现有 01/08/09 设计图实现 TypeScript + Vite 三页预览；品牌小图裁自 01-entry.png，图标通过官方 Phosphor 依赖消费。未采用包含发布配置的通用演示模板，遵守本仓库 pnpm workspace 和只做 F0 的范围。展示投影与最终服务契约分离，生产不能启动 fixture 模式。

## B3 持久执行（2026-09-30）

共同基线 98bef3bbab897b7d27b1507cb0c557299dab56b6，新增 006-execution.sql，不修改 001—005。规划/运行/尝试队列与通知 outbox 分离；官方 Harness 0.2.0-rc.1 的受限 LlmRuntime 组合纳入默认 workspace，旧六工具插件不接团队权限。安装成功，真实模型目前因凭据缺失未验证。升级与配置见 [B3 联调包](development/b3-handoff.md)。


## B4a · 007授权结论与方法维护

共同G3基线后只追加007，不改001—006。保留既有capability.version配置代次，导入不可变legacy_b3方法v1，不伪造发布；为旧运行追加methodVersion/configurationGeneration等元数据。结论修订、递归派生依赖、公开片段授权及方法事件另表保存。真实B3旧库重复升级和原表逐行保留已验证。细节、校验和与启动见 [B4a联调包](development/b4a-handoff.md)。不覆盖别人数据库、不重置旧数据。

## 008：小组维护与恢复

新增account_controls及maintenance_audit，不修改001—007或业务承诺；既有账号维护版本初始化为1。API契约保持0.6.2。升级前停写备份；本版备份工具支持已知G4a迁移前缀，恢复仅到新目录并使旧会话/未结束运行失效。命令、审计、密钥保管与恢复验证见[B5a联调包](development/b5a-handoff.md)。

## 2026-10-04：OpenIM UI 采用与会话状态

用户选定 OpenIM 聊天客户端并授权采用可用源码。上游完整参考仓库保持独立；实际适用的 UI 模块从 `openimsdk/openim-electron-demo` 提交 `62d7ca7b12e91144b315f36c8ebd1d9e0457a352` 移植到当前 Vite/TypeScript 应用，逐文件源路径、使用位置和修改说明见 [来源清单](../apps/web/third-party/openim/ORIGIN.md)。保留原 LICENSE 和 README 许可声明；未把依赖整套 React/Electron/IM SDK 的模块伪装成当前服务的已接通能力。用户后续沟通商业授权，当前来源记录不声称取得商业许可。

科研账号、实验室、任务、材料、worker 与 DeepSeek Harness 继续由现有权威服务管理。契约升级 0.11.0、聊天协议 1.1.0，迁移 013 只新增每真人成员的已读游标与置顶偏好，不改 001—012。会话标题及未读数由当前成员投影，不写入共享历史。旧会话已读游标从 0 开始，不推测旧消息已读。本人 agent 的群授权与真人阅读群历史分别确认，详见 [会话状态接口](development/research-chat-viewer-state.md)。

## 2026-10-04：014 联系人档案、添加关系与持续记忆

在上述 OpenIM UI 基线上追加 `014-agent-contacts.sql`，不修改 001—013。契约 0.12.0、聊天协议 1.2.0。新增版本化公开档案、私人 Agent 添加请求与授权关系、私有/会话记忆及不可变修订记录；新增 Agent 使用稳定联系人 ID，本人唯一协调 Agent 仍由服务约束。已有 013 真人私聊双方补为已同意关系，新真人或他人私人 Agent 则通过明确申请和同意建立关系。联系人授权、群成员资格和任务承诺分别管理。

模型上下文按当前身份和会话权限读取档案与有效记忆，使用上下文指纹阻止版本过时或撤权后的输出落库。创建 Agent 仅设定现有实验室模型上的身份、性格和记忆，不导入任意私人工具或整套 OpenIM Server/SDK。接口、权限和后端证据见[联系人接口](development/agent-contacts-contract.md)及[后端交付](development/agent-contacts-backend.md)。

总控以旧合成预览库创建独立 SQLite 快照后重复迁移两次，原有 59 张表逐表行数和内容散列均保持一致，旧真人私聊关系兼容保留；另用真实 HTTP 和文件 SQLite 核对进程重启后的身份、关系、会话和记忆持久性。数据库、账号与运行日志留在 `.runtime`，不提交到 Git。该升级目前仅在本地整合和预览执行；生产仍为迁移 012，未自动升级。

## 2026-10-04：完整 OpenIM 客户端与 015 身份桥

根据用户新的重建要求，同一固定上游提交的完整 React/Electron 源码进入 `clients/openim`，保留原许可、资源及构建结构，[来源](../clients/openim/ORIGIN.md)和 [科研修改说明](../clients/openim/RESEARCH-CLIENT.md)独立记录。客户端使用 pnpm 10.28.0，科研平台保持 pnpm 11 workspace；依赖、安装包、运行数据和验收账号不迁入版本库。

追加 `015-openim-bridge.sql`，不改 001—014。契约 0.13.0、IM 桥 1.0.0。新增稳定 IM 身份、会话映射、Token lease、回调去重与持久消息 outbox；既有科研成员、同意、材料、任务、运行、交付和验收仍是权威事实。科研消息只同步可重新授权的定位指针，旧私人消息不回填 outbox。升级和撤销细节见 [后端交接](development/openim-bridge-backend-report.md)。

服务配置改编自固定 `openim-docker`；固定 OpenIM Server 源码提交增加发送身份与可信回调上下文补丁，源码来源和原许可见 [服务构建说明](../deploy/openim/server/README.md)。本地实际 HTTP/SQLite 验收包含重启持久化与独立入群授权；真实 IM Server/SDK 消息和媒体须在实际服务环境另外验收。生产当前未迁移到 015。


## 2026-10-06：聊天附件阅读

契约0.16 / chat1.5新增文件元数据与读取范围，SQLite仍迁移016。固定pdf-parse2.4.5 Apache-2.0及其锁定依赖用于隔离正文提取，来源见NOTICE.md；不复制上游Harness源。OpenIM仍负责文件消息，科研私有request_json保存提取正文，旧严格持久消息/turn格式保持兼容。默认4000/90不变，DS普通文件聊天通过固定官方provider公开off配置生成正文，max-tokens截断保留用量并失败，不自动重试。具体源码、部署、证据与回退见统一状态及文件聊天交接。
