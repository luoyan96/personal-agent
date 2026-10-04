# 人与 Agent 联系人、档案和记忆：后端实施

2026-10-04，基线 `89716a0b53d465264d02eba83f38320560177685`。独立分支 feature/agent-contacts-backend；接口提交 `04bf9e6527fc9e626bebf4d343538a6a981e17c2`，服务提交 `1c6be84ab0cb6a94fe8756c5e4bf8e3dad4f515d`。契约 **0.12.0**、聊天协议 **1.2.0**、迁移 **014**。接线见[接口说明](agent-contacts-contract.md)。

## 实际实现

- 统一 Contact 公开 profile、actor 关系和 allowedActions；本人真人资料编辑同步 members.display_name/version。拥有的 Agent 可编辑公开介绍、角色性格和能力描述；公共 Agent 由当前实验室负责人维护。角色/负责人不由请求体修改，介绍不授予工具执行权。
- 新增本人 specialist Agent，稳定 ID；协调 Agent 仍是 principal=owner_id 的唯一既有 personal agent。发现与我的联系人区分，添加真人须本人接受，私人 Agent 须 owner 接受，已发布公共 Agent 可直接添加。
- 013 已存在真人 direct 回填 accepted 双向关系；所有新增真人 pair 严格 request/accept。关系与入群/任务权利独立；其他人不能通过添加私人 Agent 读 owner 记忆、owner 私聊或群历史。
- private/public Agent 可在 requester 专属 direct 响应：owner 不自动进入别人的 Agent direct。撤销联系后该 direct 的会话、消息、旧 cursor 和幂等消息回执失去权限，排队/运行 turn fence。
- 记忆为用户明确保存、版本化持久记录，scope=private_agent/conversation，每 scope 至多 10 active，每条至多 100 revision；软撤销保留审计。私有记忆仅 personal Agent owner 可读写；共同记忆仅 joined 真人可读、会话 owner 可维护。
- ChatWorker 实际注入 requestedAgent 公开角色/性格/能力描述以及获准记忆。只有 owner 在该 Agent 的 personal/owned direct 内获得 private_agent 记忆；其他人私聊与群仅获得该特定 conversation 记忆。持续记忆与 20 条聊天窗口分离，未实现自动学习或记忆自动提取。
- 模型联系人材料去掉 relationship、requestId 和管理 allowedActions，只传公开档案/身份/配置可用性。系统说明这些为用户设定数据，不覆盖权限。只有唯一 coordinator 的 personal 对话可创建群建议；其他 Agent 保持自身角色，沿用受控动作与既有科研权限。
- turn 保存档案/记忆上下文指纹；协调建议还绑定有界公开联系人档案版本，候选档案变更不能发布旧匹配建议。编辑/删除记忆、档案更改或关系撤销使旧 turn 明确 cancelled+INPUT_CHANGED/AUTHORITY_CHANGED，迟到模型输出不写消息/方案/动作，实际返回 usage 仍存 attempt。
- mine 联系人、pending 请求和 active 记忆的旧分页 cursor 都实时复查授权及当前过滤条件，软撤销/接受后不会作为旧类别中的当前对象返回。

## 验证与真实边界

| 检查 | 实际结果 |
| --- | --- |
| contracts build/export | 通过，OpenAPI 与 examples 同步 0.12.0 |
| contracts focused | 138 项通过 |
| API build/typecheck | 通过 |
| 原 chat 服务回归 | 16 项全部通过，真人 direct 测试已先走真实请求/接受 |
| 加入五组新验收后的 chat focused | 20 项通过、1 失败；失败发现 personalConversation 原查询可选到任意 owned specialist，修复为 principal=owner_id 后，该测试 1 通过、20 skipped |
| 最后模型/迁移专项 | 3 项通过、18 skipped，覆盖注入范围、迟到 fence、013→014 和真实 HTTP 重启 |

新测试实际验证：Agent 创建幂等与 stable ID；真人/Agent 独立同意、错误决策人拒绝、公共直接添加；profile 乐观版本与真人名字同步；owner 与 B 的同 Agent direct 分开、owner 不读 B 私聊；私有记忆跨浏览器不可读；共同记忆 joined 可读但非 owner 不可修改；history 保留 immutable revisions；旧 active/pending/mine cursor 跳过已变更对象；聊天窗口截断后 ModelCall 捕获仍含保存记忆；B-agent direct 和 owner 发起群均排除 owner 私有记忆与其他会话记忆；模型材料无关系管理投影；queued memory 变更及 running profile 变更取消旧输出，实际 usage 12/34 仍保留；owner 撤销 B 添加关系后 direct/旧消息回执 404；014 重复迁移、013 原真人消息和置顶不改、关系双向回填；真实 HTTP 服务关闭/重开后档案与记忆恢复。

本轮按总控安排只做 focused，最终完整 CI、独立 HTTP 与浏览器验收在集成目录由总控运行，不将单窗口测试当作最终共同通过。本报告准确保留第一次失败与修复过程，不宣称有一轮全 21 项通过的独立测试。迁移计数断言同步 014，未修改旧 SQL checksum、锁文件或前端。

模型验收全部使用显式合成 ModelCall，证明真实服务输入/事务/权限/持久化链路，未新验收真实 DeepSeek 网络调用。无真实凭据/资料读取、部署或 GitHub push；OpenIM Server/SDK 未接入。仍不托管私人工具、自动学习、跨实验室联系人或公开 AI 市场。前端使用真实 allowedActions，保留版本冲突、缺模型配置及取消状态。
