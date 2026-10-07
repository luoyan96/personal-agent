# Windows Personal Agent 0.3.0

本批以 Windows 桌面端为交付对象。人与 Agent 共用联系人、私聊和群聊，沿用既有身份、模型设置、记忆与 OpenIM 消息服务。

## 桌面工作流程

1. 登录后打开个人助理或本人站内 Agent，点击输入区工具栏的“本地文件夹”。
2. 选择目录，勾选要处理的文件；预览仍在本机进行，不默认勾选或发送文件。
3. 输入目标并点击“开始分析并生成报告”。读取全部所选文件成功后才开始提交模型任务。
4. 按文件和文字范围逐段分析，长分析分层汇总。模型回复由既有科研 API 和 OpenIM outbox 发布，流式展示采用服务器真实进度。
5. 在聊天内任务卡查看阶段、当前资料及实际分析步骤；展开详情、停止本任务，报告保存成功后直接打开。工具栏“文件任务与报告”保留历史报告和文件位置。结果按账号和聊天保存在本机，源文件不被改写。

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

桌面窗口默认1280×820。72px深色导航栏提供消息、通讯录及真实模型设置入口，300px会话栏支持本机已有聊天的名字筛选及新建 / 添加菜单；人与Agent共用通讯录。白色聊天头部、浅灰聊天区及蓝白气泡，正文保留安全Markdown。输入区保持直接媒体 / 本地文件工具栏和生成中继续输入；模型进度与文件任务真实状态直接呈现在聊天中，范围及技术回执可展开。群聊保留发言者名称。搜索只筛选已有聊天，不当作全网联系人发现。

任务进度的completed / total代表实际分析步骤，包含长文件片段及后续汇总；完成最终汇总后增加计数。报告保存成功后才显示任务完成和报告入口，错误保留真实原因并去除IPC技术前缀。切换聊天仍绑定原任务及身份。

## Agent交互与CopilotKit / AG-UI的关系

当前项目没有安装或连接CopilotKit / AG-UI。模型回复由服务端接收真实厂商增量，并保存为有版本的`AgentTurnProgress`；客户端每500毫秒读取当前快照，临时回复在正式OpenIM / canonical消息出现后去重。`phase=final`只表示本轮回复定稿，不能解释成用户任务完成。文件工作区由桌面按用户明确选择的资料编排，原生桥读取文件及保存报告；这些步骤不是模型自主发起的通用工具调用。

[AG-UI](https://docs.ag-ui.com/concepts/events)规定Agent与界面间的事件形状；[CopilotKit](https://docs.copilotkit.ai/reference/v2/hooks/useAgent)提供订阅消息 / 运行状态 / 共享状态的React接口，[工具渲染接口](https://docs.copilotkit.ai/reference/v2/hooks/useRenderToolCall)把真实工具调用及结果映射为应用自己的交互组件。采用这些库仍需要接通可执行的后端和权限范围。

| 用户看到的内容 | 当前真实来源 | 正式接入AG-UI时的对应内容 |
| --- | --- | --- |
| 正在回复与逐步出现的正文 | 授权的turn progress快照、revision及正式消息ID | `RUN_STARTED` / `TEXT_MESSAGE_*` / `RUN_FINISHED`，保持稳定run / message ID及去重 |
| 文件任务阶段、当前资料及进度 | 本机`DesktopWork`的phase / completed / total / currentFile | 运行及步骤 / activity状态；completed与total代表分析步骤，不能改称文件数 |
| 可打开的本机报告 | 原生桥实际保存返回的artifact，按账号 / 聊天分区 | 已执行工具的真实结果；只在保存成功后显示交付，不用模型文字替代 |
| 停止 / 输入补充 / 操作失败 | 原请求取消、连续聊天新输入及实际错误 | 按当前身份与原run处理取消 / 错误 / 后续输入，不能跨会话修改 |

接入时先在服务器增加保留鉴权、持久消息和运行ID的协议适配，再让CopilotKit订阅事件；通用工具须另加真实执行与用户授权。桌面原生工具只能在其已授予的文件范围内执行。界面改造不会自动完成这项协议迁移，也不把当前文本Agent升级为通用自主Agent。

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

0.2.0核心文件流程证据保留在仓库外`.runtime/desktop-modernization-20261007`。0.3.0界面证据在`.runtime/desktop-interface-20261007`：真实Electron22 / Chromium108，生产组件配合明确合成的SDK / API / 报告桥，17项定向交互通过，1280×820及168px输入区、无横向溢出、未捕获页面异常0；真实生产desktop runner取消目标请求已验证。不是用户真实账号或模型质量测试；开发环境Router / CSP / Antd警告仍保留。概念图、最终类型检查、实际长文件与合成模型计数检查及Windows构建 / 发布证据在`.runtime/desktop-ui-refresh-20261007`。

安装包、`latest.yml`与blockmap发布到GitHub Release后，既有安装版可沿用“检查更新 → 下载 → 安装并重启”。手动安装前退出旧版。

## 接手位置

- 本地分段/模型编排：`clients/openim/src/research/desktop-work.ts`。
- 文件选择及任务/报告界面：`LocalFolderAction.tsx`、`DesktopWorkCard.tsx`。
- 本机资料授权/解析：`electron/main/localFolderManage.ts`、`electron/utils/localFolder*.ts`。
- 本地报告存储/桥接：`electron/utils/desktopArtifacts.ts`、`electron/main/desktopWorkManage.ts`。
- 安装包内界面/科研API连接：`electron/utils/desktopServer.ts`、`electron/main/windowManage.ts`。
- 聊天Markdown/样式：`SafeMessageMarkdown.tsx`、`layout/desktop-layout.scss`、`ChatFooter/desktop-chat.scss`。

后续自主工具、持久任务恢复和主动跟进扩展应继续围绕个人助理和同一通讯录；避免把这些站内文本Agent误称为已具备通用电脑操作能力。
