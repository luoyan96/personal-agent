# 新 AI 接手：当前项目状态

更新日期：2026-10-05（北京时间）。这是快速交接入口；历史报告保留各自受测版本，不能直接当成当前线上状态。

## 五分钟阅读顺序

1. 本文、[项目进展日志](project-log.md)、[开发规则](../AGENTS.md)。
2. [新 ECS 部署与验收](deployment/openim-ecs.md)、[完整客户端说明](../clients/openim/RESEARCH-CLIENT.md)。
3. 根据任务阅读[共享 OpenIM 桥契约](development/openim-bridge-contract.md)或[产品规划](product-plan.md)。

## 用户已确认的产品逻辑

- 产品是微信式科研协作：人与 Agent 共用通讯录、档案、私聊和群聊。Agent 有稳定身份、能力、介绍、性格和获准记忆。
- 固定置顶“需求与协作”是需求与能力匹配入口。表达需求后提出分工与建群建议，任务群可包含真人与 AI。
- 群聊成员身份、任务承接和资料授权分别管理。真人自主接受；Agent 同意不替代所属真人同意。
- 普通文字中的 `@` 不隐式执行任务；执行、邀请、验收须经明确动作与权限检查。
- 采用完整 OpenIM React/Electron 客户端，科研 API 保留身份、任务、权限和交付的权威状态。OpenIM 负责真实 IM 消息和媒体。
- 用户最新密码要求：最少 8 个字符，无大小写 / 数字 / 符号组合要求，密码不自动 trim。本轮修复尚在进行，部署完成后更新下表。

## 代码、线上与数据位置

| 项目 | 当前事实 |
| --- | --- |
| 总控集成目录 | `D:/deepseek-agent/research-agent-platform-chat-integration`；操作前用 `git status` 确认目录与已有改动 |
| 分支 | `feature/openim-client-rebuild`；最新本地 SHA 用 `git log -1` 读取，不使用其他旧克隆代替 |
| 已上线固定软件 | `c3f58a4a88a3b0c0efdf2c868a556cc9d29f25ac`；后续 `3d3ccb6` 仅补部署文档 |
| 新站 | `https://chat.acceptcat.com`，文件 `https://files.chat.acceptcat.com` |
| 新 ECS | 广州 Ubuntu 22.04.5，4 vCPU / 8 GiB / 50 GiB；当前到期日 2026-11-04，未改续费设置 |
| 运行与发布 | `/srv/research-openim`；`/opt/research-openim/current` 指向固定软件 release |
| 版本 | 契约 0.13.0、IM 桥 1.0.0、SQLite 迁移 015；本轮注册修复不需要数据库迁移 |
| 旧站 | `research.acceptcat.com` 独立保留；旧账号 / 模型配置不自动迁移，不在本轮升级范围 |
| GitHub | 新 OpenIM 批次未推送。用户先看完成结果；不要把“本地已提交”写成“GitHub 已上传” |

## 已完成、证据与边界

- 根 CI：固定软件 `c3f58a4` 的 398 项测试及 2 项生产入口测试通过；独立完整客户端类型和 Web 构建通过。
- 新 ECS 的真实 API 权限 15 项、profile Ex 门禁 7 项、API / worker / OpenIM 实际重启恢复 4 项、后端平台 3 退出 7 项有证据。
- 双隔离浏览器平台 5 真实 SDK：13 项核心功能得到文字、文件双向 SHA、合成录音录制 / 取消 / 下载 / 解码 / 播放、拒绝权限、320px 和刷新恢复证据。原完整运行另捕获历史读取就绪异常，原报告仍为 failed；修复后 3 项专项线上回归通过，pageerror / unhandledrejection 为 0。
- 所有测试使用独立合成实验室。两名 QA 账号已停用、邀请码已撤销，全部对应会话和 IM lease 为 0，保留任务 / 消息历史；未使用真实 IFRC 邀请码、账号、模型 Key 或真人麦克风。
- 当前提供网页版。原生 Electron 安装包和原生云媒体、语义 mention 106、科研材料指针撤权后的 SDK 展示仍待独立验证。实际字面 `@` 为消息类型 101。
- IFRC 新实验室尚未配置模型；新站真实 AI 理解 / 建议 / 执行及真实小组科研收益未验收。

## DSH 运行事实

科研 worker 位于新 ECS 的 `research-worker` Docker 容器，按受控请求启动 Harness 子进程，使用官方固定 `@deepseek-ai/dsh-llm` 和 API-key provider 0.2.0-rc.1。当前是受限模型调用组合，模型工具为空；完整 agent-loop、shell / 文件工具、MCP 和十项 Skills 的自主执行未启用。旧环境的真实模型证据不能代替新 IFRC 的模型验收。细节见[受限 Harness runtime](../integrations/deepseek-harness/runtime/README.md)。

## 凭据和运维交接

- IFRC 首次注册说明仅在本机受控 `.runtime/openim-cloud-20261004/IFRC-首次注册.txt`，不把内容粘贴到聊天、日志、截图或 Git。负责人自行设账号 / 密码，随后在“实验室设置”签发成员邀请码和配置模型。
- 运行记录在总控父目录 `.runtime/openim-cloud-20261004` 和 `.runtime/openim-client-rebuild/sdk-media`。源码仓库不收录密码、邀请码、token、真实资料或录音。
- 实际一致备份：`/srv/research-openim-backups/20261004T184707Z`；12 份 checksum / 9 个 gzip 完整流通过、隔离 SQLite 恢复 integrity ok。八个服务已恢复正常；尚未做异地备份或完整组件恢复演练。
- 两域证书实际换发至 2027-01-02 UTC，webroot 自动续期 dry-run 和 deploy hook 通过，timer 已启用。
- 上批临时 SSH 公钥已撤销，独立新连接明确拒绝，本地专用密钥已删；不得继续假定该 key 可用。可用用户已有阿里云 Workbench 连接进行已授权维护。
- 每次 Compose 操作包含 `compose.yaml`、`compose.production.yaml` 及服务器私有 `compose.production-images.yaml`；MinIO 使用已核验的官方源码自建镜像。禁止 `down -v` 或清空旧站 / 活跃卷。

## 当前工作与后续优先级

1. 正在修复真实注册阻塞：密码统一 min8，用户名 / 邀请码首尾空白规范化、非法字符中文提示、禁止内部 Zod JSON 显示给用户。截图中的可见用户名合法，无法仅从截图断言隐藏字符的具体来源。
2. 完成本地真实 HTTP 和浏览器边界验证、根 CI、完整客户端构建后，独立备份并更新新站；保持旧站 / IFRC 数据和开通码，不代注册真实用户。
3. 负责人自行注册与配置模型后，在明确凭据来源和授权输入范围下完成新站 AI 实际调用及任务闭环。
4. 按用户选择继续原生桌面包、剩余 SDK 权限 / mention 验证与真实小组试用。

## 后续 AI 更新规则

完成一批后同时更新本文与[追加日志](project-log.md)：写明源码 SHA、实际线上 SHA、做了什么、证据路径、未验证项和下一步。部署失败 / 中止与修复记录保留，不把本地测试、模拟模型或构建成功当成线上验收。共享代码变更执行根 `pnpm run ci`；完整客户端另行 typecheck / build:web 和目标交互浏览器验证。
