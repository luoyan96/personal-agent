# 项目进展日志

最新状态先读[新 AI 快速接手](current-state.md)。日期使用北京时间；按批次追加真实事实，历史记录不替代当前运行状态。

## 2026-10-05：注册修复上线与交接入口

- 用户线上注册截图出现 username regex 的原始 Zod 信息；可见用户名合法，具体隐藏字符尚无法确认。
- 用户要求密码最少 8 位，无复杂度组合要求。前后端分别修复契约、API / 维护入口、注册 / 登录表单及中文错误提示。
- 后端提交 `f83aacc` 已在总控整合为 `349dadd`；前端 `1889423` 整合为 `d7cbe97abdd6271f459918727bf00f7c2bab154c`。共享契约 0.13.1，用户名 / 邀请码只 trim 首尾，密码原值 min8、去除独立 256 上限；后端真实 loopback HTTP 与针对性 178 项测试、构建 / 类型 / 导出通过。
- 总控根 CI 31 文件 / 400 项测试、2 项生产入口测试、构建 / 类型 / 导出 / B0 生产进程通过；独立客户端 typecheck、3 项 auth 测试、build:web 与四个固定 SDK 资源检查通过。
- 两个前端入口真实本地 API 的 18 项浏览器分组通过（`auth-input-review/..._e586de8a/report.json`）；旧缓存导致的前两次失败证据保留。另桌面 / 320px 的稳定错误布局 2 项通过（`layout-public/..._7868a887/report.json`），原截图为错误高度动画过渡，未追加产品修改。
- 总控建立 `docs/current-state.md` 与本文，并更新 AGENTS / README / 开发索引 / 路线图的阅读入口，防止新 AI 从历史版本重新开始。
- 08:26 北京时间，新 ECS 实际发布固定软件 `d7cbe97abdd6271f459918727bf00f7c2bab154c`；API / worker 实际镜像 `sha256:b2f1edf0ee51480720f0b3f7e1deef08ccd133184a9307c38d4e87cad62730b0`，活动容器四份源文件与归档一致，公网首页与精确构建一致，ready 为 0.13.1 / ok。IM 镜像未改变，迁移仍为 015。
- 更新前备份 `/srv/research-openim-backups/20261005T002607Z`：12 个 checksum、9 个 gzip 完整流、独立恢复 SQLite integrity ok；保存在同一 ECS，完整组件恢复和异地备份未验收。保留旧 release 与镜像回退标签。
- 新站真实 HTTPS 合成实验室 `lab_registration_qa_20261005_8ea4567b` 通过 7 位拒绝、非法用户名中文 / 无原始 JSON、8 位注册、用户名 / 邀请码首尾空白规范化、8 位登录、首次负责人角色和旧 cookie 退出后 401，共 7 项。08:28 审计维护 CLI 撤销测试邀请码、停用该测试账号，活跃会话 0；08:29 八服务运行 / API healthy / ready / 无 OOM 检查通过。本轮无 IFRC 真实账号修改、无新增 SSH 授权、无真实模型调用。
- 真实云端合并回执 `.runtime/openim-cloud-20261004/registration-closure.json` 和空白新站注册截图 `registration-public-min8.png`；本地 CI 日志 `ci-registration-fix.log`、客户端 `client-registration-build.log`；这些运行证据不提交 Git。
- 上传曾因旧 Workbench 会话过期失败，重新免密登录后成功；首个镜像校验脚本误用根目录包名导入，在备份 / 激活前退出，旧站点仍健康。修正为固定 dist 路径并核验脚本 SHA 后重跑退出 0；服务器保留 `registration-hotfix.initial-failed.log` 与 `registration-hotfix.retry.log`，不改写失败记录。
- 交接入口会记录部署 / 本地 SHA、实际测试、未验证项和下一步；AGENTS 要求新 AI 先读入口并在每批完成后同步追加。当前未推 GitHub。下一步是负责人自行注册、设置模型后完成新站真实 AI 闭环；原生桌面和剩余 SDK 验证仍待完成。

## 2026-10-05：完整 OpenIM 新 ECS 部署与验收

- 受测并部署软件：`c3f58a4a88a3b0c0efdf2c868a556cc9d29f25ac`；本地部署文档提交 `3d3ccb6`。入口 `chat.acceptcat.com`，旧 `research.acceptcat.com` 独立保留，新 IFRC 不自动迁移旧账号 / Key。
- 根 CI 398 项、生产入口 2 项、完整客户端构建 / 类型通过；真实权限 15 项、档案 Ex 7 项、重启恢复 4 项及后端退出 7 项通过。
- 实际 SDK 媒体主运行 `89879723` 获得 13 项核心证据，原报告 failed 保留；`1055c48a` 复现刷新历史读取早于 SDK 就绪，修复后最终专项 `0d540e22` 的 3 项回归通过，pageerror / unhandledrejection 均 0。挂起诊断 `cb9f17ac` 保留 aborted。
- 修复涵盖首个协调会话 / native pin、flex 高度 / 窄屏、Web ByFile 资源、好友重复导入 / 固定零好友序列化、HTTPS 对象前缀、SDK 历史就绪与过期异步请求。
- 最终运行记录：父工作目录 `.runtime/openim-cloud-20261004/{final-db-verified,backup-verified,live-verified,deployment-closure}.json`；媒体组合证据 `.runtime/openim-client-rebuild/sdk-media/SDK-CLOUD-ACCEPTANCE.md` 和 `sdk-cloud-acceptance.json`。均不含明文密码 / token，不提交 Git。
- 两名测试账号 / 两枚测试邀请码已停用，测试实验室活跃会话和 IM lease 为 0，历史保留。IFRC 首次邀请码当时未使用，私有文件交接；真实模型 Key 未配置。
- 一致备份 `20261004T184707Z` 校验通过并恢复八个服务，SQLite 独立恢复 integrity ok。此前相对 Compose 路径引起恢复失败已立即恢复并修复脚本，重新备份退出 0。未做异地备份 / 完整组件恢复演练。
- 证书实际换发与 webroot 续期验证通过；本次临时 SSH 公钥撤销，新的连接明确 publickey 拒绝，专用本地密钥和测试密码文件删除。
- 未推 GitHub。网页版有实际媒体验收；原生桌面云媒体、语义 `@106`、SDK 科研指针撤权刷新和新 IFRC 真实 AI 执行仍待验证。

## 历史批次索引

- [需求入口与群协作链条](development/chat-workflow-brief.md)：本地 `cdf168d`，377 项 CI、12 组真实 HTTP / SQLite / Edge 与 IAB 检查，合成 ModelCall。
- [联系人、档案与持续记忆](development/agent-contacts-brief.md)：统一人与 Agent 联系人、专属 Agent 与明确保存的记忆，本地整合和浏览器验证。
- [完整 OpenIM 桥接后端](development/openim-bridge-backend-report.md)、[旧 OpenIM 采用批次](development/openim-adoption-brief.md)：保留对应源码、权限和许可来源。
- [旧 ECS 部署](deployment/ecs.md)：旧站固定版本与账号 / 模型保持独立。
- [G1—G5a 报告](development/README.md)：历史工程门禁；产品 P1 与真实小组收益尚未完成。

## 2026-10-05：登录默认需求入口与会话刷新修复

- 用户登录后截图显示左栏协调 Agent，右侧仍为上游“创建群聊”。独立合成账号真实 SDK 完成登录后复现；系统已创建协调会话，但没有默认选择，且上游 Layout 会把刷新深链接退回 `/chat`。
- 前端提交 `e78a3e404af70ccc3ceb8721897bd5790699959e` 整合为 `b4046a5ce8572f2d12a930a44b4a223121a39e92`。真实科研会话映射、当前 session actor / SDK 自身份和 login / connect / sync readiness 一致后自动打开协调会话；保留用户已选私聊 / 群聊与手机返回列表。恢复会话、群资料与成员的异步请求增加 actor / route / generation / selection 守卫，旧请求不写回。未就绪或不同账号不展示上一会话输入框。
- 空白页科研分支显示需求入口状态和重试；聊天草稿提供目标、材料、交付、截止时间提示。文献梳理 / 数据分析 / 论文修改只填空草稿，无自动消息或模型调用。真实窄屏截图发现长介绍挤裁标题，另提交 `d99c884dcc9c9dc3165949e82fd4568fdb4fa1b2` 把介绍保持单行。
- 客户端整合入口类型检查通过，两次精确 Web 构建和四个固定 SDK 资源 / 静态引用核验通过；前端分支五项聚焦检查通过。本轮没有共享代码 / 契约 / 依赖 / API / 迁移修改，未重跑根共享 CI；d7 的 400 + 2 项保留为对应后端版本证据。
- 09:51 首版前端上线，09:58 最终 `d99c884` 上线；Nginx root 使用独立 `/opt/research-openim/client-releases/d99c884dcc9c9dc3165949e82fd4568fdb4fa1b2/clients/openim/dist`。`/opt/research-openim/current` 与 API / worker 保持 d7，镜像 `sha256:b2f1edf0ee51480720f0b3f7e1deef08ccd133184a9307c38d4e87cad62730b0` 未重建。源 / Web / 外层包 SHA256 和公网 HTML 实际核验。保留原前端及 Nginx 配置供回退；没有数据库迁移或新增 SSH。
- 最终新站隔离 Edge / HTTPS / 真实 SDK 七项通过：新登录默认需求对话、模板仅草稿、协调会话刷新恢复、显式群深链及刷新保持、通讯录不被轮询抢走、320px 标题 / 输入 / 发送无页面溢出、手机返回列表并再次进入需求对话。pageerror 0，零消息 / 模型发送；源码守卫审核不冒充故障注入或真实账号切换测试。没有复测媒体、Electron 安装包或真实 AI 理解 / 执行。
- 首次部署在 Nginx reload 后立即读到旧首页 hash，脚本实际自动回退；改为在 20 秒内观察真实新首页收敛，重跑退出 0。失败 / 重试日志保留。验收脚本一度 exact 标题定位错误及错误调用 context.setViewportSize，均保留失败记录，修正后精确最终运行通过，不把脚本错误归作产品错误。
- 末尾健康检查一度误读 `/readyz` 的 SPA HTML 回退；部署时该路径的 HTTP 200 不作为 API readiness 证据。10:04 使用真实契约路由 `/api/v1/health/ready` 验证 HTTP 200 / status ok / contract 0.13.1，同时核对八个服务、API healthy、无 OOM、后端镜像未变和精确公网首页。最终以 closure.live 为准，原部署回执保留。
- 10:00 审计 CLI 撤销独立实验室 `lab_sdk_qa_20261005_demand_752e0f9c` 的测试邀请码、停用唯一测试账号，活跃会话 / IM lease 均为 0，合成会话历史保留。没有使用 IFRC 真实账号 / 开通码 / Key；最后八服务运行、API healthy、HTTPS ready、无 OOM。
- 证据在总控父目录 `.runtime/demand-entry-20261005`：`baseline-report.json`、`after-report.json`、`deployment-verified.json`、`closure.json`、两份构建日志与桌面 / 手机截图；运行凭据不进 Git。云回执 `/opt/research-openim/ops/demand-entry-closure.json`。本批仅本地提交，未推 GitHub。下一步由负责人配置模型后另行完成需求澄清、协作建议与任务执行的实际闭环。

## 2026-10-05：真实消息不回复、输入区和消息自动显示修复

- 用户截图含 MODEL_UNAVAILABLE 和 BUDGET_EXCEEDED。新 ECS 只读元数据核对：模型不可用产生在 lab_disabled 时；负责人已于 12:26 自行启用 deepseek-flash。旧“在吗”实际报告输入 7360 / 输出 763，已经超过默认 4000。内部生成 schema 约 16.9KB，且把总预算全作 output cap，导致普通请求失效；数据库诊断只取状态、用量和长度，没有提取真实 Key / 密码 / 邀请码 / 消息或记忆正文。
- 后端 7b58 整合 b136，客户端 885c 整合 a7f；初次 a7 于 12:58 上线，13:01 首条真实返回“收到”。随后真实第二条仍 preflight 超限且无模型调用，发送后 CKEditor 高度 0；这些失败证据保留，不以首次成功结束验收。
- 客户端 4d06 整合 0a1：摘要 / 详情弹窗、控制区滚动上限、编辑区最小可用高度。真实组件合成布局 6 项通过。后端 397dd 整合 7098：表格字段显式列名、sender 稳定身份字典、非空内容完整保留；协议按真实个人 / 群权限描述，canonical 校验继续独立负责权限和 payload。合成 8 条旧 human / model 后默认 4000 连续两次通过。根 CI 407 + 2，通过；13:31 的 7098 部署后两条真实问答成功，但自发送与异步高度使列表跳回旧消息，需手动滚动，继续修复。
- 计量复核发现固定官方 0.2.0-rc.1 TokenUsage 是 disjoint，旧 runtime 漏缓存读 / 写。fae481 整合 1c378：normalize 输入合计未缓存 + cacheRead + cacheWrite，以 totalTokens 一致性核对；输出已含 reasoning，不二次相加。缺失 / 非法 / 不一致计量拒绝接受结果，禁止假定剩余额度。固定真实 adapter + loopback 合成 SSE 与 API 累计预算 18 项 focused通过；根最终 CI 32 文件 / 419 项 + 2 项生产入口，类型 / 构建 / B0 / 契约通过。旧 usage 缺 cache 分项无法回算，本轮 IFRC 旧 failed 无可用余额，不回填历史。
- 客户端 954c 整合 979b：canonical 保存成功后发当前会话 / actor 的 scoped 跟随意图；Virtuoso 初始实际 LAST/end，真实正文与卡片延迟增高保持最新；主动上滚读历史立即停止跟随，路由 / actor 变化取消旧 RAF。真实组件明确合成传输 12/12、pageerror0，覆盖短 / 长历史、700ms授权正文、450ms turn、5 秒状态增高、历史阅读、迟到旧请求和 320px。首个 fixture 缺 nextCursor / alias 配置的工具失败证据保留，修正测试数据后通过，未据此改产品。
- 最终软件 `979b7c10afb0b75b2a72572431cc08fb5195cf47` 于 13:58 实际发布，前端 / API / worker 对齐。完整客户端整合 typecheck / build:web / 4 SDK 资源通过；镜像 `sha256:e2402ee40c51e050e40e1ab0597dbd756f2e675e629e034c0b93c9cd77da0caa`由旧官方依赖镜像离线 overlay 构建，新增 runtime 和 API 均真实编译。四个变更 src 在两容器 hash 对齐归档，精确公网首页与构建一致，其余六镜像未变。
- 新一致备份 `/srv/research-openim-backups/20261005T055755Z`：12 checksums / 9 gzip / SQLite独立恢复integrity ok / 迁移15；额外保留当前前端。前两轮本日备份也保留。两条最终实际请求后八服务运行、API healthy、JSON ready ok / 0.13.1、无OOM、源与首页再核验通过；未新增SSH或迁移。
- 真实 IFRC 用户已有登录页面依次发送两条自行编写的短测试，真实收到“收到一”“收到二”。最终 turn 6f77c6f7 的正规化 input895 + output21 =916，584ms；turn 82ce111b 的 input915 + output299 =1214，1531ms；各请求预算4000 / 90。全程无手动滚动、最新 gap0、编辑区85px；最新模型消息1/动作0/草案0。没有调用旧科研任务、建群、复制凭据或改变负责人会话/设置；历史失败消息保留。
- 本轮父目录 `.runtime/ai-reply-20261005` 保存三轮部署归档/回执、初版失败诊断、`ci-final.log` / `ci-continuous.log` / `ci-cache-final.log`、client各精确构建、`diagnostic-final.json` / `live-closure-ui.json` / `live-verified.json` 与最终截图。初次pnpm自动依赖验证NO_TTY中止及外层tar目录验证在解包前失败记录保留。前端专项在 `.runtime/ai-turn-feedback-review`，其中输入区 `footer-2026-10-05T05-15-49-126Z_7b770be1`、滚动 `scroll-2026-10-05T05-50-14-972Z_1afe3d77`。
- README / 当前状态 / 本文 / 部署记录同步更新，本地交接文档提交不重新发布软件；未推GitHub。浏览器开发插件缺失的合成UI检查采用既有Playwright/Edge，实际生产UI使用CUA。下一批仍需真实需求澄清、分组建议、人类确认、任务执行和科研交付闭环；本轮没有重测媒体或原生Electron。长上下文仍受保守UTF-8预留限制，后续精确计数需要官方匹配tokenizer，不允许字符除法、静默截内容或自动加预算。
