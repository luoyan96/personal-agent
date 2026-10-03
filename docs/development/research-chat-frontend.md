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

## 真实 API 适配里程碑

布局提交：`7a6aa85463f4f5c45c93005e23be320c5b129245`。按总控授权原样合入后端契约 `0f1f88b`（本分支 `bf5d5e5`）和 turn 预算/主人授权修订 `c787988`（本分支 `48c82fd`）；没有自行编辑共享包或后端。继续使用契约 0.10.0 / chatProtocol 1.0.0。

新增 `chat-api-source.ts`，所有服务对象使用共享类型、RequestFor/ResponseFor 与现有 ApiClient。接通默认 personalConversation ensure；contacts/conversations/messages/actions/invitations 的 opaque cursor 分页；会话详情；真实消息/turn；direct；群邀请；动作确认/放弃；turn 取消/按 remainingBudget 明确重试。轮询 5 秒重新授权及重新投影历史，不自动重试模型。初始 ensure 失败时不启动后台命令重试。消息按 ID 去重、sequence 排序。历史全量分页重新投影是当前保守做法，避免撤权资源遗留；大型会话增量优化待后续，不解析 cursor。

个人助理默认显式 ask_agent，预算 12000 tokens / 120 秒。群里默认普通聊天，@本身不执行；“问 AI / 让助理安排”要求明确选择已加入的 AI。显示个人 AI 主人、公共 AI、真人与邀请/加入状态；未加入的对象不进入 @或 AI 选择器。通讯录公共/其他主人个人 AI 的私聊入口准确解释需在群内使用，不发无效 direct 请求。其他主人 agent 的群邀请由服务按主人权限返回，前端使用独立群邀请决定，不替主人接受。

ChatAction 卡展示完整不可变 payload、分享片段/文件版本、成员、任务/能力版本、预算与日期。create_group 额外 GET 精确 getPlan，展示目标、每项任务目标/交付/验收/分工/时间/依赖/输入/预算/问题；当前方案版本或状态不符、过期时禁用确认。applied 建群显示“任务群已建立”。确认只调用 decideChatAction 的事务路由，并使用真实回执 conversationId 打开新群，不拼接前端建群/任务请求。

群内根据真实 TaskSummary/Assignment 投影展示本人任务邀请，支持接受原范围与时间或拒绝（invitationDecision）；群加入与任务承接是两个按钮、两个命令。只有完整 task 权限才进入可选 AI 上下文，pending invitee 的摘要不会被塞进模型 context。范围及完整日期在卡内可核对，旁观者不显示代承接控件。

群内“材料与授权”勾选明确 task/artifact 版本；默认不勾选，不静默传入所有任务或文件。选择文件时所属任务同步可见勾选，最多 20 个引用。版本/权限变化解除旧勾选并提示重新选择。可上传文本到有 upload 权限的当前群任务（既有 upload、UTF-8/base64、expectedVersion、幂等）；上传只保存文件，选择后才给 AI。失败保持文本，未调用模型。上传文本编辑器限制 200000 字符，服务仍校验 1..10MiB。

getRun 轮询当前权威状态；候选卡内展示 EvidenceChecklist 标题、要求、判断、引文、缺口和限制。按 allowedActions 支持取消公共运行及确认提交候选（cancelRun/submitCandidate，当前运行与任务版本）；提交是交付，仍待人工验收。candidateDeliverableId 存在时展示已提交与当前交付/验收投影，不再说仍需提交。交付验收与更复杂协调保留任务详情辅助入口。

轮询只更新列表、历史、成员、权限/选项，保留消息 textarea 的 DOM、value、caret、focus；IME composition 时暂停。beforeinput 捕获真实编辑区间，修复在已有 @前插入相同字符导致旧绑定丢失；多个 @按 range 排序、同联系人不重复绑定。失败恢复输入可编辑。读写请求携带 AbortSignal，销毁后不显示迟到结果；同账号导航保留未决 Intent 与精确 key/body，换账号/显式退出清除。失去权限隐藏旧投影及清除私人缓存。旧 list snapshot 不参与聊天过期检查，避免发送后旧快照把活会话清掉。

## 接线验证结果与边界

- 根 `pnpm --config.verify-deps-before-run=warn run ci` 通过：25 文件 / **316 测试**；全部构建/类型/文档与操作脚本/导出检查、B0 真实进程、生产禁止 fixtures 均通过。前端 **11 文件 / 85 测试**。安装环境与运行沙箱的 workspace 状态提示不同，默认 pnpm 会尝试无 TTY 重装；使用 warn 保留已经按 frozen lockfile 安装的原依赖，没有改 lockfile 或跳过检查。
- `chat-api-source.spec.ts` **10 项**使用合成 transport 且响应经过共享 Schema：真实路由字段/分页/去重、personal ask_agent vs group chat、加入限制、幂等 key/不同负载保护、分享完整范围与版本、501无回退/换身份、摘要上下文排除/inline承接、完整方案版本失效、UTF-8上传/显式材料/候选提交、真实剩余预算重试。这些不等于实际聊天服务成功闭环。
- `check-chat-browser.mjs` **6 组**合成开发预览/注入同一个生产组件：1280×900、390×844、320×844；@多提及/前缀/排序/解除，安排方式与材料勾选、上传失败留稿；后台读取保留 textarea/caret/focus，IME时暂停；桌面/窄屏/四类卡/通讯录/禁用发送。console/pageerror 为空，无框架覆盖或横向溢出，截图复查通过。默认已存在的个人会话在手机上直接打开，返回按钮可切会话列表。
- `check-chat-service-browser.mjs` **3 组实际 HTTP**：只启动本分支已有 API（迁移011）与独立 SQLite/随机合成凭据、正式前端入口，**没有拦截任何成功响应**。密码登录、session/me/members、personal ensure 返回实际 **501 NOT_IMPLEMENTED**，页面没有伪造历史或成功回复；501刷新与旧协作入口留稿，退出并登录 B 清除 A 输入；390/320px无溢出。无 pageerror/框架覆盖；4 条浏览器资源错误全部是预期 501。没有模型凭据或调用。

关键命令：上述 CI；设置 bundled `PLAYWRIGHT_MODULE` 后分别执行 `node apps/web/scripts/check-chat-browser.mjs`、`node apps/web/scripts/check-chat-service-browser.mjs`。后者只使用自己启动的 3196 API / 4187 Vite，端口已占用则拒绝，不动其他窗口服务；结束后关闭自己的子进程。Vite 可用 `RESEARCH_CHAT_API_TARGET` 指定隔离本地 API，默认仍为 3100。

最新证据：`.runtime/chat-browser/{results.json,desktop.png,group-cards.png,mobile-390.png,mobile-320.png,unavailable-320.png,selected-reference.png}`；真实 HTTP 501证据 `.runtime/chat-service-1791048475634/results.json` 与实际窄屏截图。运行数据/随机测试凭据未入 Git。更新 UI 与参考同尺寸截图再次对照，语义新增控件是授权闭环要求，灰色三栏/消息/绿色/独立输入区保留；窄屏菜单可滚动、发送可见。QA final result: passed。

当前未在本窗口验证完整 CHAT1 服务成功建群、主人授权、后台模型与公共能力实际产出。总控已接收后端服务 `d47bda5`，将把此前端接线提交整合后进行独立真实服务浏览器验收。没有合入整个后端实现，没有读取真实用户数据/Key、部署、GitHub 上传或合并 main；缺模型配置不是前端构建失败。
