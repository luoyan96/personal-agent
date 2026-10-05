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
