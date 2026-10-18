# 桌面请求在账号切换时隔离

2026-10-19，acceptcat 前后端优化自动化。本批产品源码 `3ed606a6892bdb7d680f27c3ed47a100c80e13b7`，从 `release/acceptcat-0.10.15` 的 `04dd9ba` 建立独立 worktree / `fix/desktop-session-isolation`。主目录的 0.10.16 工作台改版和其他 Skill / 广场任务保持独立，本批没有切换或提交其文件。

## 问题与行为

代码检查发现，`clearResearchSession()` 原来只清 CSRF、幂等键缓存和认证标记，没有取消正在读取会话或业务响应的请求。旧账号的会话准备在退出后完成，可能继续用新 cookie 发出旧聊天写入；迟到的会话正文可能覆盖新账号 CSRF；旧 401 可能清除新账号的 IM 本机资料并触发失效事件。这是合成条件下实际复现的竞争问题，尚无生产日志证明它是近期连接超时的原因。

客户端请求层现在同步登记各请求的控制器。退出/清理会话或明确开始新登录时取消旧请求，沿既有期限与 signal 检查阻断迟到的头、正文、会话准备及成功回执；即使测试传输忽略 abort，也不能更新共享认证状态或继续旧写入。递归 CSRF 准备沿用同一控制器，调用方取消及超时仍生效，结束后移除登记和监听。

当前账号的真实 401 仍清理认证、IM 资料并发出失效事件，取消同批其他读取；保留发起失效的请求，使其返回原有 `UNAUTHENTICATED` 错误。未将服务端权限错误改成成功，未自动重试写入，取消客户端等待也不声称撤销已经送达服务器的操作。公共/私人材料、CSRF、权限和幂等服务端规则不变，无新接口、契约或数据库迁移。

## 实际检查

证据位于 Git 外 `D:/deepseek-agent/.runtime/session-isolation-20261019`，不含生产凭据或科研资料。

- 修复前 9 项测试中，6 项旧检查通过，3 项新增竞争回归失败；保留 `baseline.log`。会话准备未停止、迟到正文未拒绝、旧 401 返回登录失效均实际出现。首轮修复 9/9 通过，保留 `focused-initial.log`。
- 最终 `node --test tests/send-recovery.test.mjs tests/desktop-proxy.test.mjs tests/auth-input.test.mjs tests/research-service.test.mjs`：23/23、0 跳过，包含 13 项请求恢复检查。额外覆盖真实当前 401 与同批请求取消、新登录替换旧读取、调度微任务前清理、迟到写入回执不自动重发。结果见 `focused-final.log`。
- Node 24.19.0、根 pnpm 11.21.0 锁定安装与根 `pnpm build` 通过；客户端 pnpm 10.28.0 锁定安装、TypeScript、生产 Web 构建及四份固定 SDK 资源/资产校验通过，见 `client-install.log`、`root-build.log`、`typecheck.log`、`web-build.log`。首次独立 worktree 安装的 Husky prepare 因 `.git` 为文件失败，使用 `HUSKY=0` 重试原锁定安装通过；首次测试遇本地 file 依赖尚无 dist，依赖构建/重新安装后通过，未改锁文件。一次重复复制已硬链接的 dist 报同文件，未作为通过结果。
- Browser plugin not available；使用现有 Playwright 1.61.1 / 隔离无头 Edge，在 `http://127.0.0.1:54061/__qa/index.html` 挂载实际 `ResearchLogin`，代理独立 54062 HTTP/SQLite 合成库。导师 A 登录 → 暂存旧会话响应 → 实际退出 → 学生 B 登录 → 释放旧成功/401 响应：两组均返回旧请求 AbortError，新身份/CSRF/合成 IM 存储保持，失效事件 0；B 的消息各实际写入并由 API 读回。另真实撤销当前服务端 session，401/失效事件和返回登录页通过。未配置 IM/模型；旧 401 与忽略取消的响应延迟为明确注入，实际登录、退出、CSRF、消息和 SQLite 均未替换。
- 1536×1024 和 1024×726 截图实看，无白屏/覆盖层、无目标区域裁切，pageerror 0；初始未登录及实际失效的两次 401、既有 Router/findDOMNode 警告解释保留，未声称零 console。首轮按钮名称未计 antd 中文空格而等待超时，保留 `browser-first-failure.log` 和 `login-failure.png`，修夹具选择器后 3 组通过，详见 `qa-summary.json`。

本批仅客户端请求实现与测试，不修改共享代码或 Skill，不重复根完整 CI；根构建不等于根完整 CI、真实模型或线上验收。未制作/安装新 Windows 包、操作生产、部署 API/worker、发布目录、公开 Release 或更新源。旧线上状态沿用交接记录，本次没有重新核验。后续审阅后将本提交集成入正在维护的桌面分支，按该分支独立打包及验证，不以本批源码修正声称现装已经更新。
