# 项目进展日志

## 2026-10-06：GitHub 版本管理与多人协作入口

- 最终[Actions 37411082051](https://github.com/luoyan96/personal-agent/actions/runs/37411082051)三平台均实际成功：Linux22.19 / 24、Windows24各执行完整根CI。受测源0ef2016331307efdc5de71857550f0dbb202a76b；03:58:18UTC，PR1合并为f7b5099d2df7e889ecaae0a6542366194bc82767，合并树与受测源均为0a3f00d2c75b374b7e0e504ec568e0c1d347a92f。最终本地CI=true Windows单并发521+2通过、测试191.95秒，日志root-ci-github-windows-serial.log。首次 / 第二次失败证据保留；不将串行后通过当作已确定具体冷启动原因。
- 本地创建main跟踪新origin/main，原开发分支 / 初始标签 / legacy远端保留；当前基线 `personal-agent-2026-10-06.1` 包含测试兼容修复，初始标签不移动。最终只补协作版本与验收事实，内容 / diff检查后同步纯文档提交，不重复已通过的同源软件检查。生产部署、真实账号 / Key、数据库及原生端没有本批变化；主线push的自动检查和既有PR检查分别可在Actions读取。

- 首次实际发布成功：241个历史提交 / 902个tracked文件由原子、非强制push导入新main；远端main与annotated标签的peeled SHA均精确核对为 `3540e0c1d0247bffd711c21734b8d083c5fe3323`，标签对象 `12f04aa962d88a7a725f39e2665addf73efc7782`。GitHub [Foundation checks](https://github.com/luoyan96/personal-agent/actions/runs/37409783727) 已实际触发，结果按该运行读取，不提前计通过。root协作文档和本地清洁状态检查通过；发布回执在Git外，后续纯文档收尾不改变基线标签或线上软件。
- 首次Actions三个任务均失败，原日志保留：两Ubuntu任务在OpenIM合成桥测试失败，fixture模型密钥默认world-readable，被生产一致的权限门禁拒绝；Windows任务的真实SQLite015→018双迁移 / 密码哈希测试超过默认5秒。独立fix/ci-portability分支将三份合成凭据文件显式创建为0600，并断言配置HTTP200；仅该磁盘迁移测试允许20秒、全部数据保持断言不变。无生产源码 / 权限门禁 / 预算或迁移改动。修复后本地完整根CI42文件 / 521项 + 2生产入口、构建 / 类型 / 契约 / B0 / 生产隔离通过，证据 `root-ci-github-portability.log`；提交PR后再核对实际三个GitHub平台任务，不把本地Windows通过等同云Linux通过。
- 实际[PR #1](https://github.com/luoyan96/personal-agent/pull/1)运行37410599347的两Ubuntu平台通过；Windows仍在首条实际PDF解析命中生产8秒截止，其他520项通过。失败日志 `github-ci-windows24-second-full.log` 保留，资源竞争是待验证解释。仅CI Windows的Vitest文件并发改为1，保留实际解析器、8秒限制和全部断言；普通本地 / Linux仍并发2。随后本地CI=true及PR新源分别复验，结果在发布回执 / Actions读取，不预写通过。

- 用户指定 `luoyan96/personal-agent` 作为项目协作仓库。读取仓库确认公开且初始无分支，当前源码75ab9b2包含240个历史提交 / 902文件；按首次空仓库导入建立main并保留既有历史，旧research-agent-platform远端另名保留，不覆盖其代码。
- CONTRIBUTING补齐克隆、独立副本 / 分支、前后端契约、PR审核、撤销提交和部署边界；README与当前状态给出新主仓库，PR模板增加客户端及交接检查。既有根Actions在main / PR运行，完整OpenIM客户端仍要单独类型 / 服务 / auth / Web / 界面验证，不把根CI等同客户端验证。
- 初始协作基线标签 `personal-agent-2026-10-06`。首次导入阶段只更新协作 / 交接文件与Git远端；随后CI环境修复见上文。线上787后端 / 27前端或数据库18不变，没有自动部署。
- Git外 `.runtime/personal-agent-20261006/github-publication-audit.json` 保留全部可达历史blob的高置信凭据 / 私钥格式和大文件检查；唯一私钥命中为精确公开合成TLS测试fixture，生产不引用。扫描不保证覆盖所有凭据格式。真实凭据、SQLite / 运行材料、构建产物不在本次tracked树中；GitHub远端实际SHA与检查运行状态在后续发布回执核对。

## 2026-10-06：Personal Agent 第一批开发、发布与验收

- 发布收尾：11:09:21后端 / 首版前端787ca2314b24320ae0b90da4db4d1401b209f719上线，镜像e632d1c、contract0.18 / chat1.7 / schema18。备份 `/srv/research-openim-backups/20261006T030859Z` 的12hash / 9gzip / 隔离SQLite17通过，73旧表结构及全部行保持一致；源 / 容器hash、八服务 / 其他六镜像不变及精确首页通过。兼容57d-schema18镜像8ef9b682在无外网容器实际HTTP / SQLite smoke通过，不是生产全栈恢复演练。
- 云端独立合成账号12门禁通过：真实HTTPS / React / SDK，无Key聊天记忆、UI保存 / API纠正 / 设置、提醒可见；关闭页面到期canonical写一次、实际IMsent、SDK重开可见、完成并退出。未借用用户Key / 调用厂商模型，任务匹配真实质量未验证。
- 首轮线上截图发现回执在人与助理两端重复，改为只在输出显示，偏好 / 提醒简短并保留详情。27c3279f7dc6584ebde905fd821e21f7166e5c74在11:16:43静态上线，后端与八镜像不变，无迁移 / 重启。新客户端类型 / Web / 四SDK及线上3定向复验通过：只显示一次、详情可访问、纠正偏好重新登录仍在；纯客户端展示改动不重复已通过根CI。
- 线上pageerror0；SDK worker `Cannot read properties of null (reading 'map')` console错误保留，原因未定。当前消息 / 提醒流程实际通过，后续凭证据定位，不称console干净。唯一合成账号退出并精确停用，活跃会话0 / IM lease0 / 未发active提醒0、历史保留。真实账号 / 密码 / Key未读或改，本地helper与测试浏览器停止，代理云标签收尾关闭；无原生包 / GitHub推送 / SSH或端口变更。
- 精确版本及恢复方法见[当前状态](current-state.md)和[ECS记录](deployment/openim-ecs.md)。后续优先跨个人空间好友任务群的共享 / 同意 / 材料边界，再验证真实模型匹配、长期偏好效果及反馈复用；完整Personal Agent主线仍未全部完成。

- 用户授权开始改造；继续由既有前端 / 后端AI分工，整合实际本人记忆、专项转交、服务端一次性提醒与“关于我”界面，contract0.18 / chat1.7 / schema018。没有新建外部AI窗口、模型提供商、权限或Codex定时任务。
- 后端来源ab6d25d / 293d707 / 9f1be41，前端来源3723d90 / 1ba8919 / 434a16e / b4aa0c6及说明cde7393。总控根CI第一次被新测试隐式数组类型挡住；补数组类型后又需非空索引，随后发现旧apps/web版本断言仍为0.17，均只修测试声明并保留失败日志。
- 最终整合根CI42文件 / 521项 + 2项生产入口、导出契约、进程smoke及生产隔离通过，日志 `.runtime/personal-agent-20261006/root-ci-complete.log`。完整客户端typecheck / Web / 四SDK资源通过，服务测试通过；首次file:契约缓存过旧导致类型 / 打包失败，精确刷新已编译0.18缓存后闭合，没有升级锁文件或安装依赖。
- 后端17项最终专项、同空间协作1项与实际worker / HTTP / SQLite通过，ModelCall合成。完整已有档案5项 + 偏好3项在原4000预算内reserve2679 / output cap1321；当前请求、档案、记忆不截断，省略候选明确标识。父子请求共用root ledger，child重试后父回执引用最新实际turn。独立偏好并存、纠正 / 撤回、来源保留、任务版本 / 完成 / ACL、重启 / 双worker提醒去重和旧017文档兼容均有证据。
- 前端13个必要场景分阶段通过：真实生产HashRouter / React / loopbackHTTP / SQLite，SDK / session / mapping和模型合成。桌面 / 320、版本管理、候选明确确认、关闭 / 换tab / 换账号的迟响应、同身份回执与实际路由闭合。Antd选择器、fixture分页 / 顶部标识、候选origin和反复本地登录429等harness原失败保留；无未捕获pageerror，库警告保留。超过30条UI游标遍历、真实厂商 / 云IM与设备推送不据此计通过。
- schema18兼容旧业务源57d的实际HTTP / SQLite回退验证通过：保留用量、个人记忆 / 修订 / 新聊天；暂停未发提醒并栅栏个人流程及记忆消费请求；旧普通聊天仍可用。5个部署helper守卫通过。当前库不能回退覆盖成017；新版本激活会显式备份和迁移，云端实际结果随后追加，不预写上线成功。
- 总控证据 `.runtime/personal-agent-20261006`，后端证据 `.runtime/personal-assistant-20261006/backend-review.json`，前端 `frontend-review/summary.json`。发布前线上为57d API / aa3前端，最终发布事实见上文；未推GitHub、未构建原生安装包。跨工作空间任务群、完整行为 / 性格学习、条件 / 周期跟进及策略改善继续后续，不将本批有限文字流程称为完整Personal Agent。

## 2026-10-06：明确Personal Agent最终目标（仅规划与交接）

- 用户明确：最终以个人为中心、微信式交流；人与Agent共生于统一通讯录；按任务难度 / 类型自动创建、安排及组织人机协作；持续形成用户习惯 / 喜好 / 工作方式等长期记忆，迭代并主动跟进。科研仍是首个验证场景，个人使用不以实验室成员资格为前提。
- 产品规划更新为v0.7，定义联系人交流、任务组织、长期记忆、持续推进四层，以及简单直接处理 / 专项复用或创建 / 复杂协作的路径。区分资料身份与实际执行能力、个人记忆与Agent / 共同任务范围、用户明确偏好与AI推断；给出持久跟进、用户纠正和反馈应用的验收要求。
- 路线图新增PA1长期记忆、PA2任务组织、PA3持久跟进、PA4反馈迭代建议顺序；README、架构、任务分配、原P1范围、开发索引及快速接手状态同步。原科研G/P1和历史部署证据保留，未用旧通过记录宣称新增能力已完成；移除快速接手底部过时e536 / 0ea当前优先级表述。
- 变更仅文档，父提交9019a51；实际软件仍API / worker57d059e及客户端aa3c0f1、contract0.17 / schema17。未修改代码、迁移、模型 / 外部配置、云服务或部署，未创建此Codex线程的定时跟进，未推GitHub。内容检查144份Markdown / 10份Skill及diff空白通过；不重复已通过的共享CI，后续代码批次仍按AGENTS执行相应门禁。

## 2026-10-06：Agent 联系人、三种添加、外部接入与桌面工具上线

- 09:33:52北京发布固定软件 `57d059e5201fc54c53bfcaeaa28765ea34397615`，API / worker镜像 `sha256:837c4e89fa03d7253207f5c3c223d1ee62daee7ce609afa4e2a8d3c7e622b7c6`；contract0.17 / chat1.6 / schema017。09:57:55补发客户端 `aa3c0f13e257c8ac463ee5800cccdea255e6a07b`，公网index `7db7867121af9a3aedf29e9505f936049c085aead02ae7500ac82e2a717049c2`，后台current / 八镜像不变。准确位置见[current-state](current-state.md)及[部署记录](deployment/openim-ecs.md)。
- 统一通讯录先显示真实联系人；准确用户名发现真人及其可见Agent，稳定名片分享，申请 / 同意后聊。本人四项资料创建或public profile导入原子保存身份 / direct并开聊，IM不可用重试同ID，失响应复用不重复建；同名已连接Agent不覆盖。公开导出仅名称 / 介绍 / 能力 / 性格，不带Key / 记忆 / 工具。
- 已实现外部HTTPS443 Chat Completions文字服务绑定、加密Key、版本并发、显式合成探测与断开；默认本人，开放给已接受联系人需主人设置并承担外部费用。每条发送重新同意，仅当前文字；无历史 / 文件 / 私人记忆 / 任务 / 内部身份转出，无工具执行 / 失败平台回退。公网DNS及实际socket IP / TLS固定、redirect / proxy / 私网拒绝；返回正文和用量严格校验。此兼容协议不是任意个人Agent、MCP / A2A自动接入。
- 桌面直接显示真实表情 / 图片 / 文件 / 语音工具，手机窄屏加号；emoji只填草稿，媒体沿原SDK回调与会话 / 账号世代守卫。名片打开仅看资料，登录后回名片，取消消费参数，不自动申请 / 发送；连接GET初始化完成前锁编辑，避免迟返回覆盖输入。
- 共享CI41文件 / 491项 + 2生产入口、B0实际进程、构建 / 类型 / 契约和生产fixture隔离通过。首轮3失败为两旧迁移fixture重建未移除新017表及旧CHAT1路由计数，修测试后通过且原日志保留。最终57d及aa3客户端类型 / Web / 四SDK通过；初次generated contracts缓存缺新module失败保留，校正生成dist不改锁文件。
- 前端15项组件、6项真实loopback HTTP / SQLite和3项实际production createHashRouter门禁分段闭合；合成SDK / API / no-network探测 / 合成录音设备明确，不宣称单次全UI套件或云vendor成功。真实HTTP保存加密Key不回显、默认owner-only、uncertain探测、disconnect保留身份通过；实际CKEditor emoji、合成SDK文件、真实MediaRecorder取消未发送及320布局通过。旧选择器 / harness、初始化覆盖等failed报告保留。
- 主批72旧表SQL / 全行hash完全保持；一致备份 `/srv/research-openim-backups/20261006T013331Z` 12checksum / 9gzip / 隔离SQLite完整性及schema16通过。schema17兼容旧业务镜像与外部请求fence / network-none smoke备妥，保留现有DB与实际外部用量、不静默调用平台。helper5专项及后端审查修复恢复顺序为停3写入者 / 验schema及ready / 再启OpenIM；旧失败证据保持。完整组件恢复 / 异地备份未验。
- 线上已登录实际核验统一通讯录、三添加入口、四资料 / 导入 / 外部表单、本人名片连接、既有SDK私聊及桌面工具；没有新增联系人 / 消息 / 真实Key / vendor probe / 录音。切窄屏遇其他设备登录提示并退出，触发来源未定；生产手机聊天未计通过。随后发现退出后login空白：前端门禁挡住实际位于MainContentWrap内的login，而旧harness把login放门外漏检。root修aa3，3实际production树门禁确认login/register、分享回跳消费、实际UserStore logout清IMprofile并reload可登录；静态补发后实际Edge登录 / 注册 / 可选邀请码 / 至少8字符提示确认，未填或提交凭据。
- Git外 `.runtime/agent-experience-20261006` 保存主批及public-login部署回执、root验证、`frontend-review/{summary,route-summary}.json`、`live-ui-proof.json` / `live-public-login-proof.json` / 实际通讯录和登录截图；空白chat截图保留且不当成功图片。Workbench上传到期、自动审批超时和一次重试均记录；正常免密恢复原授权，无新增SSH / 端口 / 云权限。前端本地服务 / 隔离浏览器已关闭；本批未推GitHub、未构建原生安装包或验证真实外部Agent工具。

## 2026-10-05：自然语言创建 Agent、自动开聊与连续回复上线

- 最终软件`0ea0516d71d4f3c114f96ee0621ad463924a7a85`于22:25北京时间整体发布前端 / API / worker，镜像`sha256:949cd6501bdf286920db0f48b8ff23def262a534538f2226e010537667a45ac8`，公网index `7bcd46a2153093f56e69503a8c5339f66dca6d4e9409e2865dedd9a8521c76af`；contract0.15 / chat1.4 / schema16无迁移。八服务运行、API healthy / HTTPS ready、三变更源文件hash一致、其他六镜像未变。
- 先21:45发布f847，原IFRC本人助理明确请求实际创建“链研直言”，通讯录与SDK私聊存在，21:58一轮真实模型回复通过。但自动开聊因Single selection先await造成QueryChat卸载 / 自取消而失败；前端6b8e8fd / 整合1c533c0改为同tick导航。长生成档案111 / 426 / 127字还挤占下一轮预算；后端fee66b1 / 整合f96644c精简生成档案并按预算选取完整最近历史，保留当前输入 / 全档案 / 获准记忆，仍4000 / 90。所有失败与原档案保留。
- 最终共享CI35文件 / 457项 + 2生产入口及全部构建 / 类型 / 契约 / B0 / 生产隔离通过，完整客户端类型 / Web / 四SDK资源通过。47原后端针对项、10连续预算组、17客户端原组、5真实QueryChat父子路由组通过；合成模型 / SDK明确标记，不能替代真实调用。初次453 / 1契约版本基线失败与fixture缺GET / 选择器等报告保留。
- 22:26本人助理收到精确简洁四档案的新创建请求，实际回执找到已有链研直言，不重复建；未手动点击即自动进入真实SDK私聊。22:27 / 22:28两轮真实模型回复，第二轮接着第一轮继续，历史回执再次打开同SDK URL且历史保留。本人资料UI仅把新Agent三项长说明改简洁，身份 / 模型 / Key / 记忆未改；没有新建云测试账号、读取Key / 密码或自动重放旧请求。
- 更新前一致备份`/srv/research-openim-backups/20261005T142440Z`：12校验 / 9gzip / 独立SQLite恢复integrity与16迁移校验通过。回退Nginx位于`/opt/research-openim/ops/agent-creation-0ea0516d71d4/activate-20261005T142439Z/research-openim-production`；回退f847代码与镜像时保留现有schema16，无需数据库恢复，不套用旧015回退。完整组件恢复 / 异地备份未验。
- Workbench上传会话过期后正常恢复同权限连接，未新加SSH。历史按钮导航中间态的过早断言保留，等待UI就绪后无重复点击即通过。独立1c导航包未上传 / 激活；最终Git外交付证据`.runtime/agent-creation-20261005/{continuous-deployment-verified,live-ui-closure}.json`和`live-final-agent-chat.png`。项目文档已同步，后续仅本地文档提交不改变上述线上SHA，未推GitHub。
- 边界：当前仅明确要求创建时持久保存，普通需求自动能力匹配 / 转介、任务群、联网、文件读取和工具执行待后续；原生桌面 / 手机另验。详见[统一状态](current-state.md)与[本轮范围](development/natural-agent-creation-brief.md)。

## 2026-10-05：自然语言创建 Agent 修复进行中

- 用户截图21:06明确要求创建区块链Agent，旧个人助理只写人设。本批补齐明确命令、本条独立档案生成、原子保存本人联系人与direct、真实回执、当前发送页面自动开聊。普通聊天不因此创建对象，历史回执仅手动打开。
- 后端65dc242 / 总控33bfc81、前端0e011e0 / 总控4b92412，契约0.15 / chat1.4；SQLite16无迁移。旧持久形状及普通HTTP严格0.14兼容实际验证。后端47针对项和总控完整客户端类型 / Web / 四资源通过，模型为合成。
- 首次全CI453通过 / 1版本基线失败保留，更新apps/web测试0.14→0.15后完整CI35文件 / 454项与2项生产入口通过，构建 / 类型 / 导出 / 内容 / B0与生产隔离全部闭合。部署helper3项模拟通过。实际部署、真实模型 / SDK和前端渲染待后续记录；Git外证据`.runtime/agent-creation-20261005`，未推GitHub。

最新状态先读[新 AI 快速接手](current-state.md)。日期使用北京时间；按批次追加真实事实，历史记录不替代当前运行状态。

## 2026-10-05：注册修复上线与交接入口

- 用户线上注册截图出现 username regex 的原始 Zod 信息；可见用户名合法，具体隐藏字符尚无法确认。
- 用户要求密码最少 8 位，无复杂度组合要求。前后端分别修复契约、API / 维护入口、注册 / 登录表单及中文错误提示。
- 后端提交 `f83aacc` 已在总控整合为 `349dadd`；前端 `1889423` 整合为 `d7cbe97abdd6271f459918727bf00f7c2bab154c`。共享契约 0.13.1，用户名 / 邀请码只 trim 首尾，密码原值 min8、去除独立 256 上限；后端真实 loopback HTTP 与针对性 178 项测试、构建 / 类型 / 导出通过。
- 总控根 CI 31 文件 / 400 项测试、2 项生产入口测试、构建 / 类型 / 导出 / B0 生产进程通过；独立客户端 typecheck、3 项 auth 测试、build:web 与四个固定 SDK 资源检查通过。
- 两个前端入口真实本地 API 的 18 项浏览器分组通过（`auth-input-review/..._e586de8a/report.json`）；旧缓存导致的前两次失败证据保留。另桌面 / 320px 的稳定错误布局 2 项通过（`layout-public/..._7868a887/report.json`），原截图为错误高度动画过渡，未追加产品修改。
- 总控建立 `docs/current-state.md` 与本文，并更新 AGENTS / README / 开发索引 / 路线图的阅读入口，防止新 AI 从历史版本重新开始。
- 08:26 北京时间，新 ECS 实际发布固定软件 `d7cbe97abdd6271f459918727bf00f7c2bab154c`；API / worker 实际镜像 `sha256:b2f1edf0ee51480720f0b3f7e1deef08ccd133184a9307c38d4e87cad62730b0`，活动容器四份源文件与归档一致，公网首页与精确构建一致，ready 为 0.13.1 / ok。IM 镜像未改变，迁移仍为 015。
- 更新前备份 `/srv/research-openim-backups/20261005T002607Z`：12 个 checksum、9 个 gzip 完整流、独立恢复 SQLite integrity ok；保存在同一 ECS，完整组件恢复和异地备份未验收。保留旧 release 与镜像回退标签。
- 新站真实 HTTPS 合成实验室 `lab_registration_qa_20261005_8ea4567b` 通过 7 位拒绝、非法用户名中文 / 无原始 JSON、8 位注册、用户名 / 邀请码首尾空白规范化、8 位登录、首次负责人角色和旧 cookie 退出后 401，共 7 项。08:28 审计维护 CLI 撤销测试邀请码、停用该测试账号，活跃会话 0；08:29 八服务运行 / API healthy / ready / 无 OOM 检查通过。本轮无 IFRC 真实账号修改、无新增 SSH 授权、无真实模型调用。
- 真实云端合并回执 `.runtime/openim-cloud-20261004/registration-closure.json` 和空白新站注册截图 `registration-public-min8.png`；本地 CI 日志 `ci-registration-fix.log`、客户端 `client-registration-build.log`；这些运行证据不提交 Git。
- 上传曾因旧 Workbench 会话过期失败，重新免密登录后成功；首个镜像校验脚本误用根目录包名导入，在备份 / 激活前退出，旧站点仍健康。修正为固定 dist 路径并核验脚本 SHA 后重跑退出 0；服务器保留 `registration-hotfix.initial-failed.log` 与 `registration-hotfix.retry.log`，不改写失败记录。
- 交接入口会记录部署 / 本地 SHA、实际测试、未验证项和下一步；AGENTS 要求新 AI 先读入口并在每批完成后同步追加。当前未推 GitHub。下一步是负责人自行注册、设置模型后完成新站真实 AI 闭环；原生桌面和剩余 SDK 验证仍待完成。

## 2026-10-05：完整 OpenIM 新 ECS 部署与验收

- 受测并部署软件：`c3f58a4a88a3b0c0efdf2c868a556cc9d29f25ac`；本地部署文档提交 `3d3ccb6`。入口 `chat.acceptcat.com`，旧 `research.acceptcat.com` 独立保留，新 IFRC 不自动迁移旧账号 / Key。
- 根 CI 398 项、生产入口 2 项、完整客户端构建 / 类型通过；真实权限 15 项、档案 Ex 7 项、重启恢复 4 项及后端退出 7 项通过。
- 实际 SDK 媒体主运行 `89879723` 获得 13 项核心证据，原报告 failed 保留；`1055c48a` 复现刷新历史读取早于 SDK 就绪，修复后最终专项 `0d540e22` 的 3 项回归通过，pageerror / unhandledrejection 均 0。挂起诊断 `cb9f17ac` 保留 aborted。
- 修复涵盖首个协调会话 / native pin、flex 高度 / 窄屏、Web ByFile 资源、好友重复导入 / 固定零好友序列化、HTTPS 对象前缀、SDK 历史就绪与过期异步请求。
- 最终运行记录：父工作目录 `.runtime/openim-cloud-20261004/{final-db-verified,backup-verified,live-verified,deployment-closure}.json`；媒体组合证据 `.runtime/openim-client-rebuild/sdk-media/SDK-CLOUD-ACCEPTANCE.md` 和 `sdk-cloud-acceptance.json`。均不含明文密码 / token，不提交 Git。
- 两名测试账号 / 两枚测试邀请码已停用，测试实验室活跃会话和 IM lease 为 0，历史保留。IFRC 首次邀请码当时未使用，私有文件交接；真实模型 Key 未配置。
- 一致备份 `20261004T184707Z` 校验通过并恢复八个服务，SQLite 独立恢复 integrity ok。此前相对 Compose 路径引起恢复失败已立即恢复并修复脚本，重新备份退出 0。未做异地备份 / 完整组件恢复演练。
- 证书实际换发与 webroot 续期验证通过；本次临时 SSH 公钥撤销，新的连接明确 publickey 拒绝，专用本地密钥和测试密码文件删除。
- 未推 GitHub。网页版有实际媒体验收；原生桌面云媒体、语义 `@106`、SDK 科研指针撤权刷新和新 IFRC 真实 AI 执行仍待验证。

## 历史批次索引

- [需求入口与群协作链条](development/chat-workflow-brief.md)：本地 `cdf168d`，377 项 CI、12 组真实 HTTP / SQLite / Edge 与 IAB 检查，合成 ModelCall。
- [联系人、档案与持续记忆](development/agent-contacts-brief.md)：统一人与 Agent 联系人、专属 Agent 与明确保存的记忆，本地整合和浏览器验证。
- [完整 OpenIM 桥接后端](development/openim-bridge-backend-report.md)、[旧 OpenIM 采用批次](development/openim-adoption-brief.md)：保留对应源码、权限和许可来源。
- [旧 ECS 部署](deployment/ecs.md)：旧站固定版本与账号 / 模型保持独立。
- [G1—G5a 报告](development/README.md)：历史工程门禁；产品 P1 与真实小组收益尚未完成。

## 2026-10-05：登录默认需求入口与会话刷新修复

- 用户登录后截图显示左栏协调 Agent，右侧仍为上游“创建群聊”。独立合成账号真实 SDK 完成登录后复现；系统已创建协调会话，但没有默认选择，且上游 Layout 会把刷新深链接退回 `/chat`。
- 前端提交 `e78a3e404af70ccc3ceb8721897bd5790699959e` 整合为 `b4046a5ce8572f2d12a930a44b4a223121a39e92`。真实科研会话映射、当前 session actor / SDK 自身份和 login / connect / sync readiness 一致后自动打开协调会话；保留用户已选私聊 / 群聊与手机返回列表。恢复会话、群资料与成员的异步请求增加 actor / route / generation / selection 守卫，旧请求不写回。未就绪或不同账号不展示上一会话输入框。
- 空白页科研分支显示需求入口状态和重试；聊天草稿提供目标、材料、交付、截止时间提示。文献梳理 / 数据分析 / 论文修改只填空草稿，无自动消息或模型调用。真实窄屏截图发现长介绍挤裁标题，另提交 `d99c884dcc9c9dc3165949e82fd4568fdb4fa1b2` 把介绍保持单行。
- 客户端整合入口类型检查通过，两次精确 Web 构建和四个固定 SDK 资源 / 静态引用核验通过；前端分支五项聚焦检查通过。本轮没有共享代码 / 契约 / 依赖 / API / 迁移修改，未重跑根共享 CI；d7 的 400 + 2 项保留为对应后端版本证据。
- 09:51 首版前端上线，09:58 最终 `d99c884` 上线；Nginx root 使用独立 `/opt/research-openim/client-releases/d99c884dcc9c9dc3165949e82fd4568fdb4fa1b2/clients/openim/dist`。`/opt/research-openim/current` 与 API / worker 保持 d7，镜像 `sha256:b2f1edf0ee51480720f0b3f7e1deef08ccd133184a9307c38d4e87cad62730b0` 未重建。源 / Web / 外层包 SHA256 和公网 HTML 实际核验。保留原前端及 Nginx 配置供回退；没有数据库迁移或新增 SSH。
- 最终新站隔离 Edge / HTTPS / 真实 SDK 七项通过：新登录默认需求对话、模板仅草稿、协调会话刷新恢复、显式群深链及刷新保持、通讯录不被轮询抢走、320px 标题 / 输入 / 发送无页面溢出、手机返回列表并再次进入需求对话。pageerror 0，零消息 / 模型发送；源码守卫审核不冒充故障注入或真实账号切换测试。没有复测媒体、Electron 安装包或真实 AI 理解 / 执行。
- 首次部署在 Nginx reload 后立即读到旧首页 hash，脚本实际自动回退；改为在 20 秒内观察真实新首页收敛，重跑退出 0。失败 / 重试日志保留。验收脚本一度 exact 标题定位错误及错误调用 context.setViewportSize，均保留失败记录，修正后精确最终运行通过，不把脚本错误归作产品错误。
- 末尾健康检查一度误读 `/readyz` 的 SPA HTML 回退；部署时该路径的 HTTP 200 不作为 API readiness 证据。10:04 使用真实契约路由 `/api/v1/health/ready` 验证 HTTP 200 / status ok / contract 0.13.1，同时核对八个服务、API healthy、无 OOM、后端镜像未变和精确公网首页。最终以 closure.live 为准，原部署回执保留。
- 10:00 审计 CLI 撤销独立实验室 `lab_sdk_qa_20261005_demand_752e0f9c` 的测试邀请码、停用唯一测试账号，活跃会话 / IM lease 均为 0，合成会话历史保留。没有使用 IFRC 真实账号 / 开通码 / Key；最后八服务运行、API healthy、HTTPS ready、无 OOM。
- 证据在总控父目录 `.runtime/demand-entry-20261005`：`baseline-report.json`、`after-report.json`、`deployment-verified.json`、`closure.json`、两份构建日志与桌面 / 手机截图；运行凭据不进 Git。云回执 `/opt/research-openim/ops/demand-entry-closure.json`。本批仅本地提交，未推 GitHub。下一步由负责人配置模型后另行完成需求澄清、协作建议与任务执行的实际闭环。

## 2026-10-05：真实消息不回复、输入区和消息自动显示修复

- 用户截图含 MODEL_UNAVAILABLE 和 BUDGET_EXCEEDED。新 ECS 只读元数据核对：模型不可用产生在 lab_disabled 时；负责人已于 12:26 自行启用 deepseek-flash。旧“在吗”实际报告输入 7360 / 输出 763，已经超过默认 4000。内部生成 schema 约 16.9KB，且把总预算全作 output cap，导致普通请求失效；数据库诊断只取状态、用量和长度，没有提取真实 Key / 密码 / 邀请码 / 消息或记忆正文。
- 后端 7b58 整合 b136，客户端 885c 整合 a7f；初次 a7 于 12:58 上线，13:01 首条真实返回“收到”。随后真实第二条仍 preflight 超限且无模型调用，发送后 CKEditor 高度 0；这些失败证据保留，不以首次成功结束验收。
- 客户端 4d06 整合 0a1：摘要 / 详情弹窗、控制区滚动上限、编辑区最小可用高度。真实组件合成布局 6 项通过。后端 397dd 整合 7098：表格字段显式列名、sender 稳定身份字典、非空内容完整保留；协议按真实个人 / 群权限描述，canonical 校验继续独立负责权限和 payload。合成 8 条旧 human / model 后默认 4000 连续两次通过。根 CI 407 + 2，通过；13:31 的 7098 部署后两条真实问答成功，但自发送与异步高度使列表跳回旧消息，需手动滚动，继续修复。
- 计量复核发现固定官方 0.2.0-rc.1 TokenUsage 是 disjoint，旧 runtime 漏缓存读 / 写。fae481 整合 1c378：normalize 输入合计未缓存 + cacheRead + cacheWrite，以 totalTokens 一致性核对；输出已含 reasoning，不二次相加。缺失 / 非法 / 不一致计量拒绝接受结果，禁止假定剩余额度。固定真实 adapter + loopback 合成 SSE 与 API 累计预算 18 项 focused通过；根最终 CI 32 文件 / 419 项 + 2 项生产入口，类型 / 构建 / B0 / 契约通过。旧 usage 缺 cache 分项无法回算，本轮 IFRC 旧 failed 无可用余额，不回填历史。
- 客户端 954c 整合 979b：canonical 保存成功后发当前会话 / actor 的 scoped 跟随意图；Virtuoso 初始实际 LAST/end，真实正文与卡片延迟增高保持最新；主动上滚读历史立即停止跟随，路由 / actor 变化取消旧 RAF。真实组件明确合成传输 12/12、pageerror0，覆盖短 / 长历史、700ms授权正文、450ms turn、5 秒状态增高、历史阅读、迟到旧请求和 320px。首个 fixture 缺 nextCursor / alias 配置的工具失败证据保留，修正测试数据后通过，未据此改产品。
- 最终软件 `979b7c10afb0b75b2a72572431cc08fb5195cf47` 于 13:58 实际发布，前端 / API / worker 对齐。完整客户端整合 typecheck / build:web / 4 SDK 资源通过；镜像 `sha256:e2402ee40c51e050e40e1ab0597dbd756f2e675e629e034c0b93c9cd77da0caa`由旧官方依赖镜像离线 overlay 构建，新增 runtime 和 API 均真实编译。四个变更 src 在两容器 hash 对齐归档，精确公网首页与构建一致，其余六镜像未变。
- 新一致备份 `/srv/research-openim-backups/20261005T055755Z`：12 checksums / 9 gzip / SQLite独立恢复integrity ok / 迁移15；额外保留当前前端。前两轮本日备份也保留。两条最终实际请求后八服务运行、API healthy、JSON ready ok / 0.13.1、无OOM、源与首页再核验通过；未新增SSH或迁移。
- 真实 IFRC 用户已有登录页面依次发送两条自行编写的短测试，真实收到“收到一”“收到二”。最终 turn 6f77c6f7 的正规化 input895 + output21 =916，584ms；turn 82ce111b 的 input915 + output299 =1214，1531ms；各请求预算4000 / 90。全程无手动滚动、最新 gap0、编辑区85px；最新模型消息1/动作0/草案0。没有调用旧科研任务、建群、复制凭据或改变负责人会话/设置；历史失败消息保留。
- 本轮父目录 `.runtime/ai-reply-20261005` 保存三轮部署归档/回执、初版失败诊断、`ci-final.log` / `ci-continuous.log` / `ci-cache-final.log`、client各精确构建、`diagnostic-final.json` / `live-closure-ui.json` / `live-verified.json` 与最终截图。初次pnpm自动依赖验证NO_TTY中止及外层tar目录验证在解包前失败记录保留。前端专项在 `.runtime/ai-turn-feedback-review`，其中输入区 `footer-2026-10-05T05-15-49-126Z_7b770be1`、滚动 `scroll-2026-10-05T05-50-14-972Z_1afe3d77`。
- README / 当前状态 / 本文 / 部署记录同步更新，本地交接文档提交不重新发布软件；未推GitHub。浏览器开发插件缺失的合成UI检查采用既有Playwright/Edge，实际生产UI使用CUA。下一批仍需真实需求澄清、分组建议、人类确认、任务执行和科研交付闭环；本轮没有重测媒体或原生Electron。长上下文仍受保守UTF-8预留限制，后续精确计数需要官方匹配tokenizer，不允许字符除法、静默截内容或自动加预算。

## 2026-10-05：个人注册、联系人与自然聊天（本地完成，准备部署）

- 用户明确暂缓需求与写作流程，优先普通人与 Agent 私聊，取消强制实验室邀请码，将“实验室设置”改为个人“模型设置”。个人注册仅要求显示名、唯一用户名和最少八位密码；邀请码保留为可选加入团队入口。新个人账号创建隔离的个人空间，不获得 IFRC 成员、模型 Key 或历史数据权限。
- 全站联系人发现采用精确用户名匹配，展示人与其拥有的 Agent 公开档案；真人双向申请与接受，Agent 由拥有者批准。跨空间授权限于直接会话，撤销后同时阻断旧游标、映射和历史读取；群组、任务和材料继续遵守原空间权限。
- 自然 Agent 聊天使用独立纯文本入口，默认不携带任务意图、预算、材料和动作，不解析建群或执行 JSON。普通输入区保留文件、图片、语音工具，将科研协作折叠；真实排队、失败状态用中文反馈，成功回复显示为普通消息。原协调 Agent 身份、置顶及原账号映射保留，不伪造第二个联系人。
- 模型设置支持个人 DeepSeek、通义千问、豆包配置增删改、启停和默认选择；官方地址固定。Key 按账号、配置和服务商加密，接口仅返回已配置状态，不回显明文。发送者的个人 Key 不共享给 Agent 拥有者；个人选择开始后清空默认不会静默使用实验室 Key。既有账号尚未建立个人设置时保留原实验室模型兼容。
- 共享契约 `0.14.0`、聊天 `1.3.0`、显式迁移 `016`。迁移保留旧注册回执并使邀请码列可空，转换全局稳定联系人键，新增个人空间和配置表。当前线上仍为 `979b7c1` / 迁移015；本文的本地检查不能作为已经上线的证据。
- 总控共享代码受测提交 `4c82e24`，根最终 CI 34 文件 / 446 项测试、2 项生产入口测试，构建 / 类型 / 导出 / B0 均通过；保留初次旧契约版本断言失败记录。Qwen / Doubao 固定官方适配器的真实 loopback 合成 SSE 与用量测试 23 项通过；没有使用真实通义或豆包 Key，没有调用 OpenAI 或任意代理。
- 前端代码 `91a423a` / `008bb7f` 整合为 `c48e3a3` / `ddfe479`，总控精确最终客户端 typecheck、build:web 与四个固定 SDK 资源 / 静态引用通过。前端本地真实 HTTP / SQLite 17 组、明确合成传输的实际 React 组件10组、动画结束后的真实模型设置桌面 / 320px 截图2组通过。注册、好友申请 / 接受、模型 CRUD / 默认 / 请求迟到 / 删除、普通聊天输入与原消息组件均有证据。本轮没有真实 SDK、真实模型、媒体或原生桌面新验收。
- 浏览器开发插件缺失，开发联调用 regular Playwright；生产与阿里云界面用 CUA。设计概念和真实页面逐一核对。初期 HTTP 登录500原因未确认，后续同账号链条通过；首段13组后选择器中止由4组续跑闭合；合成移动设置截图继承错误服务商地址仅修正 fixture，真实接口地址正确。原失败报告均保留。
- 运行证据在父目录 `.runtime/personal-chat-20261005`：`shared-ci-final.log`、`client-final-typecheck.log`、`client-final-build.log`、`provider-focused-final.log`；`client-review/http-1791189881221`、`http-contacts-1791190145033`、`fixture-1791190161890` 和 `final-1791190622977`。运行数据、Key、构建包和截图不进入 Git。客户端文件依赖离线重建曾中止，最终使用既有 `D:/.pnpm-store`、下载0恢复成功；日志保留。
- 本地部署 helper 已通过8项实际旧 SQLite / 真实迁移CLI / WAL / 数据保持 / 回退测试及2项一次性迁移容器守卫。准备阶段只迁移线上只读快照；激活需暂停 API / worker / OpenIM、完整备份、显式016迁移，并在失败时同时恢复015数据库和旧镜像。尚未执行云端 prepare / activate，不新增 SSH 或改变已有云权限，未推 GitHub。
- 后续先完成新 ECS 发布、真实 HTTPS 个人注册 / 添加联系人 / 模型管理 / SDK消息验收，再验证现有 IFRC 的自然模型回复；Qwen / Doubao 的真实凭据验收、自定义接口和长上下文精确计数待后续。本轮不把模板填充或合成模型结果冒充真实科研任务执行。

## 2026-10-05：个人注册与自然聊天新版本上线、验收和收尾

- 上一节本地候选整合后固定软件 `68d0592de941fa0f47907ba9df6e86fddd83f250` 于17:33北京时间实际发布新ECS。前端 / API / worker同源，current和Nginx root为该release，API / worker镜像 `sha256:b9ecbbe826f4fa37126c98241b082cf780c370bb828596583226e60979c216fc`。契约0.14.0 / 聊天1.3.0 / IM桥1.0.0 / 显式016，旧站不变。后续本地交接文档提交不改变软件归档，未推GitHub。
- 源、Web和外层归档hash核验；云端由旧官方依赖镜像离线构建contracts / runtime / API，22份变更后端文件与源归档hash对齐。精确公网index SHA256 `896450e229d810aef3ed8c5747efe5482a50118725aaf17deedb019cff3dc090`，正常HTTPS ready / contract0.14、八服务运行 / 无OOM、另外六镜像不变。最终实际helper verify再次检查current / 镜像 / index / migration16。
- prepare在只读一致v15副本实际迁移016两次，旧表行hash、注册回执与精确联系人键转换保持；未写liveDB。正式activate暂停本项目API / worker / OpenIM，完整备份 `/srv/research-openim-backups/20261005T093246Z`：12checksums / 9gzip / 隔离SQLite恢复integrity ok / migration15。激活前70旧表2281行全部与迁移后逐hash对齐。更早prepare3136行的855差值经仅比较两保存v15快照确认只在临时chat_pages2168→1313，其余69表count同；旧代码TTL15m过期分页清理与该差相符，不将不同阶段总数当作迁移丢行。
- 失败记录按阶段保留：第一次prepare白名单遗漏contracts/package.json，无激活 / DB修改；修正为c211helper后prepare通过。首次activate即时公网仍旧hash，PUBLIC_INDEX_MISMATCH后015 / 旧镜像 / current恢复，但尾部health读取失败，writer停；77c守卫先核对准确v15与backup相等再恢复旧8服务。第二次670helper延长公网实际读观察，因release根700、www-data读index拒绝导致PUBLIC_INDEX_HTTP_ERROR，自动完整回退015和旧代码通过。明确新release chmod755且实际www-data精确读index通过后第三次成功。原失败v16及WAL / SHM、日志、backup均私有保留。
- 真正成功activate / verify使用helper SHA256 `67067eee5b4f7ad711eb9bc9b93027a4c2a03ce4621921e6e9d77f5e79ae1e1b`与父端权限修正；后续本地helper3f136c4增加prepare chmod和www-data门禁，未上传 / 未运行。不能用后续helper测试代替实际成功过程。数据库016回退必须连同015数据、旧镜像 / current / Nginx恢复，禁止只换镜像或down -v。
- 两个合成个人账号真实HTTPS / 独立Edge context14门禁闭合，最终run `dce9b912-4378-4ef4-a688-e582f988748b`执行12项，引用首个run已过的两个真实注册项，无重复注册或第三人。桌面 / 320px仅8位简单密码且无邀请码，7位在客户端拒绝 / 没有HTTP；个人空间普通member / SDK平台5。三家停用合成Key真实管理、不回显 / 空Key保留 / 移除 / 删除，第二人配置为空；未向三家模型发送测试Key。
- 精确全用户名发现与申请 / 对方明确接受，跨个人空间真实SDK普通文字甲→乙 / 乙→甲。双方相同clientMsgID / sendID / recvID / type101且双方status2，非fixture或注入。普通Agent输入草稿、折叠可选协作、320px编辑与发送保留；模型与高级写入均0，不能将这些草稿视为模型回复证据。
- 17:40 / 17:41 父端CUA使用真实IFRC原登录页面，普通文本输入连续两条自编短句，真实Agent先作自我介绍，第二条基于上一轮改为口语短句，正常消息气泡 / 编辑器 / 折叠协作可用。原Agent名字 / 身份映射和旧团队模型保留，没有读取 / 复制 / 更改真实Key、密码或账号设置，没有注销负责人。只证明日常连续短对话，不当科研任务 / 自动编排 / 交付收益的证据。
- 前端正常ResearchLogin与useGlobalEvents各自一次IM交换，真实每人2次；首次测试误假定1次，原failed报告保留，只修测试计数记录 / 后续不增加交换。按钮可选协作accessible name含down图标的精确选择器失败亦保留，续跑仅未完成项。报告序列化的status覆盖改为gate.status与observedStatus，原JSON另存；修正报告不重跑或构造结果。
- pageerror0。窄登录退出诊断仅用原QA甲，0消息 / 模型 / 配置写入；预期RAP401、浏览器禁止脚本关闭用户窗口提示已分类；登录还捕获 `Cannot read properties of null (reading 'map')`，准确来源未分类、未阻止14项，保留console-review.json作为下一批定位限制。不把未捕获异常0改写成console零日志，不反复重跑已通过业务。
- 两人实际UI logout200 / 原RAP session401后，父端以准确个人空间 / 账号 / username校验，经既有operate审计CLI停用两人（version2）；活跃RAP会话0、IMlease0，原合成会话 / 消息count保持，无邀请码使用。没有清空历史或停用IFRC。私有QA凭据与运行记录不入Git。
- 本机父目录 `.runtime/personal-chat-20261005` 保留shared-ci-final / client-final / provider-focused日志及本地 / 云全部成功失败证据；主要回执deployment-verified.json、preparation-and-rollback.json、saved-snapshot-counts.json、live-natural-ui-proof.json与最终closure.json，真实截图live-natural-chat.png / live-model-settings.png和cloud-review各桌面 / 手机截图。Workbench上传Session到期及多文件chooser不接受记录保留，正常刷新已有免密会话后单文件上传；未扩访问权限或新加SSH。
- README、current-state、追加日志、客户端与ECS说明同步当前部署；纯文档收尾只做内容 / diff检查，不重跑已通过根CI。下一批按用户优先自然联系人 / Agent体验，通义 / 豆包真实Key、自定义URL、长上下文精确计数、登录console诊断分别验证；媒体 / 原生Electron和真实科研编排暂未新验收，异地备份 / 全组件恢复未完成。
- 17:54北京时间清理后再次实际helper verify通过（八服务 / 镜像 / 源 / 精确index / HTTPS / migration16）。最终closure已汇总发布、14门禁、两轮IFRC、逐表count与审计清理事实；两个已停用QA的本机临时密码文件已按确切路径删除，仅保留不含凭据的清理回执。最后内容检查139 Markdown / 10 skill定义与git diff --check通过；纯文档本地提交，不重新发布或推送。

## 2026-10-05：纠正客户端交付重心

- 用户质疑持续优化网页，明确其科研微信期望是桌面客户端与手机App。核对本地完整OpenIM React/Electron源码：已有Windows打包 / 隐藏启动历史证据，最新68d软件仅完成网页真实线上验收，未交付新版桌面与手机App。
- 网页与Electron共享React界面，现有注册 / 联系人 / 模型设置改动可复用；桌面原生SDK、文件 / 录音、托盘 / 通知、重启会话及更新仍须对实际安装包验证。移动App需独立移动客户端 / SDK、设备后台与推送，不以320px网页代替。
- 当前状态 / 路线图已将下一批主交付改为Windows安装版对当前ECS的真实端到端验收，随后接手机客户端；网页版作为联调与备用入口。此次仅调整交接优先级，没有构建新包、安装、发布、迁移、调用模型或推GitHub；线上仍为68d软件 / 契约0.14 / migration16。
## 2026-10-05：先完善网页版与需求后的聊天形式

- 用户接受先把网页版做好，随后复用到桌面 / 手机，并询问个人助理收到一件事后是否创建新的Agent联系人并开始聊天。
- 只读核对现有源码：普通agentChatMessage是纯文本dailyChat，没有自动创建联系人 / 任务 / 群；createPersonalAgent接口与通讯录手动创建入口已有。自然需求到匹配 / 新建Agent / 开始专门会话的闭环尚未接通，不把手动基础当自动流程完成。
- 当前状态 / 路线图按最新指示恢复网页版业务优先。讨论建议是助理先理解，复用已有Agent或提出缺少的专属Agent档案，确认后创建 / 打开；简单事情留在助理私聊，单专业工作可专属Agent私聊，多角色用任务群。持续联系人与一次任务分开，避免每个需求产生一个重复Agent；此为待实现的产品建议，未修改业务或执行自动建群。
- 此次只读代码与交接文本更新，没有部署、迁移、模型调用、创建账号 / Agent或GitHub推送；线上仍为68d软件 / migration16。

## 2026-10-05：补齐可直接添加的科研聊天 Agent（候选）

- 用户指出没有可用成品 Agent，纠正此前仅讨论未来自动创建形式的缺项。本批添加文献阅读、论文修改、研究方案三卡及完整档案确认，从通讯录真实保存本人 specialist 并沿现有 direct / IM bridge 打开；不自动发消息、不为每次需求隐式新建。
- 前端 `d18f73d` 整合 `a9fcb28`，总控完整客户端类型、build:web / 四固定 SDK 资源通过。候选完整字段复用、成功保存后保留 ID / 重试只开聊天，以及 actor / 路由 / 关闭重开迟响应守卫已审查；渲染交互另由前端执行。本批无共享后端源码、契约或数据库变更，无需重跑根共享 CI。
- 既有后端 52 次真实 loopback HTTP / SQLite、七门禁 / 四合成 model callback 通过：三份精确档案进入 requestedAgent，主人私有记忆与跨空间获准访客 direct / 模型配置隔离，稳定 direct、未配置模型 / IM 明确 unavailable，plans / actions / tasks / jobs 均0。未调用真实厂商或实际 IM Server；不当作模型质量和 SDK 连通证据。
- 证据在父目录 `.runtime/agent-starters-20261005`：`root-client-verification.json`、`VERIFICATION.md`、`local-http-KiLmLx/report.json` 与实际模块hash。云部署准备为只更新客户端 Nginx root，不改 backend current、八个容器、配置 / Key 或迁移；部署前实际baseline核对仍为68d / b9镜像 / 896450e2首页。本节尚未表示云发布完成，未推 GitHub。

## 2026-10-05：科研聊天 Agent 入口上线与真实私聊验收

- 前端候选d18整合a9后固定部署源码 `a25ee9bdf1601f81fce78f6028216b9aed9db792`，于20:34北京时间实际静态上线。Nginx指向client-releases/a25.../clients/openim/dist，后端current仍68d，API / worker b9镜像与其余六镜像全部不变；八服务running / 无OOM、API healthy、HTTPS ready / contract0.14、精确公网首页 `dcc6cc772661fcd8fe957f2935989abcce2e154a5117c2382990264dad390565`验证。无迁移 / 服务重启 / 新SSH / Github推送。
- 发布源 / Web / 外层包逐hash，release目录755 / www-data实际读index、nginx -t / reload、health和所有镜像守卫实际通过。云部署helper85ea811dd95b...，Nginx备份 `/opt/research-openim/ops/agent-starters-a25ee9bdf160-20261005T123403Z/research-openim-production`。本批仅静态回退，不改schema16数据库或后端current；不能套用上一批015数据库回退流程。
- 真实本地客户端16组闭合：首eccaa936前8项成功后测试误找原自定义表单取消按钮中止，续417358bc同账号8项 / extra create0通过。中间记忆按钮空格和regex转义失败及harness早期相对Tailwind漏样式原样保留；仅修测试配置 / 选择器，不重跑通过业务。首report direct计数器写旧path故显示0，实际canonical响应 / 同ID独立证明保留，续正确；不改写原报告。最终完整样式桌面 / 320px与确认可达，pageerror0，Antd / Router警告保留；无本地SDK / 模型调用。client说明681整合424只本地收尾，不重发布。
- Workbench文件上传Session到期，正常刷新原免密连接后39.6MB单包上传完成。文件页隐藏Terminal导致一次fill选择器中止，切回已见终端后核验 / 解包 / 发布；原动作没有误执行或权限扩大。外层及helper哈希实际云回执在outer-verified，静态部署实际成功回执在deployment-verified。未新增SSH或修改用户Workbench页。
- 原真实IFRC曾弹另一设备登录提示，本批正常刷新现有页面后会话恢复，不需要提取或重输真实密码 / Key。20:35实际通讯录出现三卡并添加“文献阅读助手”，真实SDK直接会话打开、发送一次自编植物光照摘要，收到真实模型四点阅读梳理，区分事实 / 推断 / 未提供资料。20:36重选本人已有档案后相同SDK会话及历史恢复。没有自动消息、任务 / 群或运行工具；该真实联系人保留给用户使用，不当作一次性QA删除。另两预设只有可选入口与本地精确档案验证，未分别调用真实模型。
- 实际截图live-agent-catalog-added.png / live-agent-chat.png、DOM / live-ui-proof.json均在Git外父目录 `.runtime/agent-starters-20261005`，没有新建测试云账号、改真实模型配置或读secret。5项发布helper局部门禁测试与实际云运行回执分开记录。README / current-state / roadmap / brief / client / ECS说明同步，剩余自然需求自动匹配 / 建Agent、联网 / 文件工具、自主科研执行和原生端仍未实现；日常角色回复不代替科研正确性与小组收益验收。


## 2026-10-05：加号菜单与聊天媒体入口（候选）

- 用户要求调整OpenIM的“＋”交互。桌面顶部和320px导航提供添加朋友 / 创建Agent / 发起群聊；朋友直接查找，Agent消费一次查询参数打开现有表单，群聊沿用ChooseModal。输入区一个加号展开图片 / 文件 / 语音，文件系统选择器调用既有消息构造与发送，语音先显示面板再显式申请麦克风。会话世代守卫阻止换会话后迟返回文件发送。
- 最终客户端类型 / Web构建 / 四个固定SDK资源通过。实际组件九组本地检查通过，API / SDK / 媒体均明确合成；pageerror0，React Router future、Antd WaveEffect弃用与故意旧文件拒绝日志保留。没有真人麦克风、云文件投递或新建群 / 联系人验收动作。证据在父目录 `.runtime/plus-menus-20261005/run-e79b8d07-2941-46b1-8aca-8964c3fa8d08/report.json` 和桌面 / 320px截图。
- 原分页fixture缺nextCursor / 关系枚举错误、按钮选择器 / 嵌套Upload按钮、构建并行触发Windows wasm watcher EBUSY、fixture漏AntdGlobalComp和全局窄屏样式的中止证据均保留；修正产品的媒体单按钮后，补完整实际公共包裹才完成最终检查。不能把这些 failed 原报告改成 passed。
- 只改完整客户端与说明，无共享契约、后端、runtime或SQLite变更，不要求重复根CI；对应后端0ea的共享CI457 + 2仍为历史证据。本节为发布候选，线上基线0ea / 949镜像 / 契约0.15 / schema16不变；静态发布完成后补确切源码和公网hash。未推GitHub。


## 2026-10-05：加号菜单静态上线与Edge验收

- 23:20:31北京时间，固定前端 `e536e759a71f59f244d740d2bfe25f2e5812bf56`实际上线；Nginx转到client-releases对应dist，后端0ea / API及worker949镜像、其余六镜像、schema16 / contract0.15保持。所有八服务running / 无OOM、API healthy / HTTPS ready0.15、www-data读取和公网精确index `ad9776effd48d619a731994b8e05dee5e4c7fe8315e0a803b711b4384fd8cdaa`通过。
- 外层 / helper / 源码 / Web checksum、限定5成员展开、原后端current / 旧首页7bcd46及全部镜像守卫、nginx -t / reload / 最终新首页验证通过。Nginx备份 `/opt/research-openim/ops/plus-menus-e536e759a71f-20261005T152030Z/research-openim-production`；仅静态回退流程，保留现有数据库，不套用旧015恢复。没有迁移、容器重建、SSH授权、端口调整或GitHub推送。
- 用户现有正常Edge登录的八组菜单验证完成：顶部三项、准确用户名查找自动聚焦、创建表单打开 / 取消刷新、实际建群选人窗、Agent私聊三媒体卡、语音控件显示 / 关闭。只打开 / 取消，没有创建联系人 / 群、发消息、调用模型、发送文件或真人麦克风。首次刷新后菜单选择过早中止保留；等待现有页面就绪再展开通过。代理Workbench已关闭，用户原终端保留，真实Agent页面保留两处菜单作为交付。
- 本批最终客户端类型 / Web / 四SDK资源、本地九组合成API / SDK / 媒体检查与实际线上入口证据分别记录；pageerror0仅指本地报告，不冒称本轮云console全零。API对应根CI457 + 2是历史已通过证据，本批未重跑。旧fixture / watcher / 嵌套按钮失败均保留，真实媒体、原生客户端与自动科研执行范围没有扩大。
- 总控父目录 `.runtime/plus-menus-20261005` 保存bundle / outer / deployment、root-verification、九组最终报告及八组live-ui-proof，最终截图 `live-plus-menus.png`。README、current-state、客户端与ECS说明同步，文档收尾仅本地提交，不改变e536软件归档。下一批继续自然聊天与已有联系人体验，需求编排暂缓；真实云媒体如后续改逻辑须另验。


## 2026-10-06：文件发送、Agent 阅读、范围与真实回复

2026-10-06，Agent 文件聊天最终软件 `3b18c6883428f2f00bfbd61d8cce51195011b842` 已上线。个人 / 专属 Agent 私聊发送含文字 PDF 或 UTF-8 TXT / Markdown / CSV 后，真实 SDK 成功才开始解析和模型阅读；范围、部分读取与失败明确显示。默认总预算仍为 4000 / 90 秒。旧 SDK 对象网关需要重定向时，可使用“从本机选择阅读”，只重读原附件，不重复 IM 投递。详见[文件聊天交接](development/agent-file-chat.md)。

最终共享 CI 473 项 + 2 生产入口、客户端类型 / Web / 四 SDK 资源通过；原首版两页 PDF 的真实模型失败保留。最终线上合成验收结果：0977381版本真实 SDK 上传936字节合成两页PDF后自动回复成功；最终3b18c68版本沿同一合成附件追问第2页，真实模型回复明确该页提取文字完整并指出tiny sample，当前消息范围第2页0–54与服务记录一致。没有读取、复制或改变真实 Key / 密码，没有新增云测试账号或推 GitHub。

- source `3b18c6883428f2f00bfbd61d8cce51195011b842` / API-worker `sha256:83797932607e2490c42c6ad1a434cca766fb909ad96ab6382eed1943b9904afc` / index `4816189592b6af038ed4ff46204447db51a7b76afa44e4212049719345f28d0d`。上线后8服务、healthy/ready0.16、schema16、源/镜像/运行容器checksum与其他六镜像不变通过；无迁移、新SSH或GitHub推送。
- 原802首版00:53上线健康但07:38实际模型 `INVALID_MODEL_OUTPUT`：2页107chars完整提取，usage840+801/5686ms，没有可用回复。固定official Harness loopback确认默认thinking/high的reasoning-only max_tokens会被旧runtime误当成功空正文；线上原正文未存，原空正文原因明确为推断。最终DS daily文件阅读以公开off配置直接回复；任何max-tokens结束不当完整答复，保留usage并显示预算失败。只记录private阶段/字数/finish/cap，不存模型原文或凭据日志。
- 最终共享CI、客户端类型/Web/四SDK、本地后端203原测试+修复专项、前端13原组+4真实HTTP解析组+3详情组与真实云模型/SDK分别记录；SDK/ModelCall合成的本地报告不当厂商调用证明。所有failed/aborted报告保留。
- 停写一致备份 `/srv/research-openim-backups/20261006T003325Z` 的12checksum/9gzip/隔离SQLite恢复及16迁移校验通过。回退a536/0c4b07/旧Nginx保留当前schema16数据；完整栈恢复未测。范围修正新增每页实际提取字数，partial指整份文件；每轮消息展示自身读取范围，上传回执单独标识，实际最终页码/完整性追问另证。源候选c459 / root0e728完整CI473+2，前端f927 / roota536类型/Web/四SDK通过；原3范围组件组第三选择器失败保留，接续3组成功。097在08:02实际上线，SDK/PDF/两轮模型成功但范围语义问题原样记录；a536在08:20上线后真实模型仍误称第2页未完整读取，f5095fdb及失败截图保留在 agent-file-scope-20261006。最终改为后端计算每页完整性和自然语言范围，当前范围事实明确覆盖历史错误回复；最终真实复验见 live-ui-proof.json；上传NoSuchKey/Session过期通过正常连接恢复。证据与最终页面截图见Git外 `.runtime/agent-file-scope-final-20261006/live-ui-proof.json`。
