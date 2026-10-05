# 个人账号、联系人与模型配置（0.14.0 / chat1.3.0）

本轮基线72a42069；API/迁移016另行实现，冻结接口提交不表示服务已经可用。旧IFRC及任务/资料的lab ACL保留。无代码部署、无模型凭据调用。

## 注册与身份

`register` 请求 `{username,displayName,password,inviteCode?}`。不提供邀请码时原子创建独立内部个人空间与本人账号，不能传labId/memberId/role，不授予lab_managers。有效邀请码仍使用原实验室注册流程。密码min8原值；用户名和邀请码仅trim首尾。`session.data.spaceKind` 为 `personal|laboratory`，默认laboratory兼容旧对象。

## 真实跨账号联系人

`chatContacts`增加query `scope:local|global`（默认local）。`view:mine`包含本人及已同意跨空间联系人；global要求search精准用户名，不提供全平台名单，返回该账号真人及其个人Agent公开档案。`Contact.username`仅真人有账号名，Agent为null。`chatContact`可读公开档案，不能读私人记忆、Key或业务材料。

原requestContact/contactRequests/decideContactRequest建立真实关系。human关系双向，个人Agent须主人同意且关系只授申请人。跨空间仅direct聊天；同意后createDirectConversation/imSyncConversation获取真实映射。撤销后的新旧分页/映射/消息指针继续检查当前关系。群加入、任务承接、研究资料原有lab与细分授权不放宽。

## 个人模型（三个固定官方服务）

导出 `PersonalModelInput/PersonalModelConfiguration/PersonalModelSettings/personalModelRoutes`。

| route | 请求/响应 |
| --- | --- |
| personalModels GET `/me/model-configurations` | data PersonalModelSettings |
| createPersonalModel POST 同路径 | body PersonalModelInput；data PersonalModelConfiguration；首次创建即enabled且有Key的配置自动默认；首次disabled后启用仍须明确设默认 |
| updatePersonalModel PATCH `/{id}` | PersonalModelInput+expectedVersion（配置version）；data配置 |
| deletePersonalModel POST `/{id}/delete` | expectedVersion（配置version）；data settings |
| defaultPersonalModel POST `/default` | expectedVersion（settings.version），configurationId:id或null清空；data settings |

所有写操作Origin/CSRF/幂等。max20配置，仅本人CRUD；name/provider/model/enabled是明确完整保存，apiKey省略保留，removeApiKey=true显式撤销且enabled=false。更换provider时必须提供新的Key或显式remove，禁止把旧Key自动发给新厂商。Key服务端AES-GCM加密且绑定本人+provider+配置身份，响应/普通receipt不含明文/密文，仅hasApiKey。Default选择独立请求；前端保存成功后再取settings.version切默认，失败如实说明部分状态，不声称两个操作原子。

支持provider=`deepseek|qwen|doubao`。DeepSeek model限定`deepseek-flash|deepseek-v4-pro`；千问/豆包model由本人填写官方模型名/ep-ID（ASCII字母数字_.:-，最多128）。响应baseUrl只读，分别为现有DeepSeek Anthropic兼容地址、千问DashScope compatible-mode/v1与北京火山Ark api/v3；不接受用户任意URL。Harness公开适配扩展由总控实现，合成wire检查不代表厂商真实凭据或在线验收。无模型或加密主钥时返回真实不可用。

Settings包含configurations/version/platformEnabled/defaultConfigurationId/source（personal|legacy_lab|unconfigured）/legacyLabAvailable。旧实验室成员从未创建个人配置时兼容lab runtime，不复制或展示lab Key。建立个人配置或显式设置默认后一直是个人选择；清空/删除不能偷偷回退lab。好友与Agent主人Key均不可用，费用由发送账号自己的配置承担。修改Key/model/default/version会fence旧turn，实际已消耗usage保留。

## 日常Agent私聊

`agentChatMessage` POST `/chat/conversations/{id}/agent-messages`只 `{text}`，响应data `{message,turn}`，canonical/outbox与原服务同源。仅personal/direct且唯一joined Agent；默认4000 totalTokens/90sec由服务选，前端不选intent/budget。完整获准历史/性格/记忆保持；私有Agent被他人添加后使用申请人的模型与该direct共享记忆，不注入主人私人记忆。

worker此通路只接受非空长度有界纯文本回答，不解析JSON业务计划/actions；不能创建计划、任务、执行或邀请。原sendChatMessage高级明确请求暂保留。普通OpenIM真人↔真人文字/媒体/@不自动调模型，媒体不成为模型材料。
