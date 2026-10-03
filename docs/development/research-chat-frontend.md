# 科研聊天前端

日期：2026-10-04。仅在 frontend/research-chat 的 apps/web 与本报告修改；未部署、未调用模型或读取真实凭据。

## 布局里程碑

基于 21fd970，沿用 Vite + TypeScript 和已有 Phosphor 图标，无新增依赖。登录后默认聊天入口；旧协作入口在 `#/work`，任务、登录/邀请码注册、实验室设置原路由继续可达。

- `chat-view.ts` 是展示组件及可注入数据源边界，投影仅描述 UI，不定义第二套领域状态或服务权限。支持置顶会话、通讯录统一身份/归属/可用状态、搜索、群成员、消息、邀请/运行/成果/错误卡片。
- Enter 发送、Shift+Enter 换行，IME composition/229 不触发发送。@只从当前会话成员选择，保存联系人 ID 与文本区间，编辑时更新偏移或解除被修改的绑定；键盘上下/Enter/Escape 可用。
- `chat-source.ts` 在未接通 API 时只投影已有真实授权成员，不虚构 agent、在线状态、会话历史或执行。助理入口是明确待接通的界面入口，不是伪造会话对象。发送禁用，可写输入。
- 只在内存留稿，同账号导航可恢复；显式退出和换账号清除。销毁组件取消请求，读取失败清除受限显示，不自动重放命令。
- `chat-preview.ts` 仅开发 demo 模式且 `?chat-preview=1` 显式启用。合成数据带开发标签，生产构建排除。

## 布局验证与设计 QA

Browser plugin not available；按 frontend-testing-debugging 的 Playwright 路径使用已有 bundled Playwright 与 Edge，没有安装新浏览器依赖。

检查：前端 typecheck、build、check:production 通过；前端 Vitest 10 文件/75 测试通过。`check-chat-browser.mjs` 的 6 组验证通过，1280×900、390×844、320×844；页面身份、非空、无框架错误覆盖、console/pageerror、截图、交互均通过。验证通讯录/筛选、群成员、四类卡片、键盘/IME、失败留稿、@ ID/偏移/删除、窄屏切换与无横向溢出、待接通发送禁用。

命令：`pnpm --filter @research-agent/web {test,typecheck,build,check:production}`；设置 `PLAYWRIGHT_MODULE` 为 bundled `playwright/index.mjs` 后运行 `node apps/web/scripts/check-chat-browser.mjs`。本地预览 `pnpm --filter @research-agent/web dev:demo --port 4186`。

截图及 JSON 位于忽略目录 `.runtime/chat-browser/`。读取用户选定微信截图，并以 1280×900 捕获选定方向稿；与同尺寸实现截图在同一工具结果中查看。字体采用方向稿的 Segoe UI/微软雅黑，灰色导航/列表/聊天背景、绿色身份和消息、浅圆角、三栏与独立输入区一致。可用性/搜索/通讯录是需求补充；窗口扩展到视口高度是正式应用的有意适配。方向稿的演示成功回复与假执行没有搬入。头像用已有身份图标，保留 AI 与真人区分。320px 菜单、输入和发送可见，无裁切或横向溢出。

最初发现失败后输入禁用未恢复，修复并重跑通过。当前布局 QA final result: passed。按任务限定范围将 QA 记录放在本报告，没有新增项目根文件。

## 接线待办

需共享契约提供联系人身份/主人/能力状态；个人助理与群的真实 ID、成员、邀请与发送权限；消息发送者/身份/时间/分页与稳定去重 ID；提及联系人 ID/区间；受控动作及分享范围、任务/版本/预算；运行/取消、成果/交付/验收状态与权限。展示动作不推断权限，必须由权威 API 投影。当前没有真实聊天 API 验证，合成测试不是模型调用证据。

总控已冻结 0.10.0 契约并授权继续接线：布局先提交，然后合入指定契约提交完成真实适配。后端联调另记录。
