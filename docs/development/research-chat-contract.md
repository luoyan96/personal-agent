# 科研个人智能体与任务群接口里程碑

2026-10-04 当前修订：契约 **0.11.0**、聊天协议 **1.1.0**，共 17 条路由。新增 viewerState、已读及置顶偏好；当前字段、操作及兼容影响见[会话状态接口](research-chat-viewer-state.md)。下面原接口里程碑的验收数字保留历史记录。

2026-10-04，共享契约 0.10.0，聊天协议 1.0.0（CHAT1）。接口冻结后的服务里程碑将 15 条新路由标记为 `implemented: true`，实现和验收证据见 research-chat-backend.md。现有 0.9.1 路由保持语义，新聊天字段不进入现有任务状态对象。无新增依赖，无真实模型调用。

本次未发布契约的必要修订：AgentTurn 新增必填 `budget:Budget`（原始整条尝试链总预算）、`remainingBudget:Budget|null` 和 `allowedActions:('cancel'|'retry')[]`。未知用量或预算耗尽时 remainingBudget=null，不能重试；前端只按 allowedActions 显示按钮，重试用服务器 remainingBudget。retry 创建新 turn 并在同事务更新原输入消息 turnId；GET turn 始终返回请求的 ID。原 turn 与所有尝试记录保留，同一 root 最多一个 queued/running/waiting_input，最大三次模型尝试。全部使用量从持久 attempts 计算。

总控按用户核心需求修订目录与授权：同实验室所有已注册成员个人 agent 显示公开名字、稳定 ID 和 ownerMemberId；其他 owner 的私人聊天仍完全不可见。目录 availability 在无授权群时为 owner_authorization_required，在当前用户有共同 joined 群时可显示模型配置状态，但实际调用每次检查指定群 joined。被邀请的个人 agent 必须由 owner 独立接受；授权只在此 group 生效，问答只读取该群和请求者有权使用的 context，不读取 owner 私聊/私人工具。human 和 personal_agent 的邀请分别确认。0.10.0 曾允许 owner 仅授权 agent 加入而 human 未加入时查看群；1.1.0 取消该浏览器历史 grant，owner 仅能管理自己的 agent 邀请授权，真人须单独 joined 后才可查看群历史/状态或发送；run_task 仍只允许 lab_public 文本能力。

## 可执行类型与前端接线

完整 TypeScript/Zod 定义在 [chat.ts](../../packages/contracts/src/chat.ts)，从 contracts 包根导出；合并路由在 [routes.ts](../../packages/contracts/src/routes.ts)。前端使用 `RequestFor<'sendChatMessage'>`、`ResponseFor<'chatMessages'>` 等已有泛型。全部路由精确请求和响应、必填项、枚举、上限与合成样例在 [openapi.json](../../packages/contracts/openapi.json) 和 [examples.json](../../packages/contracts/examples.json)。样例只用于契约验证，不得作为运行时回复或成功证据。

```ts
import { Contact, Conversation, ChatMessage, ChatAction, AgentTurn,
  SendChatMessage, routes } from '@research-agent-platform/contracts'
import type { RequestFor, ResponseFor } from '@research-agent-platform/contracts'
type Send = RequestFor<'sendChatMessage'>
type Sent = ResponseFor<'sendChatMessage'>
// Schema 同名类型可用于身份、会话、消息、动作和后台模型状态。
```

Contact 的 `identity.kind` 是 human / personal_agent / public_agent；分别包含 memberId / ownerMemberId / ownerMemberId+PublicCapabilityRef。`id` 是稳定联系人 ID，不是名字。真人 availability 表示服务连接可用性，不表示空闲或已经承诺；成员可用时间仍读既有 Member。Agent availability 使用 available/unavailable/disabled 与明确原因，available 只是配置，不证明模型调用成功。目录呈现同实验室真人、注册成员个人 agent 和已配置公共能力。其他个人 agent 仅公开身份与归属，必须由 owner 接受指定群邀请后才能在该群问答；不开放私人能力托管。

Conversation 包含 personal/direct/group、ownerMemberId、version、成员、关联 taskIds、lastSequence、时间和当前 allowedActions，以及当前真人用户的 viewerState。成员是 invited/joined/declined/revoked；pending 不授予群消息权限。通讯录归属不授予私人历史权限。私人助理只允许本人读取，实验室管理者没有越权入口。Direct 仅同实验室真人双方，标题按当前用户投影为对端 displayName，个人 agent 入口归一到本人固定私聊，公共 agent 本批在群内工作。

ChatMessage 是服务分配 ID、单会话递增 sequence、服务推导 senderContactId、human/model/service origin、可空 text、mentions、resources、actionIds、turnId、createdAt。没有客户端 sender、status、actor 参数。Mention start/end 是 text 的 UTF-16 半开区间，必须有序、不重叠且联系人唯一；服务校验范围内确为选中联系人的显示文本、当前联系人版本与群内 joined 状态，名字不能作为身份。群里邀请联系人通过动作确认完成，不能 @未加入对象直接派发。

ChatResource `{kind,ref:{id,version}}` 只引用 plan/task/assignment/run/deliverable/artifact；引用不增加权限。渲染与轮询重查权威对象，模型说完成不能改变任务。服务事实消息只放授权资源链接和通用状态，不复制交付正文、私人方案或附件。已撤权引用从消息 resources 投影中移除，相关自动生成正文与动作也需隐藏；人已经合法看过的手写文字不承诺追溯删除。taskIds 是关联目录，不是新任务权限。

## 路由输入输出

共同前缀 `/api/v1`。GET body 为 null；POST 带 Idempotency-Key、Origin 和 X-CSRF-Token，session cookie 沿用当前实现。`data<T>` 是 `{data:T}`，`page<T>` 是已有 `{data:T[],nextCursor:string|null}`。表中 `id` 均为 URL params，非请求体。

| RouteName / 方法与路径 | 输入 | 成功输出 |
| --- | --- | --- |
| chatContacts GET /chat/contacts | cursor?, limit=30, search? | 200 page Contact |
| personalConversation POST /chat/personal-conversation | {} | 200 data {conversation,agent}，确保唯一 |
| chatConversations GET /chat/conversations | cursor?, limit | 200 page Conversation |
| chatConversation GET /chat/conversations/{id} | 无 | 200 data Conversation |
| markChatRead POST /chat/conversations/{id}/read | {throughSequence} | 200 data ConversationViewerState |
| updateChatPreferences POST /chat/conversations/{id}/preferences | {expectedVersion,pinned} | 200 data ConversationViewerState |
| createDirectConversation POST /chat/direct-conversations | {contactId} | 200 data Conversation，确保唯一人对 |
| chatMessages GET /chat/conversations/{id}/messages | cursor?, limit, afterSequence? | 200 page ChatMessage |
| sendChatMessage POST /chat/conversations/{id}/messages | SendChatMessage | 201 data {message,turn:null或AgentTurn} |
| chatTurn GET /chat/turns/{id} | 无 | 200 data AgentTurn |
| cancelChatTurn POST /chat/turns/{id}/cancel | {expectedVersion} | 200 data AgentTurn |
| retryChatTurn POST /chat/turns/{id}/retry | {expectedVersion,budget} | 202 data 新 AgentTurn |
| chatActions GET /chat/conversations/{id}/actions | cursor?, limit | 200 page ChatAction |
| decideChatAction POST /chat/actions/{id}/decision | {expectedVersion,expectedConversationVersion,decision:confirm或dismiss} | 200 data {action,conversationId,resources} |
| chatInvitations GET /chat/invitations | cursor?, limit | 200 page {id,conversationId,title,invitedContactId,invitedByMemberId,status,version} |
| decideChatInvitation POST /chat/invitations/{id}/decision | {expectedVersion,decision:accept或decline} | 200 data ConversationMember |
| revokeChatMember POST /chat/conversations/{id}/members/{contactId}/revoke | {expectedVersion,expectedConversationVersion,reason} | 200 data ConversationMember |

SendChatMessage 为 `{text,mentions:[],intent:'chat'|'ask_agent',agentContactId:null,budget:null,context:[]}`。ask_agent 必须指定 joined agent 和 Budget；普通 chat 禁止 agent/budget。本人助理默认聊天发送由前端显式设为 ask_agent。群内 @ 后前端显式选择问助理/布置任务，@本身没有执行副作用；agent 不能以普通消息触发其他 agent。每个请求最多一个 turn，排队必须限额，拒绝无限自循环。context 只接收版本引用，服务检查是否属于当前会话授权范围；私人 plan 只允许其 owner 私聊传入，群消息不得挂私人 plan 引用。

## 持久化、分页与版本

每个用户唯一 personal agent 和 personal conversation，有数据库唯一约束；并发确保也返回同一对象。真人 direct 按 labId 和排序后的成员对唯一。ChatMessage 不编辑，sequence 在同一事务中递增，消息提交和 turn/outbox 入队原子；缺配置仍提交消息和 unavailable turn，不制造 model 消息。普通 chat 返回 turn:null。数据库写失败则整体失败，不宣称消息已保存。

limit 为 1—100，默认 30。通讯录按 displayName/id；会话本人 personal 永远第一，再本人 pinned，再 updatedAt/id 降序；动作和邀请按 createdAt/id 降序；消息按 sequence 升序。消息首次 GET 无 cursor 从最早消息开始，afterSequence 用于增量。cursor 与 afterSequence 互斥，返回 `VALIDATION_ERROR`。cursor 是签名 opaque token，绑定 actor/lab/filter/order/会话、高水位和 15 分钟有效期；下页只取初页高水位内数据，更新消息从新的 afterSequence 查询。会话高水位绑定排序键快照；列表重新读取可发现新会话。ACL 在 count/page 前过滤，每页实时复查，撤权立即生效；过期或查询不匹配 cursor 返回 CURSOR_EXPIRED。前端不解析 cursor。

Conversation.version 用于成员/目标/关联变化，不因普通新消息递增；lastSequence 独立递增。AgentTurn、成员、邀请和 ChatAction 各自 version；动作 payload 不可修改，新建议产生新 action ID。expectedConversationVersion 检查 action 来源会话；create_group 在私人来源会话内确认，回执 conversationId 是新群。确认前必须展示完整 payload（成员、Plan、目标、选中分享片段、文件版本、预算）。更改方案或分享范围需先重新向助理提出需求，旧建议标 stale。create_group 只引用本人 draft Plan，确认时锁定精确版本，复用 confirmPlan 产生 Task 与 Assignment；群中不公开完整私人 Plan，只公布任务授权投影。模型不能创建 receipt。

Idempotency-Key 16—128 位 A-Za-z0-9_-，所有 POST 必填；作用域为 actor+operation+resource+key，canonical body hash，跨会话不同资源独立。相同 key/body 返回首次状态码/结果，body 不同 409 IDEMPOTENCY_CONFLICT；重试先 reauthorize 再返回回执，失去权限不返回旧私密正文。消息/turn、动作确认/群/任务/邀请/outbox 和回执必须在同一 SQLite 事务内提交。不能用多个独立 HTTP 调用拼装建群原子性。保留回执至少与对应资源同生命周期；成功建群重复点击不再确认方案、邀请或执行。失败校验不产生业务副作用，客户端刷新版本后用新 key。

## 异步模型与受控动作

AgentTurn 状态 queued → running → succeeded/waiting_input/failed/interrupted/cancelled；缺配置直接 unavailable。succeeded 表示通过校验的回复保存成功，不表示业务交付完成。outputMessageId 仅在真实模型回复写入后存在。failure 是公开枚举，不含 provider 文本、密钥或堆栈；usage 未知值必须保留 null。waiting_input 可以有真实澄清回复；用户新发送产生新 turn，不把旧 turn 偷改为成功。群 turn 仅原始请求者可读/取消，成功回复经群授权投影共享。轮询 GET turn、actions 与 messages；无 SSE 依赖，可离开浏览器后继续。

重试只允许 unavailable/failed/interrupted/cancelled，经本人明确确认产生新 turn，新旧 inputMessageId 相同，保留原状态与全部尝试用量；未知用量不能自动重试，也不能清空累计预算。cancel/撤权/任务取消/输入版本变化/租约失效递增 fence，迟到结果不能写消息、草案或动作。模型缺配置不是实现错误；配置可用也不意味着调用验收。失败保持用户历史；恢复配置后可明确重试。

模型普通问答协议必须新增：受限 JSON 输出 answer、需要用户补充的问题、可空 PlanInput 和受限行动意图；服务使用 Zod 验证，按当前授权联系人/任务解析引用，创建真实草案和 ChatAction，再保存 model 消息。模型上下文仅包含本人/群授权消息的有界窗口、当前指定引用、通讯录公开投影和公共能力。资料和历史文本是不可信数据，不能变成工具指令。普通问答必须真实调用模型，不能复用 ai.ts 的关键词/显式 facts 路径生成个人 agent 回复。现有 facts 仅作为明确标记 service 的最新业务投影。模型不得直接访问 DB、cookie、私有文件或操作接口。

ChatAction.payload 的四种严格联合如下，完整 Zod 见 chat.ts：

- create_group：title、plan:ObjectRef、contactIds、sharedContext:{selectedText:null或Text,artifactRefs:ObjectRef[]}。确认建群只拷贝人工确认片段，不复制私人会话历史。只能分享本人具有分享权限的任务文件；不能把其他 owner 材料转授权。artifact 继续使用既有对象，群不生成私有文件复制。无授权文件时必须空数组。
- invite_contact：contactId。群 owner 邀请同实验室真人或个人 agent；其他个人 agent 需 owner 独立授权后才在指定群参与受限问答。个人 agent 原始记忆不进入群。公共 agent 可按可用能力加入，join 也不执行。
- invite_task：contactId、task:ObjectRef、scope、Schedule。复用既有 invite 命令；目标必须群内 joined 真人。任命范围和日期在确认卡中明确；Assignment.pending 不冒充 accepted。邀请用户进群与任务承接是两个独立同意，接受群邀请不能接受任务。既有 invitationDecision 完成任务接受。
- run_task：contactId、task:ObjectRef、capability:PublicCapabilityRef、budget、inputArtifactRefs。必须群内 joined 公共 agent，匹配能力版本且确认者是当前 task lead；复用 run 的权限、依赖、输入和预算规则。输入为空沿用 waiting_input；不能依据模型“已执行”生成成功回执。

动作确认 allowedDecisions 由服务实时计算，不能信任模型或前端。确认 invite_task/run_task 还需当前 task.version 和 capability.version；create_group 检查 plan.version。过期/资源变化返回 VERSION_CONFLICT 或 INVALID_STATE，不偷偷重生成执行请求。模型 actionIds 不能直接当 URL 调用。

公共执行沿用 getRun/cancelRun/retryRun/submitCandidate：succeeded 仅候选成果，lead 明确 submit 后产生 Deliverable，reviewer 指定版本验收才 Task.completed。群里通过资源链接展示这些真实状态，不新增 chatExecution/chatDeliverable 权威对象。人工任务仍用既有 start/submit/review；协调变更和撤权调用既有服务。群撤权只收回群材料和 turn；已接受任务承诺不能静默取消，task 权限仍独立，发起人需走既有撤权/转交规则。任何 run_task 都要求群权限和任务权限同时满足。

## 错误与权限边界

沿用 `{error:{code,message,requestId}}` 与 errorStatus，不新增含敏感解释的字段。401 UNAUTHENTICATED；404 NOT_FOUND 用于不可见会话/turn/邀请/动作/跨 lab 联系人；403 FORBIDDEN 用于已知可见资源的禁止命令、CSRF/Origin 不满足；400 VALIDATION_ERROR 用于范围、参数、mention/上下文错误；409 VERSION_CONFLICT、IDEMPOTENCY_CONFLICT、INVALID_STATE、DEPENDENCY_BLOCKED、ALREADY_CLAIMED；410 CURSOR_EXPIRED；413 PAYLOAD_TOO_LARGE；429 RATE_LIMITED；503 SERVICE_UNAVAILABLE、CAPABILITY_UNAVAILABLE、MODEL_UNAVAILABLE；500 INTERNAL_ERROR；接口里程碑 501 NOT_IMPLEMENTED。MODEL_UNAVAILABLE 对既有 run 仍是 503；聊天发送的缺模型状态在已持久化响应 turn 中表达，避免客户端误判消息未发送。

读取会话和消息只允许 joined 真人成员且实验室成员资格有效，管理身份不能越权。群读取消息仍复查附件、交付及 task 权限；私聊来源的群建议本身只有本人可读，群只看到确认后选定范围。权限失效取消排队和运行工作，撤销成员后不能查询群页、旧 cursor 或幂等私密回执。所有注册、模型设置、密码和现有任务边界沿用基线。

## 接口阶段复用调查（实施结果见后端报告）

已核查 [ai.ts](../../apps/api/src/ai.ts)、[execution-worker.ts](../../apps/api/src/execution-worker.ts)、[lab-ai-settings.ts](../../apps/api/src/lab-ai-settings.ts)、[collaboration.ts](../../apps/api/src/collaboration.ts)、[server.ts](../../apps/api/src/server.ts)。现有 AiService 提供能力 text-evidence-checklist、授权输入检查、真实 RunRecord、幂等交易；ExecutionWorker 支持 execution_jobs/attempts、租约、fence、reconcile、实验室加密配置、callHarness 受限子进程。规划分支仅解析 draft/progress/find_work，不支持普通问答。

必须新增：迁移 012 的 agent/contact 映射、conversation/member/invitation、message/sequence、action/receipt、agent turn 和持久派发；聊天室 ACL 与消息投影；JSON 问答/群建议校验器；CHAT1 worker 分支、恢复与 fence；服务事务内调用既有确认/邀请/run 的适配，避免嵌套重复事务。execution_jobs 当前 kind/schema 只处理 planning/capability，不能只改 kind 字符串就复用；应扩展明确第三种 chat 工作并同步 reconcile/读取/attempt 逻辑，或以同等持久租约机制承载独立 chat_turn 表。共同总控审阅后确定实现方案。保持既有 Harness 固定版本，不新增全工具运行时。

待实现验证：账号隔离、真实 DB 持久消息、多会话、并发确保和去重、无配置消息保留、合成 ModelCall 普通问答与建群草案、事务建群/邀请/派发、真人接受前等待、授权公共能力候选与交付验收、成员撤权、取消/重启/迟到输出、幂等回执重查权限和 cursor。合成 ModelCall 只证明服务链路；真实 DeepSeek 闭环仍待显式受控专项，不能在此任务读取真实 Key 或调用收费模型。

## 第一接口里程碑历史检查（服务实现结果见后端报告）

- `pnpm install --frozen-lockfile`：通过。最初受限网络 EACCES，随后获准安装 pinned 依赖；未新增依赖或更改 lockfile。
- `pnpm --filter @research-agent-platform/contracts build` 与 `pnpm contracts:export`：通过；已提交更新 OpenAPI 和 examples。
- `pnpm run ci`：内容、运维脚本、全部构建、全部类型和契约导出检查通过；测试 302 通过、1 失败。唯一失败是 `apps/web/tests/contracts.spec.ts:25` 固定断言契约 0.9.1；总控/前端须同步到 0.10.0。没有修改 apps/web。根 CI 因此未整体通过。
- `pnpm test packages/contracts/tests`：2 文件、123 测试通过，包括 15 个新路由请求响应样例和 4 个 dispatch/sharing 边界测试。
- 根 CI 提前停止后的 `node scripts/check-b0-process.mjs`、`pnpm --filter @research-agent/web check:production`：分别通过真实进程 smoke 和生产禁止 fixtures 检查。
- `pnpm check:content`、`git diff --check`：通过。首次 `pnpm exec vitest ...` 在本环境找不到可执行项，改用仓库 test 脚本后通过。

全部模型测试为既有无真实凭据边界/合成调用；没有读取真实资料/Key、收费模型调用、部署或合并 main。后续阻碍是 CHAT1 服务/worker/迁移尚未实施、前端版本断言待总控同步、真实模型闭环未验收。停止在契约里程碑，等待总控明确启动后续实现。
