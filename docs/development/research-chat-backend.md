# CHAT1 后端服务与 worker 交接

日期：2026-10-04。分支 backend/research-chat；目录 research-agent-platform-chat-backend。未修改 apps/web、未部署、未推 GitHub、未读取真实用户资料或真实 Key、未调用收费模型。共享契约保持 0.10.0，聊天协议 1.0.0，迁移新增 012。

## 实现结果

15 条聊天路由均已实现。联系人采用持久且稳定的 ID，同实验室真人、成员个人 agent 和已配置的公共能力使用统一目录。个人会话每人唯一，真人 direct 每对唯一；消息、群成员、邀请、建议动作、模型 turn、尝试用量和签名分页快照持久化。发送先保存用户消息，无配置返回持久 unavailable turn；普通 chat 和普通 @ 不派发。

新增 [ChatService](../../apps/api/src/chat.ts) 与 [ChatWorker](../../apps/api/src/chat-worker.ts)。ChatWorker 的 ChatModelOutput 是实际受限 Harness JSON 问答/澄清/草案/行动意图协议；没有生产关键词回复、模拟成功或 fixture 回退。ModelCall 默认复用 callHarness，读取现有实验室加密配置，在既有受限子进程中调用已固定的官方 Harness；模型没有 DB、cookie、文件系统、私人工具或命令执行权限。合成注入只存在测试构造器入口。

采用独立 chat_turns/chat_attempts 队列，避免修改旧 execution_jobs 的 planning/capability 联合语义；同一 worker:start 同时轮询聊天与既有执行，离开浏览器继续运行。队列拥有持久租约、fence、尝试记录、显式预算和取消恢复；过期运行标 interrupted，未知用量不得重试，晚到结果不能落消息、计划或动作。请求/API 调用前后和 worker 租约刷新时都会 reconcileChat。

建群确认在调用方既有 SQLite BEGIN IMMEDIATE 内复用 Collaboration.handlers.confirmPlan；邀请复用 handlers.invite；公共执行复用 AiService.handle('run')。三者连同群、邀请、服务消息和 idempotency 回执原子提交，不另开嵌套事务。已上线的 task/assignment/execution/deliverable 权威状态没有复制到新聊天对象。

create_group 只投影 canonical task refs 和本次 pending assignment refs；invite_task 回执也包含当前 task 与 Assignment 引用。群中对每个读取者实时过滤：自己的邀请记录可以读取，未授权的其他任务和交付不返回。私人 Plan 全文不进入群，只保存人工确认的 selectedText 和获准 artifact refs。模型输出原子 savepoint 验证，非法引用不会留下半个草案/建议/回复。

其他成员的 personal_agent 公开目录身份及归属，其 group 邀请必须由 owner 单独接受；第三人不能代授权，human 与 agent 邀请不合并。agent 接受后只在该群内使用当前请求者有权读取的群消息和 context。群的模型输入从未查询该 agent owner 的 personal conversation；撤权使排队/运行失效。owner 只授权 agent 加入而本人 human 未加入时，可以查看授权群以管理 agent，但 allowedActions 不提供 send，真人发送拒绝。

上下文、文件、任务、模型生成消息与动作的每次读取都重新鉴权。群 context 只允许关联任务中的对象；输入版本变化使 turn 失效。chat_plan_sources 和动态 chat_invalid_plans 追踪生成草案/任务的授权来源，源对象撤权或版本变化后草案/关联任务不能继续当作获准状态。计划读取、计划分页和任务授权查询纳入该保护。群撤权不偷偷撤销已接受的真人任务承诺，任务仍经原撤权/转交流程处理。

分页使用 15 分钟 DB 快照和签名 bounded cursor，绑定 actor/lab、方法、会话及筛选；消息高水位和会话排序键固定，下一页按当前 ACL 过滤。afterSequence 与 cursor 互斥；非法/过期/改变筛选是 CURSOR_EXPIRED，失去群权限是 NOT_FOUND。@使用原始文本 UTF-16 半开区间与稳定 contactId，服务校验 exact display text 和 joined 状态；模型输入保留 mentions/resources 与明确的 requestedAgent Contact，不能凭同名替换身份。

## 前端必须同步的契约修订

独立共享提交 `c787988e78690c9faa70eb322587db36c5471c52` 在未发布的 0.10.0 内增加 AgentTurn 必填 budget、remainingBudget、allowedActions。schema 名称与所有路由输入不变；implemented 标记为 true。见[精确契约](research-chat-contract.md)、[Zod/TypeScript](../../packages/contracts/src/chat.ts)、[OpenAPI](../../packages/contracts/openapi.json)。

budget 是原始 root 总预算，remainingBudget 由全部持久尝试合计，不确定用量/耗尽为 null。前端只渲染 allowedActions，不猜测状态是否可重试；重试 POST 使用 remainingBudget。重试新 turn 会同事务更新原 human message.turnId；旧 ID GET 仍返回原记录，不偷偷返回新 turn。同 root 已有 queued/running/waiting_input 或请求历史旧尝试不再允许另一次新重试；相同 key 返回同一新 turn，最大三次模型尝试。

## 验证与复跑入口

聚焦命令在本 checkout 根目录执行：

```powershell
pnpm --filter @research-agent-platform/contracts build
pnpm contracts:export
pnpm --filter @research-agent-platform/api build
pnpm test apps/api/tests/chat.spec.ts
pnpm --filter @research-agent-platform/api typecheck
pnpm run ci
```

[chat.spec.ts](../../apps/api/tests/chat.spec.ts) 的 setup 是完整合成库初始化入口：每个用例创建独立 temp SQLite/blob/master 文件，migrate 到012，seed 三位 synthetic 成员，真实 scrypt 账号/登录/CSRF，授予合成 manager，配置可识别的合成加密 Key 和公共能力。afterEach 清理全部临时材料，测试日志不打印凭据。ChatWorker 与 ExecutionWorker 都注入明确标记的 ModelCall，不请求 provider。重新运行该文件即可重建全过程；生产/API没有测试模式自动回复。

11 个服务用例覆盖：缺配置持久消息/去重与重启找回、普通问答/澄清/非法 JSON、草案确认建群→@真人邀请→真人接受→上传文本→公共执行→候选→待验收 Deliverable、个人 agent owner 授权前后/私人历史隔离/撤权晚到结果、分页高水位/过滤/撤权、租约恢复/取消、建群自带 pending 分配的群投影、task version/跨群私人 plan/非法建议事务回滚、retry 预算/输入重绑定/活动 root 去重/未知用量、同名成员的 mention ID 与两个 AI 中明确 requestedAgent、源版本变化后派生草案/任务/待承接记录不可见。

无模型配置的可操作合成本地服务初始化（使用独立新目录，避免任何生产 DB）：

```powershell
$env:NODE_ENV='development'
$env:DATABASE_PATH='D:/deepseek-agent/research-agent-platform-chat-backend/.runtime/chat-synthetic/platform.sqlite'
$env:BLOB_ROOT='D:/deepseek-agent/research-agent-platform-chat-backend/.runtime/chat-synthetic/blobs'
$env:TEST_CREDENTIALS_FILE='D:/deepseek-agent/research-agent-platform-chat-backend/.runtime/chat-synthetic/accounts.json'
$env:APP_ORIGIN='http://127.0.0.1:4175'
$env:B3_AI_ENABLED='0'
New-Item -ItemType Directory -Force -Path $env:BLOB_ROOT
pnpm build
pnpm db:migrate
pnpm db:seed
pnpm db:credentials
pnpm api:start
```

另一个终端设置相同 DATABASE_PATH/BLOB_ROOT/APP_ORIGIN/NODE_ENV，再执行 `pnpm worker:start`；单次巡检入口 `node apps/api/dist/worker.js --once`。上面禁用真实模型，所以发送能保存且明确 unavailable；账号文件仅供本地合成登录，不能提交。需要查看真实模型流程时，维护者沿用现有实验室设置和 capability:configure 授权配置通路；本任务没有配置真实模型。纯合成完整成功闭环通过前述注入测试复跑，无需模型费用。

## 当前限制

真实 DeepSeek 普通问答/群建议还未验收，合成 ModelCall 的成功不等于模型质量、引用科学真实性或真实费用证据。普通模型问答并非新增私人能力托管：个人 agent 在群里无 owner 私人记忆、外部工具或私有技能。

为了避免 confirmPlan 自带的 public_agent 自动派发绕过单独 run 确认，聊天建群建议只允许 self/claim/invitation 分配；public_agent 执行在建群之后用 run_task 单独确认。模型误输出 public_agent 草案则明确 INVALID_MODEL_OUTPUT，不静默替换。人工任务完成仍走既有 start/submit/review；取消/提交公共候选也走旧接口。该批没有新增文件复制、任意自主循环或附件 OCR。

每个模型 prompt 最多20条当前会话消息、32000字符消息窗口和20个版本引用，总 prompt 超100000字符明确 BUDGET_EXCEEDED；目录最多100个公开联系人供模型，真人接口正常分页。由模型产生的 group 草案最多20任务。联系人列表/会话列表初页建立快照目前在内存整理授权条目，适合当前实验室规模，尚未做大规模目录压力验收。

源版本改变会使使用该上下文生成的草案/任务失效，需要重新建议与确认；这是保守授权边界，未实现自动迁移已共享的派生方案。群内容已合法阅读/下载的副本不能追溯收回。群 owner-only 建议避免私人 proposal 泄露，其他真人参与者可以 ask_agent 普通问答，但邀请等动作要满足原业务权限。

根 CI 的独立后端 checkout 仍包含前端 0.9.1 固定断言；按分工未修改 apps/web，由前端/总控同步。最终测试结果记录在下方，由整合共同验收最终确认。

## 检查结果

- 聚焦 `pnpm test apps/api/tests/chat.spec.ts`：11/11 通过；API build/typecheck 通过。
- `pnpm run ci`：内容、运维语法、全 workspace 构建/类型、契约导出一致性通过；314 测试中313通过，仅 `apps/web/tests/contracts.spec.ts:25` 的旧0.9.1版本断言失败。全部后端、共享契约、Harness无凭据边界测试通过，不能称根CI整体通过。最初的6处迁移总数断言已更新至012并全回归通过，历史行/会话/凭据/校验和仍保留验证。
- CI提前停止后单独执行 `node scripts/check-b0-process.mjs` 和 `pnpm --filter @research-agent/web check:production`：真实进程 smoke 与生产排除 fixtures 均通过。
- 文档检查通过；生成输出和临时库没有提交。首次全量并行测试使长合成链路超过默认5秒，CHAT1用例时限设为15秒后通过；没有缩减断言。
- 根CI包含的Harness凭据缺失验证是预期边界；本轮没有真实模型专项或生产交付验收。

总控下一步可同步共享修订提交和服务提交，修复其前端契约版本断言，再进行独立浏览器/多账号共同验收。该后端窗口完成后停止，不主动部署、发布或调用模型。
