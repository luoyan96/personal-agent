# 个人账号、自然聊天与模型设置

## 用户本轮方向

2026-10-05：暂缓完善需求编排，先把人与 Agent 的日常聊天做好。任何朋友可以注册账号并添加用户；注册不再要求实验室邀请码。设置入口改为“模型设置”，管理本人使用的模型与 API Key。

## 产品与实现

- 注册只需显示姓名、唯一用户名、最少 8 字符密码。团队邀请码是自愿加入已有实验室的可选入口。公开注册创建内部隔离个人空间，保留已有 IFRC 身份与资料。
- 按准确用户名找到真人及其 Agent 公开档案；好友申请须本人或 Agent 主人同意。跨空间授权只开放对应私聊，不授予实验室任务、资料或密钥权限。
- 日常 Agent 私聊只输入文本、发送与等待回复；当前会话确定 Agent，本人默认配置确定模型。性格、公开档案与获准记忆继续参与对话。高级需求编排入口折叠保留，日常消息不能产生计划、建群或执行动作。
- 所有人都有个人“模型设置”：配置列表、添加 / 编辑 / 删除、启用及默认选择。Key 加密保存、响应只返回是否已保存、留空保留原 Key。原实验室成员从未作个人选择时兼容既有实验室配置；明确选择个人配置后不静默回退。
- 本轮实现三个官方服务：DeepSeek、通义千问、豆包。模型名按厂商实际授权填写，接口地址只读。任意第三方代理、其他地域接口与自动模型发现另行扩展，不保存不可执行配置并声称已连通。

共享接口见[冻结契约](personal-accounts-contract.md)。基线 `72a42069`；最终源码、门禁与是否上线以[当前状态](../current-state.md)和[项目日志](../project-log.md)为准。概念图与测试截图在仓库外父目录 `.runtime/personal-chat-20261005`，不作为实际模型回复证明。

## 分工与验收

总控负责设计概念、Harness 官方扩展接口、整合审查及共同验收。后端负责公开注册、跨空间联系人 / 私聊权限、个人配置、迁移和自然文本 worker。前端负责注册 / 设置页面、联系人接线、简化输入区与气泡。

本轮重点是两名独立个人账号真实注册、好友申请 / 接受 / 私聊可读 / 撤销后不可读；旧库迁移保留已有数据；密钥不回显 / 不跨账号使用；默认切换和失效配置会阻止旧模型结果；普通聊天零任务、零计划、零动作。浏览器渲染、合成网络模型与厂商真实调用分别记录，不互相替代。

## 模型接口依据

运行底座保持固定 `@deepseek-ai/dsh-llm` 0.2.0-rc.1，通过已安装公共 `LlmAdapter` / `registerAdapter` 接口扩展；不复制 Harness 源码。接口方向核对[官方扩展文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/practice/llm-adapter.md)，具体类型以本地固定版本为准。

千问走[阿里云 Chat Completions 文档](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions)的北京 DashScope 兼容接口；豆包走[火山方舟基础地址与认证](https://docs.volcengine.com/docs/ark/base-url-and-authentication?lang=en)及[流式返回文档](https://docs.volcengine.com/docs/ark/streaming-output?lang=zh)的北京接口。两者使用厂商 Key，不调用 OpenAI 服务。只接受文本、没有模型工具；请求含官方 attribution headers，禁止凭据跟随重定向，超时 / 取消 / 响应边界与完整用量校验均保留。合成 wire 测试通过不意味着已有这些厂商的真实 Key 或账号授权。
