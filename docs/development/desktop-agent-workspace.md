# Windows Personal Agent 0.2.0

本批以 Windows 桌面端为交付对象。人与 Agent 共用联系人、私聊和群聊，沿用既有身份、模型设置、记忆与 OpenIM 消息服务。

## 桌面工作流程

1. 登录后打开个人助理或本人站内 Agent，点击输入区工具栏的“本地文件夹”。
2. 选择目录，勾选要处理的文件；预览仍在本机进行，不默认勾选或发送文件。
3. 输入目标并点击“开始分析并生成报告”。读取全部所选文件成功后才开始提交模型任务。
4. 按文件和文字范围逐段分析，长分析分层汇总。模型回复由既有科研 API 和 OpenIM outbox 发布，流式展示采用服务器真实进度。
5. 打开“文件任务与报告”查看进度、停止本任务、打开报告或定位 Markdown/HTML 所在目录。结果按账号和聊天保存在本机，源文件不被改写。

切换聊天不会改变文件任务的目标 Agent。换账号或失去原会话权限会停止后续步骤。退出桌面程序会停止本地后续编排；已提交的服务器任务可能继续，其回复仍在聊天中，已经保存的报告可在重启后打开。本批没有宣称实现跨重启恢复未完成的本地任务。

## 读取和执行范围

- UTF-8 文字/代码、可提取文字的 PDF、DOCX；默认排除隐藏项、凭据名、构建输出、依赖目录及符号链接。
- 每次最多10个所选文件。工作区单文件提取文字上限20万字符、JSON编码512KB；单文件PDF/DOCX源大小10MiB，扫描列表/深度/超时仍有界。原有合并读取模式52KB上限保留。
- 每段最多12000个UTF-16字符，完整保留尾部并避免拆开代理对。最多40步资料分析，随后按实际输出长度分层汇总；在线模型调用使用用户的既有模型设置和服务端预算。
- 报告保留实际来源和段落范围。模型若只使用部分文字，会明确标注，不将提取成功当成模型已通读。
- 不包含扫描OCR、图片理解、任意Shell、浏览器操作或MCP工具执行。文件中的文字不授予创建联系人或执行工具的权限。

## 桌面架构

安装包携带 React 界面与 Electron 原生能力。Electron只监听 `127.0.0.1` 的随机端口提供安装包内界面，固定选定的HTTPS科研服务接收API请求。API只代理 `/api/`；校验Host与Origin、拒绝跨站请求，登录会话按服务域名区分，其他本地Cookie不会转发。模型Key继续由科研服务保存，不传入桌面界面或文件解析进程。

原生文件授权与报告IPC只接受当前主窗口的主frame及本次桌面服务的精确origin。报告在`userData/desktop-reports`按账号/会话摘要和随机UUID保存，打开/定位只使用程序自己生成并核验的路径。Markdown格式转义后渲染，HTML不执行脚本或加载远程图片。

桌面窗口默认1280×820；聊天输入区收紧，保持直接工具栏和生成中继续输入。正文支持安全Markdown排版，具体阅读页码/技术回执收在可展开详情。创建或接入Agent入口放入顶部新建菜单。

## 构建与检查

在`clients/openim`运行：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.node.json --noEmit
node --test tests/desktop-work.test.mjs tests/desktop-flow.test.mjs
node scripts/electron-build.mjs --win --x64 --publish never
node scripts/electron-smoke.mjs
```

自动化核心流程使用真实临时文件、分段读取和报告文件系统，模型/API响应为明确合成数据。实际打包程序另检查本地界面、原生IPC和PDF/DOCX子进程。此批证据不能替代用户真实模型质量验收。

产物、截图、临时账号、实际文件内容与运行日志保留在仓库外`.runtime/desktop-modernization-20261007`。安装包、`latest.yml`与blockmap发布到GitHub Release后，既有安装版可沿用“检查更新 → 下载 → 安装并重启”。手动安装前退出旧版。

## 接手位置

- 本地分段/模型编排：`clients/openim/src/research/desktop-work.ts`。
- 文件选择及任务/报告界面：`LocalFolderAction.tsx`、`DesktopWorkCard.tsx`。
- 本机资料授权/解析：`electron/main/localFolderManage.ts`、`electron/utils/localFolder*.ts`。
- 本地报告存储/桥接：`electron/utils/desktopArtifacts.ts`、`electron/main/desktopWorkManage.ts`。
- 安装包内界面/科研API连接：`electron/utils/desktopServer.ts`、`electron/main/windowManage.ts`。
- 聊天Markdown/样式：`SafeMessageMarkdown.tsx`、`layout/desktop-layout.scss`、`ChatFooter/desktop-chat.scss`。

后续自主工具、持久任务恢复和主动跟进扩展应继续围绕个人助理和同一通讯录；避免把这些站内文本Agent误称为已具备通用电脑操作能力。
