# 微信分享记录导入与 Windows 入口

## 本批范围与基线

负责人：luoyan96。分支 `feat/wechat-share-import`，起点 `origin/main/e2e7cf6`（Windows 0.10.104）。接入 `D:/deepseek-agent/wechat-import/HANDOFF.md` 的独立 Node 模块，新增自己的 Windows ShareTarget。无需后台接口、契约或数据库迁移；线上仍为 0.45/034。本批不合并、不公开发布，不包含另一分支 PR204 的任务直接提交修复。

## 使用流程

1. 在 AcceptCat 登录并打开目标聊天，点附件按钮 →「导入微信分享包」。选择用户明确导出的一个 ZIP；不扫描微信数据库、微信流 Ready 目录或历史文件夹。
2. 核对纯文本原文、来源 SHA256、附件名与大小。附件和原始 ZIP 默认不选；多个 TXT 候选由用户选择。未知正文仍保留原文，不推测微信号、时区、公众号全文或消息归属。
3. 「加入草稿」追加到当前输入框，保留已有文字；勾选的图片和文件进入原有待发区域。长正文默认转 TXT。随后由用户点原有发送按钮，上传和业务权限保持原链路。取消不发送；容量不足保留预览。
4. Windows 分享组件注册成功后，分享单个 ZIP 到 AcceptCat，辅助进程先原子暂存，再用不含路径的批次 ID 唤起客户端。冷启动及第二实例沿相同入口接收。登录并选择会话后，在附件按钮的待处理分享中预览。不会从外部材料推断收件人或直接发送。

这不是把外部导出伪装成 AcceptCat 原生历史消息。导入正文以「外部来源材料 · 微信分享记录」标记，原导出顺序和时间文字保留。

## 代码组织与会话边界

- `clients/openim/electron/wechat-import/`：本地交接模块的 ZIP/CRC/原文/预览/草稿与限权 IPC；只对接宿主，不另建账号、上传或发送服务。
- `electron/main/wechatImportManage.ts`：复用可信主窗口/frame 与实际 Cookie 会话核对，主进程生成不透明 scope。账号、会话及每次重访均重新发放；选择文件、读取附件和异步结果均复核。离开会话释放预览，renderer 不能传任意磁盘路径。
- `electron/utils/wechatShareInbox.ts`：只处理本应用暂存目录的 32 位批次 ID；校验常规文件、目录、大小和元数据。确认加入草稿后清除本应用临时副本，原始用户 ZIP 不动。
- `src/research/WeChatImportAction.tsx`：预览与显式确认；`wechat-import-draft.ts` 在修改文字/附件前统一校验并转义 HTML。附件菜单在打开预览前关闭，避免遮挡。
- `windows-share/`：独立 C# 接收组件、稀疏 MSIX 身份、构建和 NSIS 注册/卸载。发布者与 AcceptCat 自己的包身份绑定，不借用微信流身份。

ZIP 限制沿用交接模块：压缩 64 MiB、展开总量 128 MiB、单条目 32 MiB、TXT 16 MiB、2000 条目；内存预览最多 15 分钟/256 MiB。它们针对不可信归档解压，不是更改普通聊天或本地 PPT 文件限制。加入草稿沿用现有 8000 字、20 个文件以及图片 10 MiB/张、50 MiB 合计、20 张的约束。

分享暂存位于 `%LOCALAPPDATA%/AcceptCat/ShareInbox`，最多 32 批，不在 Git 中。辅助进程诊断只记阶段/错误码，不记文件名、正文、路径或凭据。

## 固定工具与构建

- Electron 43.8.4（现有内置 Node 满足模块 Node >=22）、React 18.3.1、TypeScript 5.1.6 不变。
- 新增精确依赖：`yauzl 3.4.0`、`buffer-crc32 1.0.0`；客户端锁文件已更新，依赖打进主进程运行文件。
- 接收组件：.NET SDK **10.0.404**，`net10.0-windows10.0.19041.0`，Windows x64、自包含运行时；用户无需另装 .NET。新增构建产物有运行时体积成本，不等同于只增加几 KB 的菜单。
- MSIX 工具：Microsoft.Windows.SDK.BuildTools **10.0.26100.9457**，脚本下载并检查固定 SHA256 `4c2e0d85f3490e7f7c065c35b4c47fe913b1bc9627e9711ae349b2cdc7edc791`。
- CI 新增固定 .NET SDK 和导入测试。包内容检查新增主进程/隔离 preload 两项，合计 13 个必要运行入口。

在仓库根目录按原开发说明准备桌面依赖，然后：

```powershell
cd clients/openim
corepack pnpm@10.28.0 install --ignore-workspace --frozen-lockfile
corepack pnpm@10.28.0 run test:wechat-import
corepack pnpm@10.28.0 run typecheck
corepack pnpm@10.28.0 run typecheck:electron
corepack pnpm@10.28.0 run build:web
# Windows 打包需 SDK 10.0.404（global.json），自动编译接收组件
corepack pnpm@10.28.0 run build:win
```

可设置 `ACCEPTCAT_DOTNET` 指向隔离 SDK 的 `dotnet.exe`。`ACCEPTCAT_SHARE_CERT_THUMBPRINT` 可指定 CurrentUser/My 中的签名证书指纹；只读取证书和调用 signtool，不导出私钥。省略时仍生成未签名 MSIX 与安装包，Windows 会拒绝不可信身份注册；客户端如实显示分享入口尚未注册，手动 ZIP 导入仍可用。**未签名 CI 包不代表系统分享入口已启用。**

本机测试签名不适用于公共分发。正式共享入口仍需可分发且受用户系统信任的签名方案。NSIS 只注册/卸载本应用组件，不自动向任何信任库加入证书，不改 Windows 安全设置。注册状态探针读取实际包身份，不用安装脚本退出记录冒充成功。

## 检查与证据

截至 2026-11-12：

- 客户端全部 **590** 项脚本检查通过；导入专项 23 项包含坏包/路径穿越/CRC、原件完整性、scope 失效、异步切换、第二实例批次、容量与 HTML 转义。
- renderer/Electron 双类型、frozen-lockfile 安装通过。
- Web/Electron 构建、Windows 解包构建、ASAR 13 项检查及隔离启动 `OPENIM_ELECTRON_READY` 通过。主进程打包依赖只在客户端构建目录生成，不将输出提交 Git。
- Browser plugin not available，使用隔离 Playwright/Edge、1365×900 的真实预览组件与合成宿主。确认纯文本、不执行脚本、默认不选附件、保留原草稿、图片/PDF 入草稿、取消不发送、无页面异常。修复发现的 Popover 遮挡后重跑通过。截图 `D:/deepseek-agent/.runtime/wechat-import-ui/{preview,draft}.png`。
- C# 及测试签名 MSIX 已生成，原生暂存自检退出 0；本机级测试信任获负责人单独授权后，包注册 `Status=Ok/SignatureKind=Developer`，实际身份探针退出 0。系统分享面板已显示 AcceptCat，**文件接收与真实微信分享仍待完成验证**，不能由“注册成功”推断接收成功。

日志根目录 `D:/deepseek-agent/.runtime/`：`wechat-import-all-client-tests-final.log`、`wechat-import-types-final2.log`、`wechat-import-electron-types-final2.log`、`wechat-import-package.log`、`wechat-import-smoke.log`、`wechat-import-ui-test.log`、`wechat-share-diagnostic-build.log`。失败证据保留：UI 取消按钮空格选择器、Popover 遮挡、Windows PowerShell 的 Cert provider 未加载、首次全客户端检查缺少预先构建的 skillImport 和固定插件（补齐后全量通过）、临时手动 builder 使用相对 config 的路径错误、当前用户信任不足 `0x800B0109`。

未做真实私人消息/账号/模型验收；未部署后台。真实多条导出、图片/文件混合包、公众号卡片与升级安装后的系统分享，由负责人后续验收。

## 来源

ZIP 模块和合成用例来自负责人提供的 `D:/deepseek-agent/wechat-import`（2026-11-12），本次只对接 async authority、批次选择和生命周期。格式与 Windows 稀疏包实践参考 [WeChatBridge](https://github.com/freestylefly/WeChatBridge) 和 [Microsoft ShareTarget 文档](https://learn.microsoft.com/en-us/windows/apps/develop/windows-integration/integrate-sharesheet-receive)。C# 接收器为独立实现，未复制其常驻进程、管道、UI 或业务代码，也不依赖安装微信流。共享声明的宽格式仅为微信枚举兼容，运行时仍只接受单个 ZIP。

本机测试 NSIS 已生成（仍用基线版本号 0.10.104，未上传公共 Release）：`D:/deepseek-agent/.runtime/wechat-import-installer/AcceptCat_0.10.104.exe`，475017105 字节，SHA256 `02faff452dad76e85076be582c81e12d17a8e9f312ac961b37eaf8b7999117ec`。签名对象仅为接收组件的 MSIX；不要把本机测试信任作为正式分发方案。NSIS 编译与附加资源经过检查，但尚未运行安装/卸载向导。日志 `wechat-import-nsis-final.log`。
