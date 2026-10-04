# 科研微信完整 OpenIM 客户端

此目录保留 OpenIM `62d7ca7` 的完整 React/Electron 工程，来源与修改位置见 [ORIGIN.md](./ORIGIN.md)。原 README 和许可原文保留；科研功能说明以本文件为准。

## 开发与构建

1. 在仓库根构建唯一共享契约：`pnpm --config.verifyDepsBeforeRun=false --filter @research-agent-platform/contracts build`。
2. 进入 `clients/openim`，使用其固定 pnpm **10.28.0**：`pnpm install --ignore-workspace --frozen-lockfile`。该客户端不加入根 pnpm 11 workspace。
3. 复制 `.env.example` 为 `.env.local`。开发默认客户端 `http://127.0.0.1:4317`，科研服务 `http://127.0.0.1:3217`；科研服务 APP_ORIGIN 必须是客户端地址。
4. `pnpm --ignore-workspace dev`；仅浏览器开发可设置 `VSCODE_DEBUG=true`，避免启动 Electron 窗口。
5. `pnpm --ignore-workspace typecheck`、`pnpm --ignore-workspace build`。
6. Windows x64：`pnpm --ignore-workspace build:win`。输出 `release/Base/3.8.3/ResearchWeChat_3.8.3.exe`，不自动安装或发布。`electron:smoke` 对实际打包程序做隐藏窗口启动、真实 renderer/native SDK 桥检查。

桌面科研模式加载获准的同源服务页面，启动时配置 `RESEARCH_APP_URL`（HTTPS，或本机开发 `http://127.0.0.1:4317`）。未配置时显示明确的服务入口提示，不以 file origin 放宽 cookie/CSRF。配置页面必须提供此客户端构建与科研 API 同源代理。原生窗口、preload、平台 SDK 和安装脚本保留。

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
