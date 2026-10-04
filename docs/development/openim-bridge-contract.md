# OpenIM 科研桥接接口

共享契约 **0.13.0**，bridge **1.0.0**，migration **015**。现有聊天/任务协议保持原语义。客户端来自 OpenIM React/Electron `62d7ca7`，WASM SDK `3.8.3-patch.15.1`，服务端使用 3.8.3 系列（本轮官方 Docker image `v3.8.3-patch.15`）。接口 schema 在 `packages/contracts/src/openim.ts`，导出包含 OpenAPI/合成 examples。

## 客户端调用

所有 API 仍用 `rap_session` HttpOnly cookie；POST 带 APP_ORIGIN、`X-CSRF-Token`。新增接口不缓存 IM token，没有 Idempotency-Key。管理 secret/admin token 永不返回客户端；Agent 无登录 token。Electron 加载获准同源入口，不能因 file origin 放宽原鉴权。

| RouteName | 请求 | 结果 |
| --- | --- | --- |
| imSession | POST `/api/v1/im/session` `{platformID:3或5}` | `data:{bridgeVersion,status,reason,configuration,user,coordinator}`。configuration 含 apiAddr/wsAddr/serverVersion/sdkVersion；user 含 userID/imToken/platformID/expiresAt。未配置或真实服务失败返回 unavailable，user 为 null。 |
| imContacts | GET `/api/v1/im/contacts` | `data:{contacts:[{contact:既有Contact,userID,transportStatus}],truncated}`；同实验室身份映射，不授好友或任务权。 |
| imConversations | GET `/api/v1/im/conversations?imConversationID=可选SDK会话ID` | `data:{conversations:[mapping],truncated}`；仅当前实际真人joined且有关系授权的科研会话。 |
| imSync | POST `/api/v1/im/sync` `{}` | `data:{status,reason,contactsSynced,conversations,truncated}`；同步本人实际已同意关系与可读群。 |
| imSyncConversation | POST `/api/v1/im/conversations/{科研id}/sync` `{}` | `data:mapping`。成员由科研 joined 投影，不接受客户端提交memberIDs。 |

Mapping 是 `{researchConversationId,imConversationID,kind,peerUserID,groupID,pinned,transportStatus,reason}`。kind 为 personal/direct/group；peerUserID 与 groupID 按会话种类返回或 null。稳定 IM userID/groupID 由后端按 lab/contact/conversation 分配；单聊 `si_排序两个userID`，群 `sg_groupID`。固定协调 Agent personal mapping 返回 pinned true；本人 coordinator 的 direct 复用 personal。

先调用现有 personalConversation/createDirectConversation/create_group/decideChatInvitation 创建或接受科研对象，再调用 imSyncConversation 或 imSync。仅 `transportStatus=ready` 才表示实际远端同步通过；pending/unavailable 不能显示已经接通。

## 消息与科研事实

普通文字、文件和录音发送继续调用真实 OpenIM SDK。普通 @ 不创建 turn 或任务；媒体文件不自动导入科研 Artifact 或模型上下文。显式向 Agent 提需求/群内请求 AI 时只调用既有 sendChatMessage，客户端不双写 SDK 普通文字。

科研 sendChatMessage 以及 worker 的 model/service 消息经持久 outbox 投递 OpenIM custom pointer。customElem.data 是 JSON：

```json
{"type":"research_message","bridgeVersion":"1.0.0","conversationId":"科研会话ID","messageId":"科研消息ID","sequence":1}
```

它只定位消息。客户端必须经现有 chatMessages（按 sequence 定位）和任务/Action 接口重新读取当前获准正文、resource refs、建议、候选和验收状态。不可直接以 custom 内容渲染权威事实，也不把可能包含私有上下文的模型答案永久复制到 IM 群历史。科研资源不会由 IM 入群或成为好友自动授权。

普通 OpenIM text 回调可镜像为科研聊天的普通消息，去重且不触发 AI；服务器 pointer 不再次镜像。历史迁移不把旧私人消息自动广播。OpenIM 自身消息历史/文件是 IM transport；task/assignment/artifact/run/delivery/review、Agent记忆和受控聊天是科研 API。

## 服务端配置

`OPENIM_API_URL` 后端管理地址，`OPENIM_PUBLIC_API_URL` 和 `OPENIM_PUBLIC_WS_URL` 客户端地址，`OPENIM_ADMIN_ID` 管理者ID，`OPENIM_SECRET_FILE` 绝对路径管理secret，`OPENIM_CALLBACK_KEY_FILE` 绝对路径独立随机64hex key，`OPENIM_POLICY_ENFORCED=1` 仅在强制before callbacks正确配置后启用。未配置任一必须项返回真实 unavailable。OpenIM Chat Server 不需要部署，手机号登录/业务profile由科研API替代。

回调基址 `/api/v1/im/callback/<独立key>`，OpenIM 将具体 callbackCommand 追加到路径。管理网络和回调应由受信服务访问；浏览器仅获取本人user token。同步网络调用安排在 SQLite transaction 之外，并在返回前重新核验当前 session/ACL；失败可重试，不伪造远端成功。回调及 outbox 实施配置详见后端交接报告。

## 手动群组操作（无模型依赖）

- `imCreateGroup` POST `/api/v1/im/groups`，body 为 `{title,contactIds,sharedContext:{selectedText,artifactRefs},plan:null或{id,version}}`，返回 `data:Conversation`。contactIds 为1至20个。null plan 创建讨论群，不产生任务；非null计划按原受控建群规则版本确认。选择的资料按当前权限检查。
- `imInviteContact` POST `/api/v1/im/conversations/{科研id}/invite`，body 为 `{contactId,expectedConversationVersion}`，返回 `data:Conversation`。仅科研群负责人操作。真人和私有AI产生独立邀请，接受联系人、接受入群和承接任务继续分开。

这两个命令必须提供 `Idempotency-Key`，并沿用Origin/CSRF保护与授权后幂等回执；完成后另调用 `imSyncConversation`。模型关闭也可以使用。OpenIM群主固定为服务器 `OPENIM_ADMIN_ID`，所有科研joined联系人为普通成员；科研负责人通过RAP接口管理成员，不获得原生群主或管理员权限。
