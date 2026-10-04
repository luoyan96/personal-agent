# 完整 OpenIM 客户端来源

- 上游：<https://github.com/openimsdk/openim-electron-demo>
- 固定提交：`62d7ca7b12e91144b315f36c8ebd1d9e0457a352`（3.8.3）。
- 通过 `git archive` 复制完整受版本控制的 React/Electron 客户端，包括 `src`、`electron`、`public`、SDK/WASM、图像、语言文件、构建脚本、原 README、完整 LICENSE 和独立 pnpm 10.28.0 锁文件。
- 不含上游 `.git`、安装依赖、运行数据或生成产物。上游 `.env` 模板内容保留为 `.env.example`；原文许可说明保持在原 README 和 LICENSE。
- 此工程独立于科研平台 pnpm 11 workspace；共享契约通过 `file:../../packages/contracts` 依赖唯一 schema 源，安装前先构建根 contracts。生成 dist 不提交 Git。

## 修改位置

- `src/research/`：真实用户名/邀请码登录、OpenIM session/配置、人与 Agent 映射、科研 API、档案/记忆与受控任务界面。
- `src/layout/`、`src/store/` 和原聊天/联系人组件：接线科研 session/稳定映射；保留真实原 SDK 通信和窗口结构。普通 SDK 消息不自动调用模型。
- `ChatFooter/SendActionBar`：任意文件选择与 SDK 文件消息；真实麦克风录制、取消、试听和 SDK 语音消息。拖放接入原编辑区。
- `MessageItem/FileMessageRender` 与 `SoundMessageRender`：实际文件下载和语音播放/真实错误反馈。
- `electron/`：保留原窗口、native SDK 和打包；使用同源部署页面维持科研会话保护。验证状态单独记录，不能以源码保留替代实际验收。
- `scripts/electron-build.mjs`：Windows 通过真实 Node JS 入口运行构建器，独立 staging materialize 已安装的完整运行依赖闭包，修复上游 pnpm 传递依赖遗漏；`electron/preload` 用真实 IPC 取得目录，避免 renderer 引入主进程专用 app 对象。连接服务表单和白名单桌面设置属新增科研接线，不改变 IM SDK 协议。

构建、媒体互通、服务连接和科研闭环各自记录实际结果。没有 IM Server 时必须显示真实不可用，禁止填充演示用户或假消息作为成功验收。
