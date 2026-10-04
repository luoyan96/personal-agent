# OpenIM 采用批次：科研微信后端完善

2026-10-04，本地开发基线 `52629857c069761ff8ebf78a4141dc0975425b17`。独立后端目录研究并实现科研会话日常状态；本轮后端未复制 OpenIM Server/SDK，继续当前已验收的 Node、SQLite 与固定 DeepSeek Harness 后端。UI 源码移植由前端窗口承担，其来源与验证由总控整合报告记录。

## 完成内容

- 契约 **0.11.0**、聊天协议 **1.1.0**，冻结提交 `6cbd4cebf39a44b0ca27f2d2c680876e6ccbe2c5`。新增 Conversation.viewerState 与 markChatRead/updateChatPreferences；完整接线见[会话状态接口](research-chat-viewer-state.md)。服务提交 `83d83763a57827b7e75049d102662c9321d321e0`。
- 迁移 **013-chat-viewer-state.sql**，每成员每会话持久化 read_sequence、pinned、version；不修改先前迁移 checksum。未设置的历史会话默认 readSequence=0，自己的消息不计未读，收到的历史消息按真实权限计数，不猜测已读。
- 已读采用 SQLite `max` 单调推进，多浏览器旧请求及重复幂等回执不能回退。置顶使用独立乐观版本，不影响 Conversation.version；重复老回执返回当前授权偏好，不恢复之前状态。个人助理始终第一且不可取消置顶。
- 未读实时沿用 chatMessages 的相同消息授权投影，排除本人真人消息，包含可见真人/模型/服务消息；不可见模型输出不计数，撤权立即隐藏整个会话状态。
- direct 对双方各显示当前对端的实时名字；数据库原标题保留，幂等创建回执也重新投影，不能返回旧名字/状态。
- 浏览器读取与状态更新须本人真人 joined，agent owner 单独授权 agent 加入群不再获得浏览器历史权限。agent 仍可在群内按获准上下文参加模型问答；owner 可独立接受/拒绝邀请。接受真人群邀请仍不代表任务承接。
- 所有共享会话 INSERT/UPDATE 显式剥离 viewerState，投影覆盖独立 actor state 表，防止将某一读者的偏好或计数写入共享 document。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| contracts build / export / focused tests | 通过，125 项 |
| 根 build、所有 workspace typecheck、内容与运维语法、契约导出 | 通过 |
| focused chat + foundation | 25 项通过，包括原聊天权限与 worker 回归、新四组状态验收 |
| 根 CI 测试阶段 | 332 通过、1 失败；唯一失败为原 apps/web/tests/contracts.spec.ts 固定 0.10.0，而当前为 0.11.0。未修改前端，故本 clone 根 CI 未整体通过，待前端同步后总控运行集成 CI |
| 后加 012→013 合成持久化专项 | 1 通过（15 skipped），旧聊天 document/message 不改、重复迁移不丢数据 |
| CI 后置真实进程 smoke | 通过，缺 DB=503，迁移/seed 重复，两次真实 HTTP 启动和合成成员持久化 |
| 前端生产隔离门 | 通过，禁止 fixtures 与显式 demo build |

新增验收使用真实 Fastify/HTTP 与文件 SQLite：两次独立登录模拟两个浏览器 session，同时提交 read=3/read=2，最后保持 3；旧 read 幂等回执不回退，超出 lastSequence 拒绝；退出 session 401，重新登录并重启服务器恢复 read/pin；actor A/B 状态隔离；本人助理第一、置顶排序、旧版本冲突、旧 pin 回执不能撤回新决定；对端名字改动即时投影且原标题不变；群消息自己发送不增加未读，未经 task 授权的模型回复隐藏且不计数；真人撤权后 cached read/pin 回执 404，列表无该群；仅 agent 授权的浏览器无群历史或状态权限。

依赖首次 offline install 误用了工作区 store，缺 tarball，自动重试网络遭 EACCES；总控获准用已有 `D:/.pnpm-store/v11` 安装固定 lockfile 后完成构建。未新增依赖或修改 lockfile。初次 API 独立 build 在 research-core 尚未构建时报找不到类型；根构建后消除，API typecheck 通过。上述失败不作为功能验收通过证据。

## 边界与交接

本轮未部署、未推 GitHub、未读取真实研究资料/生产 Key，也未调用收费模型。模型测试为明确注入合成 ModelCall；真实 DeepSeek 仍需独立受控验收。OpenIM Server 未部署，本轮不会声明 OpenIM SDK、多设备实时通道已经接通。

前端需使用 viewerState 显示未读和置顶，展示消息后只标记实际展示到的最大 sequence，失败/重试复用 operation key。只接受 agent 邀请后保留在邀请入口，不自动进入无真人 membership 的群。普通人群邀请接受后才进入群。集成 CI 和独立浏览器效果/流程验收由总控负责。
