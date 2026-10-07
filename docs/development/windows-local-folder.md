# Windows 客户端与本地文件夹

## 试用入口

Windows x64 客户端版本为 `0.1.0`。本机安装包在 `D:/deepseek-agent/PersonalAgent-Windows/0.1.0/ResearchWeChat_0.1.0.exe`；免安装程序在同目录 `app/ResearchWeChat.exe`，须保留整个 app 文件夹。

打开程序后连接 `https://chat.acceptcat.com/`，使用已有科研微信账号登录。打开本站 Agent 的私聊，从输入框上方的 **本地文件夹** 进入：

1. 通过 Windows 文件夹选择器指定目录。
2. 查看可读取文件，点击预览并勾选需要发送的内容。
3. 输入任务，点击 **发送所选内容给Agent**。
4. 查看聊天中的实际附件、阅读状态和回复；附件发送成功不等于模型已经读完。

**当前发布状态：** Windows 0.1.0已打包。2026-10-07 10:24:26北京时间，云端客户端静态入口固定 `8b42d35a9e47b5159bfd19e5ce4155508d53f7e0` 已发布；Electron加载该云端聊天页面，重新打开即可获取入口。公网首页SHA256 `3a43637be852292eb7152c67e5208cfd029d73a1a40602ea854bd52b953e6cd1`、API / worker94b26d1 / 镜像d56ee747、contract0.19 / chat1.8 / schema18，八服务运行且API healthy，未迁移或重启后台。文档HEAD31995a5的三平台CI37560573547通过。真实桌面账号模型 / IM流程待用户桌面登录后验收。

## 本批实际能力

- 本机预览不上传。确认发送后，选中的文字与任务交给当前科研服务和此 Agent 使用的模型。生成一个 Markdown 附件走现有 OpenIM 文件投递与科研文件阅读 API，任务使用 API 的正式 text 字段。
- 支持有效 UTF-8 文字、常用代码、文字 PDF、DOCX 正文。PDF 可提取全部文字并保留页标；不读取图像、图表或版式，不做扫描 OCR。旧 DOC、XLSX 和二进制文件暂不支持。
- 单次最多选 10 个文件；路径、范围说明、正文及任务的 JSON 传输文字合计不超过 52000 字节。超限拒绝并保留选择，不悄悄截断。扫描最多列出 200 个文件、访问 10000 项、深度 12，约 3 秒时限；达到限制明确显示目录未列全。
- 隐藏文件、依赖与构建目录、常见凭据名称、符号链接和 Windows junction 不参与读取。文件变动会要求重新选择。只读，不修改、移动、删除或执行本地文件；用户的真实目录由用户自行选择。
- 窗口主进程保存目录授权，页面仅拿随机文件 ID 和相对路径。取消、切换页面、窗口销毁和渲染进程退出撤销授权；外来页面、iframe 和任意 renderer 路径参数不能使用此入口。没有放宽证书验证、webSecurity 或开启 nodeIntegration。
- 本批入口仅用于已连接的本站 Agent 私聊。真人、群聊和外部 Agent 不展示本地文件夹发送入口；这些场景的数据授权另行设计。

## 构建与检查

`clients/openim` 是独立 pnpm 10.28.0 工程，保留其锁文件与原 OpenIM SDK DLL。使用该目录的 pnpm 版本和 `--ignore-workspace` 安装，不能混用根项目依赖树。

```powershell
cd clients/openim
pnpm --ignore-workspace install --frozen-lockfile
pnpm typecheck
pnpm exec tsc -p tsconfig.node.json --noEmit
pnpm test:local-folder
pnpm build:web
pnpm build:win
pnpm electron:smoke
```

Electron 22 的 utilityProcess 使用 Node 16。独立解析进程固定 PDF.js 3.2.146 的官方 legacy 构建、同版本本地 worker 和自身依赖的流兼容层；禁用 eval，不加载外部脚本或使用 Canvas。不要把宿主 Node 24 的解析成功当作桌面进程成功。每份文档解析有 8 秒时限及进程堆限制；DOCX 解压有硬输出上限。

## 本批证据与边界

证据保留在 Git 外 `D:/deepseek-agent/.runtime/windows-local-folder-20261006/`。

- 真实 Node 文件系统 / PDF / DOCX 四组通过；包含 junction、文件替换、二进制、大小限制和撤销读取。
- 最终安装包生成成功；最终 renderer / Electron 类型检查通过，打包启动 smoke 通过。
- `native-final/report.json`：真实已打包 Electron 22 / Node 16 主进程、隔离 preload、原生 IPC 和 utilityProcess 通过五项检查，实际读取 PDF 第二页和 DOCX 正文、拒绝任意路径、撤销目录授权与导航授权。仅文件夹选择器响应替换为合成目录；没有真实模型或 IM 投递。
- `frontend/summary.json`：12 个必要生产 React 场景分阶段通过；此组原生桥、SDK、API、提取结果和模型字段均为明确替身。浏览器插件不可用，采用隔离 Playwright Edge 开发验收。与原生读取证据分开记录。
- `frontend-native-ui/render-6d14edc8/report.json`：最终打包程序、真实 preload 与生产 React 路由集成两项通过。真实 PDF 第二页预览零上传；PDF / DOCX 正文合并后的 544 字节 Markdown 经原生 saveFileToDisk / getFileByPath 回读，与 API base64 逐字一致，SDK替身一次发送、API替身一次请求。正式任务独立，模型与消息投递仍明确为替身，pageerror0。
- 隔离桌面在正常网络权限下实际进入正式 HTTPS 登录页，appVersion0.1.0、packaged与webSecurity为true、真实隔离preload可见；没有登录或提交用户资料。此前受限网络回落连接页，以及隐藏窗口CDP截图超时的失败报告保留。用户免安装程序已实际启动；原生电脑操作工具的新增应用审批超时，没有绕过该权限去控制用户窗口。
- 首次 Canvas 打包失败、utilityProcess 兼容失败、残留测试进程造成 DLL 占用、前端 fixture / 选择器失败保留，不能覆盖成全绿。宿主隔离 smoke 有 os_crypt 日志，既有 Antd / Router 弃用日志也保留。

静态部署收据、独立公网核对与GitHub检查保存在 `static-release/`。当前Nginx root是 `/opt/research-openim/client-releases/8b42d35a9e47b5159bfd19e5ce4155508d53f7e0/clients/openim/dist`；回退副本 `/opt/research-openim/ops/windows-local-folder-8b42d35a9e47-20261007T022425Z/research-openim-production`，恢复配置、nginx -t / reload并核对旧622e首页9f2591 / 八服务；数据库、API及worker保持。此前Workbench过期失败保留，用户恢复原连接后未新增SSH / Key / 端口。

尚未计完成：真实桌面账号 / OpenIM 文件 / 模型全流程、系统安装向导与升级、通知、自动更新、手机原生客户端、目录自动写回。后续验收追加到统一状态及项目日志。
