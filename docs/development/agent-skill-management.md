# 我的 Agent 与技能库

2026-10-18，`release/acceptcat-0.10.12` 接续 PR60 / a6bb210；产品源码 `da1858ecb7fe2876fc25b11a714d4cdf4f51e45c`。

## 用户入口

- 工作台取消与“我的 Agent”并列的“我的技能”栏目。
- 工作台 → 我的 Agent：选择助手，管理模型、技能与资料；右上“技能库”统一安装、更新和维护可复用方法。
- 打开本人的站内 Agent 配置 → 技能：显示实际绑定数量、版本、修订与启停状态；“添加技能”进入带当前助手名称的技能库，“管理”定位到对应技能。
- 在技能库明确点击“绑定到「助手名」”，沿用版本检查更新，保留该技能其他 Agent 绑定、调用和源码授权。安装本身不会自动绑定或公开资料。
- “返回我的 Agent”重新打开原助手配置；“资料”切换复用现有获准资料集合与保存流程。
- 原 `view=skills` 链接兼容并规范到 `view=agents&panel=skills`，保留 catalog 参数；广场安装链接使用新的层级。

技能库是共享的管理入口，一个方法可以绑定多个自己的助手；不复制成多个不同版本。助手的“已绑定技能”仅展示明确绑定的本人技能，获准使用他人技能仍在技能库和原聊天选择器中，不混称为自己的绑定。聊天按次选择 Skill 与参考的执行规则保持，未新增脚本运行器。

## 实现边界

`MyAgentsWorkspace` 管理 URL、旧链接和返回定位；带目标 Agent 的技能库先读取当前联系人事实，验证 personal_agent、本人所有、站内运行方式及 edit_profile，其他身份不能进入目标绑定界面。账户 generation 变化会重建面板，旧请求继续受现有操作范围限制。

`AgentResources` 将绑定技能与原 `AgentResearchCollections` 置于同一助手的“技能 / 资料”配置；SkillLibrary 保留安装、更新、版本、授权、本机素材与资料导入恢复。新建助手尚未出现在全局 IM 联系人缓存时，已验证的当前助手仍可正确显示在技能绑定选项中。

使用已有 installedSkills(scope=mine, agentId)、updateSkillSettings 和资料接口，无合约、数据库、服务端或内置 Skill 内容修改，不需要后台升级或迁移。

## 已执行检查

- 客户端 community-discovery、agent-card-actions、agent-chat-navigation：27 项通过，0 跳过；客户端 TypeScript 通过，最终 diff 检查通过。
- 7 组分阶段真实 React / HTTP / SQLite 流程：单一 Agent 主入口；助手技能/资料与明确安装；多助手绑定及授权保留、管理和返回；私人资料保存读回；旧 Skill/catalog 链接；1024 小窗口；账户切换及外人/无效目标阻断。
- 1536×1024、1024×726 实拍已检查：助手技能、资料和技能库无整页横向溢出；非空页面、页面身份、无框架错误层。通过阶段 pageerror 0。Router future / findDOMNode 既有警告及注销 401、私人源码 404 保留并解释。
- Browser plugin not available，使用已有 Playwright 与隔离 Edge，无新增浏览器依赖。API 使用合成账号、资料和 GitHub 事实；技能文件选择器投影返回合成包，后续安装/设置写入是真实 API。没有将该投影当成原生文件导入、真实科研效果、模型或 IM 连接验证。

证据位于 Git 外 `.runtime/agent-skill-hierarchy-20261018`，`qa-summary.json` 关联分阶段 7 项和原始记录。首轮向未接受的好友授权被拒，补齐真实申请/接受后继续；两字按钮空格选择器首败保留；夹具反复整页登录触发真实 15 分钟限流，改用新隔离库与路由导航完成最后隔离验证，未削弱产品限流或权限。

未重复根完整 CI：本批只修改客户端入口，没有共享代码或打包 Skill 内容变化。前批 PR60 的三平台 Foundation 已读回 SUCCESS。Windows 安装包独立构建、实际载荷和隔离启动记录见 [0.10.12 交付](../deployment/acceptcat-0.10.12.md)。
