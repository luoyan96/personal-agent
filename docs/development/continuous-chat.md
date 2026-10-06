# 连续 Agent 私聊

2026-10-06用户确认微信式连续交流、自然语气、可以连发补充、逐步显示回复，并在回答期间调整方向。实现提交1eb9f8d从附件回执修复0bb8562开始；最终固定源码 `2e696881583842eb0e251d222083bccd925524fe` 已于18:16:59北京时间上线客户端、API及worker，contract0.19 / chat1.8 / schema18无迁移。PR3 / PR2已合并，发布标签 `personal-agent-2026-10-06.2` 指向部署源码。

## 本批用户流程

1. 在站内个人助理或单个Agent私聊连续发送几条文字，每条先持久保存，发送状态只等待入站确认；模型回复期间仍可发送。
2. 短时间内的补充合并理解，保存原始消息及顺序；一个合并批次只启动一次模型回复，不把未启动的废弃轮次当作已消耗调用。
3. 模型实际生成的公开回复逐步出现在聊天区；等待只显示真实状态，不用定时打字制造进度。临时回复明确区别于已验证的最终聊天记录。
4. 新补充到达后，使旧生成失效，取消旧调用并基于有效消息接续。旧调用迟到、重试、多个worker抢占或页面刷新均不得再次发表过时最终回复、创建旧角色或写计划副作用。
5. 完整回答仍经原预算、授权、记忆版本与模型输出校验，成功后由canonical消息 / OpenIM outbox投递；临时回复与最终消息去重，输入草稿及未确认发送保持。
6. 自然语气以联系人真实档案、获准偏好与当前需求为依据，默认短句、先回应重点，详细任务按需要展开，不假称真人或已经做了未做的事情。

## 范围与边界

- 本批优先站内文字私聊。结构化协调 / 创建Agent仅在完整校验后显示公开回复；不把JSON、隐藏思考、候选或执行参数直接投给聊天区。
- 真人聊天保持OpenIM原逻辑。外部Agent继续逐条明确同意，只传获准当前文字，不自动合并外传历史、记忆或文件，也不承诺远端支持打断 / 流式。
- 输入与输出预算、实际用量、请求权限、租约和fence继续服务端执行。中断的暂存文本不冒充最终成功；错误与实际计量未知明确保留。
- 已有长期偏好 / 一次性后台提醒仍保留。多独立任务的并行执行、完整性格学习、语音对话、移动原生App及任意外部服务流式不由本批宣称完成。

## 冻结接口与调度

共享契约0.19 / chat1.8，SQLite仍schema18：新增元数据保存在既有turn.request_json，不新增表。旧0.18调用省略continuous参数，沿用旧语义；新版站内agentChatMessage设置continuous:true。

- 未开始的私聊批次：1200ms滑动等待，第一条起最多4秒；每条消息立即持久保存，inputMessageIds记录合并顺序，同turn/root只有一份4000 / 90秒预算。worker在到期前可处理其他工作。
- 正在生成时的新补充：原子使旧turn失效，新有效批次开启独立默认4000 / 90秒预算。用户本次新输入授权新调用；旧调用实际usage继续记入旧attempt / ledger，未知用量保留，不当作免费回收，不作为自动重试。
- chatTurnProgress：GET `/api/v1/chat/turns/{id}/progress`，重新检查conversation ACL及original owner。data包含turnId、conversationId、inputMessageIds、revision、phase、text、finalMessageId、supersededByTurnId和updatedAt；phase为queued / streaming / final / superseded / stopped。
- text只表示实际模型生成的暂存公开回复，不能以其替代最终校验。前端当前页活跃时约500ms读取；尚未由SDK确认的final每5秒重新受权读取，回到当前页也重新校验，superseded / stopped停止。最终消息仍canonical/outbox，按finalMessageId与SDK pointer去重。waiting_input已有校验回复时phase为final，只表示回复完成，不表示业务或任务完成。
- 创建 / 协作结构化输出仍在最终校验后保存，不流出原始JSON / 规划字段。跨worker通过fence与短心跳终止旧调用，并在完成事务再次验证。

## 必须验证

| 场景 | 通过依据 |
| --- | --- |
| 连发三条 | 三条原始消息有序保存 / 不重发；窗口结束后一个模型批次读到全部内容 |
| 渐进输出 | 实际model delta在final之前可受权读取；不显示结构化内部字段 |
| 运行中补充 | 旧结果被fence挡住，新轮读取原话和补充；旧建联系人 / 计划动作不落库 |
| 失败 / 重试 | 入站失败保留输入，同一次重试同幂等键；状态失败不假称回复成功 |
| 刷新 / 换账号 / 会话 | 权限重新读取、迟到结果无串会话；最终SDK消息与临时回复不重复 |
| 预算 / 重启 / 多worker | 使用原预算；旧调用usage保留；同轮只有一份有效最终消息 |
| 桌面 / 窄屏 | 可持续输入与阅读，无横向溢出；待确认状态不挤占整个输入区 |

后端专项使用实际HTTP / SQLite / worker及合成模型；流式Harness链路可用本地合成SSE验证。前端使用实际React生产组件与隔离浏览器，API / SDK合成与实际HTTP必须分别注明。完整根CI与客户端类型 / Web / 四SDK资源均须通过；真实提供商质量、云IM及生产版本另行验收。

## 2026-10-06发布与恢复

本地最终完整根CI44文件 / 534项及2生产入口通过，客户端类型 / Web / 四SDK资源通过。后端实际Harness / CLI接本地合成SSE、总控最新dist实际HTTP / SQLite四项及实际React生产路由的必要场景分阶段闭合。完整索引在Git外 `.runtime/continuous-chat-20261006/{backend-review.json,root-ci-final.log,http-b302661a/report.json,frontend/summary.json}`，首轮旧接口数量断言和所有原fixture失败保持；不要将合成ModelCall / SDK当真实厂商 / IM。

用户明确授权后已按API / worker先升0.19、再启用同版客户端的顺序发布。停写一致备份 `/srv/research-openim-backups/20261006T101640Z`，78表SQL及全部行hash保持，无迁移。Windows24、Ubuntu22.19 / 24同一源码CI通过；最初Linux测试私钥0644触发生产守卫，2e69688仅修正测试写入为0600及成功断言，守卫不变。实际镜像 / 首页 / 恢复组合见[ECS记录](../deployment/openim-ecs.md)。

真实验收使用既有已登录用户个人助理与合成文字，沿用已有模型配置，没有新建隔离账号、读取或修改Key / 密码。两条快速输入合并一次真实调用；生成中补充使旧轮失效、保留未知用量，新轮成功；final前实际出现公开增量“ M”，最终revision9、OpenIM sent，刷新仅1份回复 / 临时气泡0。800字及250字长文预算失败保留，后续短请求成功，4000 / 90秒不变。Git外证据 `D:/deepseek-agent/.runtime/continuous-chat-release-20261006` 包含部署 / 公网 / CI、实际turn计量、流式AX、刷新及截图；原selector中止与三次准备失败未删除。完整Muse并行、实时语音、原生App、云完整恢复演练仍未验收。
