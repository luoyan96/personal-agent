# 科研微信会话状态接口 · 0.11.0

2026-10-04：契约 0.11.0，聊天协议 1.1.0。此文档先冻结 API；服务实现、迁移及验收另见后端报告。

## 当前用户会话投影

所有 Conversation 响应新增 `viewerState: {readSequence, unreadCount, pinned, version}`。值由服务端按当前真人成员投影，持久化在每成员、每会话的记录中，不能写入共享会话 document。读取消息不自动标为已读。

- `readSequence` 是该用户已展示消息的最大 sequence，初始 0，更新单调推进，不能超过会话当前 `lastSequence`。
- `unreadCount` 统计 `sequence > readSequence`、当前用户有权读取的收到消息；排除自己发出的真人消息，包含有权读取的真人、模型和服务消息。不把隐藏模型消息或失去权限的会话纳入计数。
- `pinned` 是本人偏好；本人固定个人助理永远为 true。列表顺序为本人个人助理最先，然后本人 pinned 的会话，再按 updatedAt/id 降序。新一轮请求获得最新顺序，既有 cursor 继续原快照。
- `version` 仅跟踪置顶偏好，初始 1。已读推进不增加它，不影响 Conversation.version。改变置顶偏好才增加它。
- direct 会话 `title` 显示当前用户的对端真人 displayName。数据库原标题保留，当前个人投影不改权威历史。

## 两个操作

| RouteName | 路径 | 输入 | 响应 |
| --- | --- | --- | --- |
| markChatRead | POST /api/v1/chat/conversations/{id}/read | `{throughSequence: nonnegative integer}` | 200 `{data: ConversationViewerState}` |
| updateChatPreferences | POST /api/v1/chat/conversations/{id}/preferences | `{expectedVersion: positive integer, pinned: boolean}` | 200 `{data: ConversationViewerState}` |

两个 POST 沿用 session、同来源、CSRF、Idempotency-Key 与标准错误。已读无需 expectedVersion；不同浏览器的旧请求只执行 max，不能回退。相同 key/body 重试返回当前授权状态，不回退游标或置顶；同 key 不同 body 为 409 IDEMPOTENCY_CONFLICT。超出 lastSequence 为 400 VALIDATION_ERROR；旧置顶版本为 409 VERSION_CONFLICT。个人助理尝试取消置顶为 409 INVALID_STATE。

前端首次/刷新列表和打开会话使用 Conversation.viewerState。消息展示后只提交确实已展示的最大 sequence；保存中保留操作 key，确切重试复用同 key。收到新消息而尚未展示时不可标整个 lastSequence 为已读。新偏好响应更新 viewerState，按新列表排序；偏好版本冲突刷新当前会话后重新确认。

## 浏览器权限行为变更

既有 0.10.0 曾允许本人 agent 加入群后其 owner 浏览器查看该群，即使 owner 真人邀请仍未接受。本版明确拆开两种授权：agent owner 可在邀请列表独立接受/拒绝自己的 agent，agent 随后能在群内参与获准模型问答；owner 的真人浏览器须单独 joined 才能读取群会话、消息、viewerState 或更新偏好。邀请摘要不含聊天正文。

因此，仅接受 agent 邀请后前端保留在邀请/通讯录入口；仅在人类 membership 为 joined 时进入聊天。接受真人群邀请仍不接受任务承诺，群内 task 继续现有独立 ACL。被撤销或账户禁用后，列表、旧 cursor、已读/置顶幂等重试均实时重新校验，返回 404，不泄露旧正文或计数。该变更不向任何人分享本人私人助理记忆。

## 存储与真实接入边界

迁移 013 增加 per-member conversation state；旧会话游标初始 0、普通会话未置顶，不推测用户已读历史。只使用当前 Node/SQLite 科研后端。OpenIM UI 采用不代表已部署 OpenIM Server 或 SDK 消息同步已接通；不产生虚构连接和模型成功状态。
