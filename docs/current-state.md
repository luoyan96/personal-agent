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
- 用户进一步指出最终交付应面向桌面客户端和手机App；随后接受先把网页版流程做好，再复用已有Windows / Electron工程并接移动客户端。手机窄屏网页不算原生App完成；当前优先网页版业务体验，后续桌面与手机原生能力分别验收。
- 用户最新密码要求已上线：最少 8 个字符，无大小写 / 数字 / 符号组合要求，无独立密码最大长度，密码不自动 trim。整体 HTTP / CLI 请求大小限制仍保留。
- 2026-10-05 最新方向：暂缓完善需求编排，先做好人与 Agent 的自然聊天。注册不再强制实验室邀请码；按准确用户名发现人及 Agent，申请同意后私聊。团队邀请码仅作为自愿加入已有实验室的选项。
- 普通个人 / Agent 私聊默认只输入文本并发送；使用本人默认模型，保留真实档案、性格和授权记忆。任务、材料、预算与需求模板收在可选协作中；普通聊天不创建计划、群、任务或执行动作。主标题显示真实 Agent 名称，沿用原协调身份和置顶映射。
- 设置入口改为“模型设置”，每个人管理自己的 DeepSeek / 通义千问 / 豆包配置、加密 Key、启用及默认选择。朋友使用本人 Key 与当前对话记忆，不能读取 Agent 主人的 Key 或私有记忆。既有 IFRC 未选择个人配置时兼容旧模型；明确作个人选择后不静默回退。

## 代码、线上与数据位置

本地当前另在完成[自然语言创建Agent](development/natural-agent-creation-brief.md)：本人个人助理中的明确创建请求将生成真实联系人和私聊，并仅在原发送页面仍有效时自动打开。契约已为0.15 / chat1.4，SQLite仍16；下表线上仍为0.14，不能把本地候选当成已部署。旧0.14普通回复 / 持久文档兼容已实测，完整CI和实际页面 / 云验收收尾中。

| 项目 | 当前事实 |
| --- | --- |
| 总控集成目录 | `D:/deepseek-agent/research-agent-platform-chat-integration`；操作前用 `git status` 确认目录与已有改动 |
| 分支 | `feature/openim-client-rebuild`；最新本地 SHA 用 `git log -1` 读取，不使用其他旧克隆代替 |
| 已上线前端 | `a25ee9bdf1601f81fce78f6028216b9aed9db792`（20:34北京时间新增三种可添加的科研聊天Agent）；后续本地交接文档提交不改变线上软件 SHA |
| 已上线 API / worker | `68d0592de941fa0f47907ba9df6e86fddd83f250`，本批未更新；镜像 `sha256:b9ecbbe826f4fa37126c98241b082cf780c370bb828596583226e60979c216fc`；纯文本聊天与个人模型隔离，总预算仍为输入与输出合计 4000 / 90 秒 |
| 新站 | `https://chat.acceptcat.com`，文件 `https://files.chat.acceptcat.com` |
| 新 ECS | 广州 Ubuntu 22.04.5，4 vCPU / 8 GiB / 50 GiB；当前到期日 2026-11-04，未改续费设置 |
| 运行与发布 | `/srv/research-openim`；后端 `/opt/research-openim/current` 仍指向 `/opt/research-openim/releases/68d0592de941fa0f47907ba9df6e86fddd83f250`；Nginx root 为 `/opt/research-openim/client-releases/a25ee9bdf1601f81fce78f6028216b9aed9db792/clients/openim/dist` |
| 版本 | 契约 0.14.0、聊天 1.3.0、IM 桥 1.0.0、SQLite 迁移 016；显式迁移与激活前旧数据逐表核验通过 |
| 旧站 | `research.acceptcat.com` 独立保留；旧账号 / 模型配置不自动迁移，不在本轮升级范围 |
| GitHub | 新 OpenIM 批次未推送。用户先看完成结果；不要把“本地已提交”写成“GitHub 已上传” |

## 已完成、证据与边界

- 2026-10-05 20:34北京时间，三种可添加的科研聊天Agent客户端 `a25ee9b` 已实际静态发布；公网index SHA256 `dcc6cc772661fcd8fe957f2935989abcce2e154a5117c2382990264dad390565`精确核验、HTTPS ready / 契约0.14、八容器运行 / 无OOM且镜像全部不变。后端仍为68d / schema16，没有数据迁移或新SSH。回退配置 `/opt/research-openim/ops/agent-starters-a25ee9bdf160-20261005T123403Z/research-openim-production`；本批仅回退客户端root，无数据库或镜像回退。
- 真实本地后端52 HTTP / SQLite、4合成模型上下文检查，实际客户端16组分段闭合、类型 / Web / 四固定SDK资源通过。三档案本人所有、记忆与发送者模型隔离、取消 / 迟响应 / 未连接 / 复用 / 编辑和桌面 / 320px均有证据。Workbench上传文件页需切回终端的选择器中止和Session到期保留；正常恢复已有连接，无权限扩展。发布helper自身5项归档 / 公网hash守卫检查与云实际回执分开。
- 原IFRC登录页正常刷新恢复后，20:35实际从通讯录添加“文献阅读助手”，真实SDK私聊打开，发送一次自编植物摘要后获得真实模型四点梳理，事实 / 推断 / 资料缺口区分可见；20:36再次打开同SDK会话且历史保留。未读取 / 复制 / 修改真实Key或密码，没有新建测试云账号、自动发送或任务执行。另两角色目前为已上线可选档案及本地验证，未分别做真实模型调用。本批只证明文本聊天角色效果，不证明科研结论准确性或工具执行。
- 本批证据在父目录 `.runtime/agent-starters-20261005`：`deployment-verified.json`、`outer-verified.json`、`live-ui-proof.json`、`live-agent-catalog-added.png`、`live-agent-chat.png`、`root-client-verification.json`、`VERIFICATION.md`、`local-http-KiLmLx/report.json`与`runs/417358bc...`。源候选d18 / 整合a9、说明681 / 整合424；部署源码a25固定后只补本地交接文档，不重发软件或推GitHub。

- 2026-10-05 17:33 北京时间，个人注册 / 联系人 / 自然聊天 / 模型管理的固定软件 `68d0592` 已在新 ECS 上线。源码、API / worker 镜像及精确公网首页对齐，首页 SHA256 `896450e229d810aef3ed8c5747efe5482a50118725aaf17deedb019cff3dc090`。八服务实际运行，其余六镜像未变，HTTPS ready / 契约 0.14.0 / 迁移016核验通过。没有新增 SSH 或推 GitHub。
- 共享 CI 34 文件 / 446 项和 2 项生产入口通过；精确完整客户端类型 / Web 构建 / 四个 SDK 资源通过。前端本地 17 组真实 HTTP / SQLite、10 组组件合成传输和两张最终布局截图通过；固定官方多厂商 loopback wire / usage 23 项通过。真实模型证据与合成检查分开。
- 新站两隔离个人账号完成14个 HTTPS / 真实 SDK 门禁：桌面与320px无邀请码八字符注册、个人空间 / 模型隔离、停用合成 Key 管理、准确用户名申请 / 接受、双向101消息。双方 clientMsgID / sendID / recvID 对齐且 status2；两个注册项引用首次真实运行，未重复注册或增加第三人。pageerror0，console诊断保留；Agent只验收草稿，模型调用由下项另证。
- 两QA已UI退出并审计CLI停用，账号version2，活跃RAP会话 / IM lease均0，合成历史保持，无邀请码使用。窄console诊断确认初始 / 退出后预期401和浏览器不能脚本关闭用户窗口的提示；另有已捕获登录 `null.map` 错误，未影响14项流程但准确来源尚未分类，保留待定位，不声称console零错误。没有因此增加第三账号或反复重跑业务。
- 17:40 / 17:41 使用既有 IFRC 已登录页面，经普通文本入口连续收到两轮自然回复；第二轮接着第一轮的自我介绍改为口语短句。正常气泡、编辑器和折叠协作均可用。未读取、复制或更改其密码 / Key，未注销真实账号，旧实验室模型兼容仍可用。
- 一致备份 `/srv/research-openim-backups/20261005T093246Z`：12 checksums / 9 gzip / 隔离SQLite恢复integrity ok / 迁移15；显式016迁移逐旧表行hash与准确键转换通过，70旧表 / 激活前2281行保持。更早准备快照3136行与激活前差855，仅读两保存副本确认唯一变化为临时 `chat_pages` 2168→1313，其他69表计数相同；旧代码分页快照TTL15分钟清理解释该阶段差，不能把两阶段总数差当作016丢数据。
- 原部署失败与恢复均保留：初次prepare路径白名单拒绝；初次activate即时旧首页hash不匹配，恢复015 / 旧镜像后用守卫恢复旧服务；第二次因release根目录700使www-data不可读，自动完整回退通过。修正仅新release为755，并实际以www-data核对精确index后第三次成功；实际成功helper SHA为 `67067eee5b4f7ad711eb9bc9b93027a4c2a03ce4621921e6e9d77f5e79ae1e1b`，后续本地增加权限门禁的helper未再发布。回退须同时恢复015数据库和旧镜像，不允许只回退代码。
- 最新证据在父目录 `.runtime/personal-chat-20261005`：`closure.json`、`cloud-postverify-cleanup.json`、`deployment-verified.json`、`preparation-and-rollback.json`、`saved-snapshot-counts.json`、`live-natural-ui-proof.json`、`live-natural-chat.png`、`live-model-settings.png`、共享 / 客户端构建日志；线上14项报告在 `cloud-review/runs/dce9b912-4378-4ef4-a688-e582f988748b/report.json`。17:54清理后再verify通过；本机两个已停用QA的临时密码文件已删。注册门禁首报告、测试单次IM登录假定 / 图标定位错误、序列化修正前报告保留。

- 历史 2026-10-05 13:58 发布 AI 回复修复。旧“在吗”失败实际为冗长内部协议耗尽预算；旧模型不可用记录产生在模型启用之前。模型输入改用精简协议、明确列名和稳定身份字典，保留既有 20 条授权消息窗口与所有非空档案、性格、记忆和所选材料；不静默截内容、不提高默认 4000 / 90 秒预算。模型输出仍由服务端严格校验，邀请、建群与运行须明确确认。
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

- 个人账号现在可直接注册，无需实验室邀请码；准确用户名用于添加联系人。旧 IFRC 首次注册说明仅在本机受控 `.runtime/openim-cloud-20261004/IFRC-首次注册.txt`，不把内容粘贴到聊天、日志、截图或 Git。账号自行设密码，左侧头像菜单的“模型设置”管理个人模型；团队邀请码仅用于自愿加入已有实验室。
- 运行记录在总控父目录 `.runtime/openim-cloud-20261004` 和 `.runtime/openim-client-rebuild/sdk-media`。源码仓库不收录密码、邀请码、token、真实资料或录音。
- 最新更新前一致备份：`/srv/research-openim-backups/20261005T093246Z`；12份checksum / 9个gzip完整流通过、隔离SQLite恢复integrity ok / 迁移15。此前 `20261005T055755Z` 和更早备份也保留；尚未做异地备份或完整组件恢复演练。
- 历史默认需求入口静态发布保留原 d7 / b404 前端及 Nginx 回退配置；最终备份 `/opt/research-openim/ops/demand-entry-20261005T015857Z/research-openim-production`。需求验收账号已审计停用、邀请码撤销，活跃 RAP 会话及 IM lease 均为 0，合成历史保留。完整回执 `.runtime/demand-entry-20261005/closure.json`；没有读取或改动真实账号 / 模型 Key。
- 两域证书实际换发至 2027-01-02 UTC，webroot 自动续期 dry-run 和 deploy hook 通过，timer 已启用。
- 上批临时 SSH 公钥已撤销，独立新连接明确拒绝，本地专用密钥已删；不得继续假定该 key 可用。可用用户已有阿里云 Workbench 连接进行已授权维护。
- 每次 Compose 操作包含 `compose.yaml`、`compose.production.yaml` 及服务器私有 `compose.production-images.yaml`；MinIO 使用已核验的官方源码自建镜像。禁止 `down -v` 或清空旧站 / 活跃卷。

## 当前工作与后续优先级

本批已上线可直接添加的三个科研聊天 Agent，详见[本轮范围](development/agent-starters-brief.md)：文献阅读、论文修改、研究方案。通讯录选择 / 确认后保存本人真实档案并打开私聊，复用完整相同的本人档案；原自定义创建继续保留。真实文献Agent回复与同会话重开已验；不能将档案角色写成联网、文件工具或自主科研执行。

1. 当前前端a25 / 后端68d已上线；个人注册、模型管理与跨空间双向IM验收保留，新增可选科研聊天档案与一个真实专业私聊验证。后续交接文档提交仅在本地，不改变上述线上软件归档。
   最新用户接受先完善网页版，并询问“向个人助理提出一件事后，是创建Agent联系人并转入聊天，还是其他形式”。现状：普通聊天只有文本回复，手动创建专属Agent的接口与通讯录入口已存在；从自然需求自动匹配 / 新建Agent / 开始专门会话的闭环尚未接通。建议根据需求复用已有Agent，简单事情由助理直接处理，单人专业事情用专属Agent私聊，多角色协作建立任务群；新增持续Agent档案和建群需有明确确认。该流程建议不能当作当前已实现或真实执行验收。
   业务流程稳定后交付Windows客户端：从现有OpenIM Electron工程构建新版安装包，接当前ECS，验证原生SDK登录 / 重启恢复、人与Agent消息、文件 / 录音、托盘 / 通知和更新路径。旧2026-10-04安装包构建 / 启动证据不替代最新版真实云桌面验收；保留同一账号与后端，不另建一套业务。
   随后接OpenIM移动客户端 / 移动SDK，复用科研API与权限协议，独立完成Android / iOS设备、系统权限、后台 / 推送与消息恢复验证；尚无手机App交付证据，不把320px网页截图作为手机App验收。
2. 通义 / 豆包真实 Key 调用、自定义接口及长上下文精确计数仍待独立授权和验证。仅支持三家固定官方地址，不宣称任意OpenAI兼容地址可用；不得自动提取既有Key为新服务配置。
3. 保持既有 Agent 身份、获准记忆和联系人同意；普通 @、普通聊天、共享群身份不替代执行或私人数据授权。完善日常体验时不重新引入必须先填任务表单的流程。
4. 需求澄清、协作组群、科研执行与交付暂缓；原生安装包、剩余SDK mention / 权限、异地备份和小组收益分别验证。此次没有重放旧需求、自动建群或推送GitHub。
5. 登录时已捕获的 `null.map` console错误待定位；14项实际流程通过且pageerror0，不把这项剩余诊断当作已修复或全零日志。

## 后续 AI 更新规则

完成一批后同时更新本文与[追加日志](project-log.md)：写明源码 SHA、实际线上 SHA、做了什么、证据路径、未验证项和下一步。部署失败 / 中止与修复记录保留，不把本地测试、模拟模型或构建成功当成线上验收。共享代码变更执行根 `pnpm run ci`；完整客户端另行 typecheck / build:web 和目标交互浏览器验证。
