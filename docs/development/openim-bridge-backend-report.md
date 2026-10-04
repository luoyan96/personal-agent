# OpenIM 后台实现交接

日期：2026-10-04。基线 `da2b362`，分支 `feature/openim-client-rebuild-backend`。

## 提交和验证

- 契约：`f34f20d`（0.13.0 / bridge 1.0.0）和 `b831081`（手动建群、邀请、package version）。字段及操作流程见 [冻结协议](openim-bridge-contract.md)。
- 实现：`6b22ee5`。只涉及contracts测试、API、迁移、后端测试、官方服务器小补丁；不改旧网页、完整客户端或根锁文件。
- 专项：OpenIM 11项全部通过。使用明确的合成管理API适配器；适配器实际调用Fastify回调及独立SQLite连接，未读取真实Key或科研资料。
- 兼容：chat 23项、contracts 141项及当时OpenIM 8项组合172项全部通过。随后OpenIM扩展至11项并重新通过，API build及含tests的typecheck通过，契约导出check通过。
- 新迁移015覆盖014→015真实旧库、重复迁移、已有消息保留及不回填旧私人消息outbox。旧迁移测试当前版本断言升级至15，旧chat 012/013形状重建时也去掉015对象。
- `rap-auth.patch` 对固定官方源码 `git apply --check` 通过。Go编译/测试由总控的portable Go环境完成并记录；本报告不将未运行的Go测试或真实IM服务器E2E写成成功。
- 全量CI、真实OpenIM SDK/Server及浏览器验收由总控集成执行。本机本轮没有可用Docker/WSL，真实服务器连通仍待运行环境。

## 服务和持久化

`im_identities` 为实验室联系人分配稳定IM身份，只注册所需本人、获准联系人和实际joined成员。`im_conversations`保存科研会话到SDK单聊/群映射、版本及有效成员指纹。本人协调Agent复用唯一personal会话并在SDK置顶。已停用账号和已不可发现的Agent不进入有效IM接收集合。

`im_token_leases`绑定本人平台3/5、RAP session hash和最早到期时间；issuing/ready/revoking操作状态防止并发签发/撤销相互覆盖。签新Token前真实调用`/auth/force_logout`撤掉旧平台Token。回调即时重查RAP登录、过期和停用；worker踢下线并撤销失效Token。每个平台使用一个当前IM lease，新签发会替换该平台旧SDK登录；RAP自己的浏览器会话和个人读/置顶状态仍独立持久化。

网络遵循：同步事务读取当前快照→事务外调用OpenIM→事务内重新检查session、成员、档案版本。没有SQLite事务跨越网络等待。普通SDK文字和@文字镜像为普通科研ChatMessage，不创建AgentTurn或任务。图片、文件和语音不自动变Artifact/模型上下文。

科研消息插入触发持久outbox，只发送严格的`research_message`定位载荷，不携带正文、模型答案或资源内容。worker发送前及回调再次检查原消息的当前科研投影、来源授权、真实outbox状态、预期sender和持久operationID。Agent回复的单聊接收人是该请求人的真人身份。消息正文、建议、材料、候选、交付和指定revision验收仍通过RAP重新授权读取。

afterSend回执按发送人+client/server message ID去重，同ID不同内容拒绝；普通消息标记mirrored避免再发。响应未知的发送标记uncertain，不盲重发；合法after回调可将其解析为sent。未获知结果且没有回调的uncertain记录需运营核对，不能显示已投递。远端失败的未发送记录保留pending并冷却10秒，主worker不紧循环。同步达到时间预算保留pending投影并返回truncated，可继续同步单个会话；不会用部分结果冒充全部就绪。

## 群和联系人控制

手动`imCreateGroup`/`imInviteContact`与模型建议确认共用canonical函数、版本校验和授权后幂等回执。null plan是讨论群，无模型依赖、无虚构任务；非null计划沿用原受控计划确认。用户选定的artifact refs按当前版本及发起人权限检查。真人/私有Agent先邀请后本人/主人接受，public Agent必须是实验室已发布能力。

联系人同意、AI主人同意入群、真人入群、任务承接、材料授权、执行候选、交付和验收继续独立。AI主人只授权自己的Agent加入，不因此读取群历史；IM身份/好友/群成员不授RAP资源权。

OpenIM群主固定为`OPENIM_ADMIN_ID`，科研owner及所有有效joined人/AI在IM是roleLevel20。原生客户端管理操作应调用RAP，不可直接把普通人升成群主/admin。worker按RAP有效joined集合移除失效接收人并核验远端精确成员/角色后ready。退出、踢人、解散、转主和资料变更after事件把映射置pending；未核实之前拒绝普通发送。此轮没有RAP转主/解散语义，客户端不开放原生绕过。

好友只导入本人owned Agent及已经同意的关系。imSync和worker按当前授权移除远端失效好友；超过1000个的远端好友列表返回截断边界。撤销关系即时拒绝私聊发送，独立群授权和任务承诺不会被悄悄撤销。普通IM聊天/文件本身是用户主动分享，已接收的IM内容不会被RAP资源撤权追溯回收；科研私有答案和材料只发可重新授权的定位信息。

## 必需的派生服务器

官方tag `v3.8.3-patch.15`的annotated tag object是`3caa763ed3bee1ec07af417f1f8125df1da26fa9`，真实源码commit是`865bb89517b48493ef9b1b5d9fde87fe0cb05cc7`。协议依赖`v0.0.73-alpha.18`。补丁 [rap-auth.patch](../../deploy/openim/server/rap-auth.patch) 保留官方文件Apache-2.0许可，增加三个有意义Go测试。

固定版WS外层已绑定登录用户，但内层MsgData缺少同等绑定；补丁强制内层SendID、MsgFrom100和平台匹配真实mcontext，拒绝用户伪造1000至5000的系统通知。回调从真实RPC上下文添加`X-RAP-OpenIM-Operator`、`X-RAP-OpenIM-Platform`和`X-RAP-OpenIM-Policy: rap-auth-v1`，同步和异步均保留上下文。回调网络错误及其日志不包含callback key URL或消息正文。

RAP缺这些可信header即拒绝；普通消息body不能自证发送人，只有可信Admin上下文能发已排队pointer或内部IM通知。内部通知仅更新SDK，不产生科研事实。sync实际执行updateUserInfo探针并查该operationID的已授权callback回执；单独设置`OPENIM_POLICY_ENFORCED=1`、旧identity ready缓存或原版image不能自证当前policy已启用。

完整官方源码在Git外`D:/deepseek-agent/.runtime/openim-client-rebuild/server-policy-source`。总控在该目录应用补丁、gofmt并执行：

```sh
git apply --check /path/to/rap-auth.patch
git apply /path/to/rap-auth.patch
gofmt -w internal/msggateway/message_handler.go internal/msggateway/rap_auth_test.go pkg/common/webhook/http_client.go pkg/common/webhook/rap_auth_test.go
go test ./internal/msggateway ./pkg/common/webhook
```

这两个package测试覆盖不同发送人/平台、admin平台、伪造msgFrom与通知、正常文字/custom、同步/异步headers以及网络错误不泄露key。完整派生镜像编译与真实SDK恶意帧验收仍由总控执行，不能由适配器单测替代。

## 配置和回调

- `OPENIM_API_URL`：服务侧管理地址，可为隔离容器网络HTTP。
- `OPENIM_PUBLIC_API_URL`、`OPENIM_PUBLIC_WS_URL`：客户端地址，production必须HTTPS/WSS。
- `OPENIM_ADMIN_ID`：默认imAdmin，必须与share.imAdminUserID一致。固定源码user.Start会初始化真实管理员用户，不需RAP admin联系人或给人签admin Token。
- `OPENIM_SECRET_FILE`：服务侧绝对路径secret文件。
- `OPENIM_CALLBACK_KEY_FILE`：服务侧绝对路径独立随机64hex认证key。
- `OPENIM_POLICY_ENFORCED=1`：仅供安装派生镜像和强制callback配置后使用；实际探针仍必须通过。

callback基址`http://research-api:3217/api/v1/im/callback/<key>`，具体command追加为路径。只允许隔离OpenIM服务访问；不要把回调key、admin secret、API Key放前端、示例或Git。Docker配置挂载`/openim-server/config/webhooks.yml`；Mongo字段为`authSource`（环境`IMENV_MONGODB_AUTHSOURCE=admin`）。不需OpenIM Chat Server手机号业务服务。

以下before配置必须enable true、failedContinue false、timeout 5。Send钩子allowedTypes/deniedTypes为空，涵盖全部用户媒体；内部通知依可信上下文处理：

`beforeSendSingleMsg`、`beforeSendGroupMsg`、`beforeMsgModify`、`beforeAddFriend`、`beforeAddFriendAgree`、`beforeImportFriends`、`beforeCreateGroup`、`beforeMemberJoinGroup`、`beforeApplyJoinGroup`、`beforeInviteUserToGroup`、`beforeSetGroupMemberInfo`、`beforeUpdateUserInfo`、`beforeUpdateUserInfoEx`、`beforeSetGroupInfo`、`beforeSetGroupInfoEx`、`beforeUserRegister`。

以下after配置必须enable true：`afterSendSingleMsg`、`afterSendGroupMsg`、`afterQuitGroup`、`afterKickGroupMember`、`afterDismissGroup`、`afterTransferGroupOwner`、`afterSetGroupMemberInfo`。建议也启用`afterSetGroupInfo`/`afterSetGroupInfoEx`；后台接受并使映射pending。

固定tag配置名和command存在不同拼写：beforeApplyJoinGroup→`callbackBeforeJoinGroupCommand`，beforeMemberJoinGroup→`callbackBeforeMembersJoinGroupCommand`，beforeInviteUserToGroup→`callbackBeforeInviteJoinGroupCommand`，afterKickGroupMember→`callbackAfterKickGroupCommand`，afterDismissGroup→`callbackAfterDisMissGroupCommand`。beforeAddFriendAgree的to字段在此tag为`blackUserID`；UpdateEx字符串为wrapper value。代码按固定版本处理，不假设概览名称。

`beforeMsgModify`是普通文字发送转换钩子，并非已发消息编辑；保持其字段不变并再次核验当前发送人，不能一律拒绝而使所有普通文字失败。未知before命令返回nextCode1与非零errCode1002；没有未知命令放行。

## 源码依据

- [固定官方源commit](https://github.com/openimsdk/open-im-server/tree/865bb89517b48493ef9b1b5d9fde87fe0cb05cc7)
- [回调结构](https://github.com/openimsdk/open-im-server/tree/865bb89517b48493ef9b1b5d9fde87fe0cb05cc7/pkg/callbackstruct)
- [管理消息API（admin-only）](https://github.com/openimsdk/open-im-server/blob/865bb89517b48493ef9b1b5d9fde87fe0cb05cc7/internal/api/msg.go)
- [Token签发及强制退出](https://github.com/openimsdk/open-im-server/blob/865bb89517b48493ef9b1b5d9fde87fe0cb05cc7/internal/rpc/auth/auth.go)
