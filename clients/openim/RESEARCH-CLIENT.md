# 科研微信完整 OpenIM 客户端

此目录保留 OpenIM `62d7ca7` 的完整 React/Electron 工程，来源与修改位置见 [ORIGIN.md](./ORIGIN.md)。原 README 和许可原文保留；科研功能说明以本文件为准。

正式新入口的完整网页资源、Nginx 同源反代、HTTPS/WSS/媒体配置和验收顺序见[部署说明](deploy/README.md)。新地址准备状态不等于服务已连接；真实双账号 SDK 验收结果另行记录。

## 开发与构建

1. 在仓库根构建唯一共享契约：`pnpm --config.verifyDepsBeforeRun=false --filter @research-agent-platform/contracts build`。
2. 进入 `clients/openim`，使用其固定 pnpm **10.28.0**：`pnpm install --ignore-workspace --frozen-lockfile`。该客户端不加入根 pnpm 11 workspace。
3. 复制 `.env.example` 为 `.env.local`。开发默认客户端 `http://127.0.0.1:4317`，科研服务 `http://127.0.0.1:3217`；科研服务 APP_ORIGIN 必须是客户端地址。
4. `pnpm --ignore-workspace dev`；仅浏览器开发可设置 `VSCODE_DEBUG=true`，避免启动 Electron 窗口。
5. `pnpm --ignore-workspace typecheck`、`pnpm --ignore-workspace build`。
6. Windows x64：`pnpm --ignore-workspace build:win`。输出 `release/Base/3.8.3/ResearchWeChat_3.8.3.exe`，不自动安装或发布。`electron:smoke` 对实际打包程序做隐藏窗口启动、真实 renderer/native SDK 桥检查。

双击桌面程序，首次显示“连接科研微信”，填写实验室提供的可信 HTTPS 服务地址，点击“保存并连接”；入口保存到当前桌面用户配置，下次启动自动连接。本机开发允许 `http://127.0.0.1:4317`。服务必须提供此客户端页面与科研 API 同源代理，cookie/Origin/CSRF 规则保持。运维可用 `RESEARCH_APP_URL` 覆盖入口，但普通用户无需设置环境变量；不默认连接旧生产站。原生窗口、preload、平台 SDK 和安装脚本保留。

开发工具仅 `VITE_RESEARCH_DEVTOOLS=true` 时显示。服务地址验证测试使用 Node.js 24：`pnpm --ignore-workspace test:service`。打包脚本从已安装的精确依赖构建独立 `.electron-runtime` 目录，补齐 pnpm 传递依赖并保留版本，不临时重写开发 package.json。

## 操作入口

- 用户名登录与邀请码注册沿科研 API；密码至少 9 个字符。科研账号已登录但 IM 不可用时，仍能重新连接、退出、编辑本人资料和管理实验室设置。
- 左上本人头像 → 我的资料 / 实验室设置。模型密钥只通过同源 API 提交，不显示原密钥。负责人可创建、撤销注册邀请码。
- 通讯录 → 我的联系人 / 发现；真人和 Agent 同列，身份清楚。创建专属 Agent、编辑名称/介绍/能力描述/性格、私有记忆保存/修订/移除/历史。
- 联系人申请与授权 → 同意、拒绝、撤回或撤销关系。群邀请与任务 → 真人入群和 Agent 授权分别决定，任务接受独立操作。
- 固定需求入口主标题为“需求与协作”，副标题是真实协调 Agent 名称。模板只填草稿，不自动发送、不覆盖非空输入。
- 普通文字、任意类型文件、拖放文件、语音录制/取消/试听/发送/播放/下载走真实 OpenIM SDK。录音权限或上传失败显示实际错误。媒体不自动导入科研材料或模型上下文。
- “请 AI 回复或提出安排”仅能选择实际已加入的 AI，明确选择材料与预算；只调用科研 API，由后端 outbox 投递指针，客户端不 SDK 双写。普通 `@` 不执行任务。
- 科研自定义消息仅作为定位指针，经当前科研 ACL 重新读取消息、建议与任务，不信任 IM 自定义正文的权限声明。
- “任务与成员” → 当前可读任务、真实加入/承接、成员管理、会话共享记忆、建议确认与回执。任务详情支持接受/认领、开始、明确上传科研输入、查看实际 AI 候选、人工提交和验收。
- 建群/邀请沿原 OpenIM 选择窗口，调用科研受控路由；不调模型、不自动接受成员。IM 群主是平台系统账户，科研负责人不直接转移 IM 群主。
- 实时音视频、头像上传和自助改密码尚无科研服务实现，相关 Demo 入口关闭或明确不可用。原上游模式保留在 `VITE_RESEARCH_MODE=false` 分支，但不作为科研上线模式。

## 验证边界

源码构建、安装包生成、桌面启动、实际科研 HTTP/SQLite、真实双账号 OpenIM 文件/语音互通分别验证。没有实际 IM Server 时，登录 session 的 `unavailable` 不得改成成功，不填充演示联系人或消息作为连通证据。浏览器脚本、截图、测试账号及打包输出均留在 Git 外 `.runtime/openim-client-rebuild` 或忽略的 `release`；不提交密钥、密码、会话或生成产物。

2026-10-04 本地验证：客户端类型检查、Vite 构建、Windows x64 NSIS 生成、实际安装包隐藏启动（页面/preload/原生 SDK constructor）通过；服务地址验证 2 项通过。真实科研 API/SQLite/Edge 的 10 条检查记录覆盖登录、重连的真实未连接状态、320/390px、资料保存/轮询/刷新、模型停用、创建邀请码、注册与成员权限、退出和服务端会话失效。安装包额外 6 条检查覆盖首次连接表单、地址限制、离线重试、坏地址不持久化、成功地址跨进程保存、远程页面无法通过 IPC 改写或读取受保护的服务设置。

证据在 Git 外 `.runtime/openim-client-rebuild`：`browser-review.mjs` / `browser-review.json` 与页面截图、`desktop-review.mjs` / `desktop-review.json`、`build-win-final-release.log`、`electron-smoke-final-release.log`。没有 Docker/OpenIM 服务，普通 IM、任意文件和语音的双账号真实传输仍待服务运行后验收；本批没有真实模型调用、安装到用户环境、推送或部署。浏览器记录含 Antd WaveEffect 的 findDOMNode 弃用提示、React Router future 警告和未登录/失效检查产生的 401 资源日志；没有未捕获页面异常。Windows 沙盒启动有 os_crypt_win 加密诊断，但真实页面和原生 SDK 桥接启动通过，正式运行时的桌面会话持久化仍需核验。
## 首次会话与连接失败

真实线上平台 5 首次验收发现：协调 Agent 的 SDK 本地会话尚未建好时，提前 `setConversation` 返回 `1004 RecordNotFoundError`；把它作为登录失败处理又触发自动换 Token，产生反复踢线。

固定需求入口现在缓存并展示实际 `getOneConversation` 返回的会话，严格核对后端映射 ID，并随账号切换/退出清除。只有 SDK 实际会话列表包含该记录时才尝试原生置顶；失败保留待同步状态，在真实同步完成或会话新增/变更事件后重试，不把辅助置顶同步作为重新登录原因。原生 `isPinned` 来自 SDK 数据，不人工填成功状态。科研权威固定入口仍保持第一项。

SDK 连接失败后保留科研账号和明确重连入口，停止登录页挂载时自动换 Token；正常首次登录仍可自动连接。首次失败报告与截图保留在 Git 外，完整消息与媒体验收以修复版本的实际运行结果为准。

随后真实 DOM 验证发现，上游会话栏外容器有 860px 高度，但内部 `aside` 和 Virtuoso 视口均为 0px；实际 SDK 列表和协调会话均已存在且真实置顶。会话栏现在用纵向 flex 把剩余高度传给 `aside`，连接提示独立占位，移动端打开聊天时仍隐藏会话栏。没有改写 SDK 会话数据来掩盖布局问题。
