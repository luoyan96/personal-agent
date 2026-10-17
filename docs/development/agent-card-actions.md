# Agent 卡片的查看、聊天与配置

2026-10-17。`feature/agent-card-actions` 接续 PR53 / `e744fae7763fc815896f3ea1ed83db35ae68e0e3`；产品源码 `93da85f170285765c12aae50105ee8f82ed44912`。

## 用户可见行为

| 实际状态 | 左下角 | 右下角 |
| --- | --- | --- |
| 尚未添加的 Agent 模板/联系人 | 无 | 查看 |
| 自己的 Agent 或关系已接受的 Agent | Agent 配置 | 和它聊天 |
| GitHub 来源工具、尚未接成聊天 Agent 的 Skill | 无 | 查看 |

`own` / `accepted` 决定已添加；等待同意、已撤回等不算已添加，真人不显示 Agent 操作。聊天还须有当前 `allowedActions.chat`，缺权限时按钮禁用并说明；不会把模型未配置或外部验证通过误写为即时通信已连通。模板添加成功由真实联系人读取更新状态。配置打开同 ID 的既有详情/管理与获准知识库入口，其他维护者的 Agent 仍只显示现有只读资料，不授予编辑权限。

卡片预览、查看、配置、聊天为独立语义按钮；没有嵌套按钮或点击冒泡误触。聊天打开过程禁用重复操作，失败原因显示在原卡片并恢复重试；账号、页面、所选详情与可见面板变化令旧请求失效。

## 添加状态与兼容

创建内置助手后记录版本化、按账号隔离的本机 template→contact ID 提示。每次用服务实际返回的联系人重新校验该 ID 仍是本人、`own`、私人 specialist；不凭本机存储授予权限，也不复活不存在的记录。名称与介绍编辑后可继续复用原 ID，不覆盖自定义配置。旧版入口 `AgentStarters` 与广场共用提示，存储不可用时保留本次组件会话状态。

未留有 ID 提示的历史助手仍按原有完整配置/旧版配置精确匹配；已被修改且无提示的历史模板不凭相似名称猜测。实际“我的 Agent”联系人卡始终按自己的真实关系提供聊天和配置。提示不跨设备同步；已安装 Skill 不自动成为聊天 Agent。

## GitHub 发现卡片的真实绑定

发现页也读取本人已安装技能和当前联系人元数据：只有可安装条目、GitHub 来源仓库与子目录精确对应、完整固定提交、本人安装且已启用/可调用，并真实绑定自己的站内 specialist，才展示聊天/配置。禁用、解绑、删除目标、改为外部连接或异主目标后移除动作。仅安装未绑定仍是查看。来源元数据只用于定位，不证明上游或内容经过新的验证，也不授予执行权限；聊天进入实际 Agent，技能选择仍遵守既有获准流程。

多个绑定显示当前 Agent 名与选择器，右下聊天和左下配置始终指向所选 ID。安装状态读取失败显示告警，可重试，不用缓存假定可聊天。已装版本不会跟随上游更新替换，仍使用已安装版本；此批不新增自动安装或复制模板。发现页配置能打开同 ID 的现有详情/管理面板。

新增社区六组真实 React/API/SQLite 流程通过，`community-proof.json`：合成描述的私人 Skill 真安装但未绑定→仅查看；真实绑定→按钮切换/配置定位；两绑定选择后 canonical API 请求第二 ID；缺 transport 原卡恢复；1024 无横溢/嵌套按钮；停用与读取503→移除聊天，重试恢复。这里的 Skill 内容/来源描述是合成夹具，不是实际 GitHub 下载或上游验证。截图 `github-bound-1024.png`、`github-bound-card-final.png`、`github-bound-1536-final.png`，最终演示恢复合成启用绑定，`screenshot-proof.json`。

## 同批修复首次聊天路由

实际界面与回归例发现：`useConversationToggle` 同步选中新的 Single 会话后，再调用依赖旧 conversation ID 的调用方 guard，导致自己刚提交的会话被当成过期，路由留在广场。修复保留提交前检查，在同一个同步 tick 内核对提交后的目标会话、账号 generation/ID 与原路由，然后导航；不在选择和导航之间增加 await。账号、路由、权限或会话在前面异步读取期间变化仍取消旧操作。

原实现新例 3/4 通过、首次新会话导航失败；修复后四例通过。没有修改 OpenIM SDK、后端鉴权或会话映射协议。

## 实际验证

证据均在 Git 外 `D:/deepseek-agent/.runtime/agent-card-actions-20261017`。

- `node --test tests/agent-chat-navigation.test.mjs tests/agent-card-actions.test.mjs tests/capability-center.test.mjs tests/community-discovery.test.mjs tests/community-research-catalog.test.mjs`：38 项通过。覆盖关系/真人/权限、改名不覆盖、删除/不同所属/角色、坏存储/账号隔离、首次/已选中导航、异步期间账号/路由/会话/权限变化及现有来源回归；`focused-community.log`。
- 客户端 `pnpm exec tsc --noEmit` 通过，`typecheck-community.log`；最终 `pnpm run build:web` 通过，`build-community.log` 核对完整 dist、四份固定 SDK 资源、字体/图标/HTML。没有把 web 构建或生成的 ignored native JS 当成新 NSIS。
- Browser plugin not available，沿用已有 Playwright + 隔离 Edge；真实 React/API/SQLite 和合成账号原八组及新增社区六组界面流程通过，1536×1024、1024×726，无页面横溢/嵌套按钮，`qa-proof.json`、`before-add-1536.png`、`after-add-1536.png`、`after-add-1024.png`。已检查实际截图。
- 查看→真实创建一次→左右操作立即更新；配置选中对应 Agent；真实未配置 transport 错误→原卡重试；修改名称介绍→刷新→仍为同一 Agent；账号 B 不显示 A 状态，切回 A 恢复。
- 聊天成功路径使用明确的 SDK/ready mapping 夹具，canonical 私聊、联系人及刷新使用真实本地 API：两次同步指向同一会话，SDK target、currentConversation 与 `/chat/<ID>` 一致。此项是前端集成验证，不是线上 OpenIM 或模型成功；未读取真实用户聊天或资料。
- pageerror 0，无框架覆盖层；既有 Antd bodyStyle/findDOMNode 与 Router future 警告保留，无未解释错误。最早读取骨架未等待、临时 API 重启时启动竞态、账号切换后返回发现页的夹具定位失败均保留；修正夹具等待和入口，不修改服务限制。旧聊天路由失败单独保留 `chat-before.log` 与对应 `qa-failed-*`。

只改桌面客户端，没有共享 package、内置 Skill、API/worker、迁移或权限策略变更，不重复先前通过的根 CI。

## 交付与上线边界

本地演示 `http://127.0.0.1:4816/__qa/index.html`，进入“我的 Agent”查看；标题注明演示数据。为用户预览保留自建 Vite 4816（PID40144）和临时 API 4817（PID34196），完整进程身份见 `preview-services.json`。后续只在核对完整命令与实际使用情况后处理本轮进程，勿误停旧预览或其他任务。

未生成新安装包、部署、改公开 Release 或更新源；现装仍 0.10.6。继承 PR50 的解析边界仍需桌面/API 配套发布，PR51 两项目录说明仍待原运营流程；先前阿里云登录请求不重复发送，本轮没有新查生产状态。生产源码 47c42ac / contract0.25 / chat1.12 / schema022 仅沿用已有记录。
