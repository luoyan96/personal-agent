# AcceptCat 0.10.109 发布回执

UTC 2026-11-14T11:34:01Z 已公开为 Latest。[正式 Release](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.109) 的四附件大小和 GitHub digest 与本地 SHA256 均一致。

负责人要求补齐 PR #212 并核对实际安装包。#212 的最终 head 为 def5e4aa67ba3b32abe111097b58e0b2eb62ca41，四项 CI 通过后以 02cd2066225ab2074f37adfb044c7c615e7c00ff 合并。版本 PR #221 的 head 为 b16c579374d632e7dd7d355aaa9adb0f428a7633，四项 CI 通过后以 3efb436fbd325fa11bc4daa87ce282ad2b3f6777 合并。固定构建和 tag 目标为 b16c579，完整源码树与合并时 main 一致。

团队仓库连接只显示 URL 输入框，有无 .git 均可，回车可连接。默认分支与资料空间来自远端实际结果，已有仓库的自定义分支和迁移空间继续核对。资料文件导入、多选模板、任务交付、助理记忆、截图与本地聊天缓存保留在当前主线。

## 实际成品核验

从 EXE 提取 app.asar，确认新单地址表单文案存在、旧“资料空间 ID”字段不存在，preload 与主进程均包含 team-library-discover，实际 Git 实现与构建产物字节一致。再把 EXE 内的 teamLibrary.js 和 localDshRuntime.js 提取至隔离目录，使用这份成品代码分别连接 https://github.com/luoyan96/files 和 https://github.com/luoyan96/files.git，自动识别 main / acceptcat-demo，并同步版本819c27947a49d199f77414982ac7f9a284782cd9 的 6 条资料。

这次真实 Git 验证只读远端，未替用户修改生产共享绑定。表单提交顺序、失败后原配置保全、重复提交、权限与账号切换由组件和 IPC 测试覆盖。

冻结 1770 份输入，核对 EXE 内 136 份构建资源。桌面 596 项、客户端与 Electron 类型检查通过，既有载荷、更新清单、隔离启动、禁网跨进程聊天缓存检查通过。内置科研插件0.4.0、DSH0.2.1-rc.3。

本地安装包 C:/Users/luo/.codex/worktrees/task-file-submit/acceptcat-chat-experience/clients/openim/release/Base/0.10.109/AcceptCat_0.10.109.exe，桌面副本 C:/Users/luo/Desktop/AcceptCat_0.10.109.exe。大小 421255402 字节，SHA256 75e6aa7c0d9b4bdf2e52c240a47aa289e7dc643225055e3d4ef2084b118f8880。

本批只涉及客户端，继续使用已上线的后台0.49/039。真实安装后的账号交互验收由负责人执行。

## 证据与失败记录

D:/deepseek-agent/.runtime/release-0.10.109-20261114 下保存 installer-audit.json、feature-proof.json、packaged-library-result.json、packaged-library-test.log、build-source.json、windows-build.log、update-check.log、electron-smoke.log、packaged-cache.json、desktop-copy.json 和公开附件核验结果。前一批定向与596项桌面测试在D:/deepseek-agent/.runtime/library-url-integration-20261114。

#212 首次 Windows CI 在105次记忆历史写入测试处超过30秒，日志 pr212-failed.log 保留。同一提交重跑通过；#221 Windows CI 首次通过。未放宽产品超时或修改测试来绕过失败。准备时 gh pr diff --stat 参数不被当前gh支持，改用Git差异与文件列表核对。
