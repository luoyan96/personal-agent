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
- 用户最新密码要求已上线：最少 8 个字符，无大小写 / 数字 / 符号组合要求，无独立密码最大长度，密码不自动 trim。整体 HTTP / CLI 请求大小限制仍保留。

## 代码、线上与数据位置

| 项目 | 当前事实 |
| --- | --- |
| 总控集成目录 | `D:/deepseek-agent/research-agent-platform-chat-integration`；操作前用 `git status` 确认目录与已有改动 |
| 分支 | `feature/openim-client-rebuild`；最新本地 SHA 用 `git log -1` 读取，不使用其他旧克隆代替 |
| 已上线前端 | `979b7c10afb0b75b2a72572431cc08fb5195cf47`（真实 AI 回复反馈、输入区高度、异步消息自动跟随）；后续本地文档提交不改变线上软件 SHA |
| 已上线 API / worker | `979b7c10afb0b75b2a72572431cc08fb5195cf47`；镜像 `sha256:e2402ee40c51e050e40e1ab0597dbd756f2e675e629e034c0b93c9cd77da0caa`；精简模型协议与授权历史，输入计入缓存读写，总预算仍为输入与输出合计 |
| 新站 | `https://chat.acceptcat.com`，文件 `https://files.chat.acceptcat.com` |
| 新 ECS | 广州 Ubuntu 22.04.5，4 vCPU / 8 GiB / 50 GiB；当前到期日 2026-11-04，未改续费设置 |
| 运行与发布 | `/srv/research-openim`；`/opt/research-openim/current` 指向 `/opt/research-openim/releases/979b7c10afb0b75b2a72572431cc08fb5195cf47`，Nginx root 为该 release 的 `clients/openim/dist` |
| 版本 | 契约 0.13.1、IM 桥 1.0.0、SQLite 迁移 015；本轮没有数据库迁移 |
| 旧站 | `research.acceptcat.com` 独立保留；旧账号 / 模型配置不自动迁移，不在本轮升级范围 |
| GitHub | 新 OpenIM 批次未推送。用户先看完成结果；不要把“本地已提交”写成“GitHub 已上传” |

## 已完成、证据与边界

- 2026-10-05 13:58 北京时间发布本轮 AI 回复修复。旧“在吗”失败实际为冗长内部协议耗尽预算；旧模型不可用记录产生在模型启用之前。模型输入改用精简协议、明确列名和稳定身份字典，保留既有 20 条授权消息窗口与所有非空档案、性格、记忆和所选材料；不静默截内容、不提高默认 4000 / 90 秒预算。模型输出仍由服务端严格校验，邀请、建群与运行须明确确认。
- 最终根共享检查 32 文件 / 419 项、生产入口 2 项、构建 / 类型 / 契约 / B0 通过（共享源受测 `1c378f4`；最终 `979b7c1` 只追加客户端与说明）。完整客户端整合类型、精确 Web 构建及四个 SDK 资源通过。真实组件合成传输的输入区专项 6 项、延迟消息滚动专项 12 项通过，不能当成真实模型证明。
- 新站已登录 IFRC 的正常浏览器中，连续发送两条自行编写的短测试语句，真实收到“收到一”和“收到二”。最终 runtime 已包含缓存读写：第一条输入 895 / 输出 21 / 584ms，第二条输入 915 / 输出 299 / 1531ms；各请求总预算仍为 4000 / 90 秒。模型回复通过 canonical 服务和真实 SDK 到达，未产生任务或协作草案。两次均自动定位最新回复，无手动滚动，发送后编辑区 85px、仍可继续输入；最终列表底部距离 0。未读取、复制或更改真实密码、邀请码或 Key，未注销或停用真实账号。
- 修复了发送后状态详情挤塌编辑器，以及自发送和权限正文 / 状态卡异步加载使列表跳回历史的问题。状态摘要留在输入区，详情在弹窗；消息气泡保留当前授权与中文原因。主动向上查看历史时不自动抢回位置，旧会话 / 旧账号滚动事件有守卫。旧失败记录保留，不自动重放原需求。
- 本轮证据在父目录 `.runtime/ai-reply-20261005`：`deployment-verified.json`、`diagnostic-final.json`、`live-closure-ui.json`、`live-verified.json`、`live-final-replies.png`、`ci-cache-final.log`、`client-scroll-{typecheck,build}.log`。前端合成回归在 `.runtime/ai-turn-feedback-review`。初版 a7 首条成功后第二条预算预检失败、输入区塌陷以及滚动故障的原证据保留；初版用量尚未计入缓存，不能当成完整总量证据。

- 历史默认需求入口修复于 2026-10-05 09:58 北京时间上线。真实 SDK 登录 / 连接 / 同步及当前账号一致后自动打开置顶协调会话；已有私聊 / 群聊深链接刷新恢复，主动导航不被轮询抢走，旧账号 / 旧会话迟返回不写回。模板只填空草稿，不自动发送。最终前端独立构建 / 四个 SDK 资源核验通过，整合入口类型检查通过；新站独立合成账号的七项 Edge HTTPS / 真实 SDK 验收通过，pageerror 0，未发送消息或调用模型。320px 编辑 / 发送 / 返回列表及标题不裁切通过。证据在父目录 `.runtime/demand-entry-20261005/{after-report,deployment-verified}.json`、`demand-desktop.png`、`demand-mobile.png`。该历史批次未重跑媒体或根共享 CI，API / 契约 / 数据迁移未变；d7 根 CI 仍是对应后端版本的历史证据。
- 历史注册批次根 CI：固定软件 `d7cbe97` 的 400 项测试及 2 项生产入口测试通过；独立完整客户端类型、3 项 auth 测试和 Web 构建 / 四个 SDK 资源检查通过。
- 注册修复：后端真实本地 HTTP 边界、两个前端真实本地 API 的 18 项浏览器分组和桌面 / 320px 稳定错误布局通过；新站真实 HTTPS 的 7 项注册 / 登录 / 退出校验通过。用户名 / 邀请码仅去首尾空白，非法字符显示中文，密码原值 min8。测试账号已停用、邀请码已撤销、活跃会话为 0。证据：父目录 `.runtime/openim-cloud-20261004/registration-closure.json` 和 `registration-public-min8.png`。
- 新 ECS 的真实 API 权限 15 项、profile Ex 门禁 7 项、API / worker / OpenIM 实际重启恢复 4 项、后端平台 3 退出 7 项有证据。
- 双隔离浏览器平台 5 真实 SDK：13 项核心功能得到文字、文件双向 SHA、合成录音录制 / 取消 / 下载 / 解码 / 播放、拒绝权限、320px 和刷新恢复证据。原完整运行另捕获历史读取就绪异常，原报告仍为 failed；修复后 3 项专项线上回归通过，pageerror / unhandledrejection 为 0。
- 历史 IM / 媒体与注册批次使用独立合成实验室。两名 QA 账号已停用、邀请码已撤销，全部对应会话和 IM lease 为 0，保留任务 / 消息历史；未使用真实 IFRC 邀请码、账号、模型 Key 或真人麦克风。
- 当前提供网页版。原生 Electron 安装包和原生云媒体、语义 mention 106、科研材料指针撤权后的 SDK 展示仍待独立验证。实际字面 `@` 为消息类型 101。
- IFRC 已由负责人配置并启用 `deepseek-flash`；本轮证明短问答与连续消息显示可用。真实需求澄清、分组建议、任务执行 / 科学交付及真实小组收益仍需独立验收。长历史和大量材料仍受总预算限制；当前 UTF-8 输入上界偏保守，不能改成不可靠的字符除法或静默截内容。

## DSH 运行事实

科研 worker 位于新 ECS 的 `research-worker` Docker 容器，按受控请求启动 Harness 子进程，使用官方固定 `@deepseek-ai/dsh-llm` 和 API-key provider 0.2.0-rc.1。当前是受限模型调用组合，模型工具为空；完整 agent-loop、shell / 文件工具、MCP 和十项 Skills 的自主执行未启用。官方固定 TokenUsage 的未缓存输入、缓存读取和缓存写入是独立计数，本轮统一计入输入总量；输出已含 reasoning，不重复加。未知、非法或不一致用量拒绝接受回复。旧 runtime 记录缺少缓存分项，不能回算或作为可靠的旧失败重试剩余预算；本轮 IFRC 旧失败均无可用重试余额，未回填历史。旧环境的真实模型证据不能代替本次新 IFRC 的实际短问答，也不能把短问答当成科研执行验收。细节见[受限 Harness runtime](../integrations/deepseek-harness/runtime/README.md)。

## 凭据和运维交接

- IFRC 首次注册说明仅在本机受控 `.runtime/openim-cloud-20261004/IFRC-首次注册.txt`，不把内容粘贴到聊天、日志、截图或 Git。负责人自行设账号 / 密码，随后在“实验室设置”签发成员邀请码和配置模型。
- 运行记录在总控父目录 `.runtime/openim-cloud-20261004` 和 `.runtime/openim-client-rebuild/sdk-media`。源码仓库不收录密码、邀请码、token、真实资料或录音。
- 最新更新前一致备份：`/srv/research-openim-backups/20261005T055755Z`；12 份 checksum / 9 个 gzip 完整流通过、隔离 SQLite 恢复 integrity ok。上批 `20261005T053044Z`、`20261005T045827Z`、`20261005T002607Z` 及初次备份也保留。最终两次真实回复后八个服务实际运行，API healthy / HTTPS ready、无 OOM；尚未做异地备份或完整组件恢复演练。
- 历史默认需求入口静态发布保留原 d7 / b404 前端及 Nginx 回退配置；最终备份 `/opt/research-openim/ops/demand-entry-20261005T015857Z/research-openim-production`。需求验收账号已审计停用、邀请码撤销，活跃 RAP 会话及 IM lease 均为 0，合成历史保留。完整回执 `.runtime/demand-entry-20261005/closure.json`；没有读取或改动真实账号 / 模型 Key。
- 两域证书实际换发至 2027-01-02 UTC，webroot 自动续期 dry-run 和 deploy hook 通过，timer 已启用。
- 上批临时 SSH 公钥已撤销，独立新连接明确拒绝，本地专用密钥已删；不得继续假定该 key 可用。可用用户已有阿里云 Workbench 连接进行已授权维护。
- 每次 Compose 操作包含 `compose.yaml`、`compose.production.yaml` 及服务器私有 `compose.production-images.yaml`；MinIO 使用已核验的官方源码自建镜像。禁止 `down -v` 或清空旧站 / 活跃卷。

## 当前工作与后续优先级

1. 当前需求入口可继续发送，真实短问答和连续回复已验收；密码 min8、中文错误、注册与模型设置保持。遇到失败依据当前中文原因与请求详情处理，不能以历史失败卡片判断最新模型状态。
2. 下一批在明确资料范围下验收真实需求澄清、协作建议、人类确认、任务执行与交付闭环；本批没有重放用户旧任务或自动创建群。
3. 按用户选择推进原生桌面、剩余 SDK mention / 权限验证与真实小组试用。IM / 媒体历史证据保留各自受测版本；长上下文的精确 token 计数需模型匹配的官方 tokenizer，不能以字符数估计伪装硬上界。

## 后续 AI 更新规则

完成一批后同时更新本文与[追加日志](project-log.md)：写明源码 SHA、实际线上 SHA、做了什么、证据路径、未验证项和下一步。部署失败 / 中止与修复记录保留，不把本地测试、模拟模型或构建成功当成线上验收。共享代码变更执行根 `pnpm run ci`；完整客户端另行 typecheck / build:web 和目标交互浏览器验证。
