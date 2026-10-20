# Windows0.10.24：聊天列表可拖动调整宽度

2026-10-20，北京时间。从实际干净 `fix/library-agent-dock-0.10.23` / `2a30b65` 新建 `fix/chat-sidebar-resize-0.10.24`，未切main、未覆盖已有修改。产品固定 **2b5c0db8022bbd392333bb1649ed7024b341e06c**。

## 行为

桌面聊天列表原本固定248像素，原CSS调整区域被隐藏。现将列表与正文之间的竖线改为10像素可命中的分隔条，悬停/键盘聚焦/拖动时显示蓝线，支持鼠标左右拖动和指针捕获。宽度220—480像素，窄窗按聊天区域剩余宽度收窄，尽量为正文保留360像素；恢复宽窗回到偏好宽度。双击恢复248像素，左右键每次16像素，Home/End到达边界。

调整结束后保存在本机localStorage，仅为设备布局偏好，不涉及账号/资料或后台同步。存储不可用时仍可调整；小屏隐藏手柄并保留原聊天页面切换。只改桌面聊天列，其他FlexibleSider及会话/消息/API行为保持。

## 验证

- 渲染/主进程类型检查通过；34项定向通过，含4项宽度边界/无效值/窄窗/恢复检查，以及既有资料Agent、连续发送恢复和Chromium传输检查。共享API/契约/核心/Skill未改，不重复根693项CI。
- Browser plugin not available，采用CUA内置浏览器/AX/Playwright。实际React组件、真实HTTP/SQLite，IM为明确合成夹具；没有调用真实模型或发送真实消息。
- 1280×720页面身份、非空、无框架错误覆盖层、截图/交互通过。鼠标248→368、刷新仍368，再次248→378；新页恢复394，向左拖至220。双击248、键盘264/220/480通过；搜索Synthetic B并切换后标题对应B。
- 820像素应用容器内列表384/正文360，恢复宽容器列表480。浏览器视口仍1280×720，这不记为另一个真实窗口尺寸或移动端验收。最终新页无error，仅既有两项Router警告。
- 首次编译导航超时、初始IM分页夹具忽略offset造成重复key、夹具热更新重复createRoot均保留在Git外ui-console.json；修正夹具后全新页面重验通过，未为测试更改产品分页。
- Git外证据：`D:/deepseek-agent/.runtime/chat-resize-20261020`，包括ui-proof.json、checks.json、ui-final.png、ui-final-console.json、初始ui-console.json、构建/安装载荷/启动日志。

## 安装包与发布状态

Windows x64 NSIS：**C:/Users/luo/Desktop/AcceptCat_0.10.24.exe**，**87,431,310字节**。

| 文件 | SHA256 |
| --- | --- |
| 安装器 | `6512d67a1508d0ea9417e6e05be3b98c48c85e3f296e1b17066de5a6cfa38e54` |
| 实际NSIS内app.asar | `6b6870cb4c73f4f4723b87a1570cb26e9c28bea5e17462c8aeed5c70af8d4673` |
| 实际NSIS内AcceptCat.exe | `a6f135e11a96df588fc19c23bcc81b54b4d561640286169d1d646663951d67de` |

生产构建、18JS/8CSS与生产dist逐字节一致、52运行包/55装配包、新分隔条/宽度存储与既有联网/飞书/资料聊天/任务/模型设置/品牌资源检查通过，无QA内容。实际NSIS载荷与受测目录EXE/ASAR一致，隐藏隔离数据目录启动OPENIM_ELECTRON_READY通过；既有electron-log重复初始化提示保留。

安装包已制作并复制桌面，没有代安装、退出用户客户端或清理旧包/用户数据。公开latest实读仍v0.6.0；--publish never，无公开Release/更新源变更。需覆盖安装后体验。

## 后台与接续

本批无后台部署/迁移/飞书权限/密钥变更，沿既有contract0.26/schema023，image sha256:4ee12e77f80da2e196e6640980dbdb521a1bfa5e168ac1ced6012f387e63ea0d，OCI 47c42acbccf64b1d329babb26a464733b81d51d3+key-preview.4bc8d1f+feishu.2bbcfbc，飞书0.1.0仅罗岩；本批不重新inspect服务。真实资料/模型科研质量、飞书本人OAuth和更多窗口尺寸沿原计划继续，不能由本次布局验收代替。
