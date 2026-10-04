# 联系人档案、关系和记忆接口 · 0.12.0

2026-10-04，契约 0.12.0、聊天协议 1.2.0，30 条 CHAT1 路由。此提交先冻结接口；服务与迁移 014 的实施结果另行报告。共同起点 `89716a0b53d465264d02eba83f38320560177685`。原业务任务、入群、材料权限与执行保持独立。

## 联系人投影

Contact 保留 id、identity、availability 和 version；新增：

- `profile: {role, introduction, capabilityDescription, personality, version}`。role 为 human / coordinator / specialist / public_capability，服务固定，不可编辑。每个真人只有一个 coordinator，既有唯一 personal agent 升级为该角色。新专属 agent 身份仍为 personal_agent，role=specialist。能力描述和性格只是公开用户设定，不表示已验证可执行能力。profile.version 用于更新档案。
- `relationship: {status, requestId, version}`，status 为 own / none / pending_outbound / pending_inbound / accepted / declined / revoked。own 代表本人真人或本人负责 Agent；不生成请求，requestId=null、version=0。其他关系 version 跟踪 ContactRequest。
- `allowedActions` 为 chat / request / remove / edit_profile / manage_private_memory 的当前允许子集。真人本人可编辑；Agent owner 可编辑并管理私有记忆；公共 Agent 由当前实验室负责人维护。chat 仅 accepted 或本人 Agent。公共可直接添加，私人 Agent 要 owner 同意。

目录不包含任何私有记忆、其他人对话或工具正文。`chatContacts` 新增 view=directory（默认）或 mine；mine 显示本人 Agent 与已接受关系，search 搜索公开名字/介绍/能力描述。当前 availability 仍是配置可用性，不是虚构在线状态。

## 路由

共同前缀 /api/v1，GET 返回原 page，POST 沿用 session、Origin、CSRF、Idempotency-Key。详细严格 Schema、上限和样例在 contracts/chat.ts 与导出 OpenAPI。

| RouteName | 方法与路径 | 请求体 / 查询 | 响应 data |
| --- | --- | --- | --- |
| chatContact | GET /chat/contacts/{id} | 无 | Contact |
| updateContactProfile | POST /chat/contacts/{id}/profile | expectedVersion, displayName, introduction, capabilityDescription, personality | Contact |
| createPersonalAgent | POST /chat/agents | displayName, introduction, capabilityDescription, personality | Contact，201 |
| requestContact | POST /chat/contacts/{id}/relationship | {} | Contact |
| contactRequests | GET /chat/contact-requests | pagination, direction=all/incoming/outgoing, status=pending/all | page ContactRequest |
| decideContactRequest | POST /chat/contact-requests/{id}/decision | expectedVersion, decision=accept/decline | ContactRequest |
| revokeContact | POST /chat/contacts/{id}/relationship/revoke | expectedVersion | Contact |
| revokeContactRequest | POST /chat/contact-requests/{id}/revoke | expectedVersion | ContactRequest |
| chatMemories | GET /chat/memories | pagination, scope=private_agent/conversation, scopeId | page ChatMemory，active |
| createChatMemory | POST /chat/memories | scope, scopeId, content, source:string/null | ChatMemory，201 |
| reviseChatMemory | POST /chat/memories/{id}/revisions | expectedVersion, content, source:string/null | ChatMemory |
| revokeChatMemory | POST /chat/memories/{id}/revoke | expectedVersion | ChatMemory |
| chatMemoryHistory | GET /chat/memories/{id}/history | 无 | {memory, revisions} |

ContactRequest 为 id、requesterMemberId、requesterContactId、targetContactId、deciderMemberId、status(pending/accepted/declined/revoked)、version、createdAt、updatedAt、allowedDecisions(accept/decline)。真人请求由目标本人接受；私人 Agent 由 owner 接受。人类 accepted 关系双向；Agent 关系只属于 requester，owner 不进入 requester-agent 私聊。撤销可以由 requester/decider 发起，不删除审计，不能静默退出既有群或任务。

createDirectConversation 继续 `{contactId}`：本人 coordinator 返回唯一 personal 会话；本人 specialist 或 accepted Agent 返回唯一 requester-agent direct；accepted 真人返回唯一双人 direct。所有新真人关系也必须请求并接受，旧 013 数据库已存在的真人 direct 在 014 回填 accepted，历史保留。拒绝/撤销关系后既有 direct 不再可读/发送，旧 cursor/回执实时重新授权；重新接受后同一会话可恢复，不能产生私人 owner 内容分享。

## 记忆与模型上下文

ChatMemory 为 id、scope、scopeId、content、source、status(active/revoked)、version、createdByMemberId、createdAt、updatedAt、allowedActions(edit/revoke)。内容最多 2000 字符、来源说明最多 1000，每 scope 最多 10 条 active，每条最多 100 个保存版本。新增/修订保存不可变历史；移除为软撤销，历史仍需当前相同 ACL。

private_agent scopeId=Agent contact ID，仅 owner 可读写，包括 owner 的协调 Agent 和专属 Agent；其他成员添加/私聊不授予读取。conversation scopeId=会话 ID，joined 真人可读，当前会话 owner 可维护；Conversation.allowedActions 新增 manage_memory 提供按钮依据。仅接受自己的 Agent 入群仍无真人浏览器群权限。

worker 实际提供 requestedAgent 的稳定公开 profile、角色、性格和能力描述；只有 owner 在本人 personal/owned specialist direct 内才注入该 Agent 的 private_agent 记忆。所有其他成员私聊及 group 只注入当前 conversation 的共同记忆，不注入 owner 私有内容。历史窗口截断与持续记忆分开。档案/获准记忆变更以及关系撤销会 fence 未完成旧 turn，真实状态显示 cancelled + INPUT_CHANGED/AUTHORITY_CHANGED；使用量仍保留。用户保存才生成记忆，不宣称自动学习。

只有 coordinator 在其唯一 personal 会话可建议 create_group；其他角色以自身 profile 响应，可按既有权限提出 group 内受控动作，不伪装全局需求协调入口。Coordinator 匹配依据公开联系人档案、既有任务和实际能力；human 建群邀请、Agent owner 独立入群许可与任务承接仍分别确认。

## 前端流程与版本

前端通过 allowedActions 显示操作；编辑档案使用 profile.version，关系使用 relationship.version / request.version，记忆使用 memory.version。表单失败保留内容，确切重试复用 key；版本冲突刷新后让用户确认新提交。my contacts 只显示已接受/本人，pending 可在发现和请求页找回。请求接受后针对 human/Agent 的 direct 可进入；仅接受 Agent 群邀请仍停留邀请入口。默认协调会话继续 personalConversation API、永远第一；行标题显示真实 Agent 名并附“需求与协作”。

旧 fixtures 结构通过 Schema 默认新增字段兼容；实际 API 始终提供服务端角色、关系与权限投影。默认字段不作为运行时业务事实，不把 profile/relationship 或个人 viewerState 写入共享 Conversation document。
