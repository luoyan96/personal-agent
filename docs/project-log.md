# 项目进展日志

## 2026-10-08：工作台/广场生产升级与Windows0.5.1正式发布

- 用户明确授权现有Edge阿里云维护会话，已实际备份并升级API/worker为5c949980 / 同镜像0c692917，019/020已迁移，contract0.21/chat1.10/schema20、公开ready200。备份隔离研究库恢复读取、重复迁移、78旧表行/hash与旧迁移记录保持、FK/integrity通过。详见[部署收据](deployment/personal-agent-social-workspace.md)。原IM/组件镜像、凭据/端口及其他网站未改。
- Workbench NoSuchKey、完整源包慢传、匿名Mongo卷预检、SQLite只读WAL备份失败及恢复查询失败、非执行脚本权限错误均保留。SQLite失败后schema18未迁移，旧服务恢复；改为只读查询+可写文件系统并修正恢复退出，再执行完整备份/切换成功。不能把中断视为零停机；未做完整组件或异地恢复演练。
- 2026-10-08 10:03:02–10:03:25北京时间，两个合成个人账号16项真实HTTPS检查通过，包括跨空间联系人/Agent同意、真实OpenIM回调/身份/群与私聊同步、任务群/承接/指定结果验收、重复提醒管理和实际到时后台投递im_sent（一次run、无模型turn）。公开撤回、两安排inactive、两会话logout，账号和审计历史保留；无用户账号/Key/文件、无真实模型、SDK媒体未测。子任务sandbox EACCES零注册和工具status覆盖导致汇总15的原报告保留，root同脚本完成后仅修正报告为16/16，未重复请求。
- 0.5.1固定运行源码784de423已推送标签；Windows安装包86296322字节、SHA25671d1086c9538effb756ab710d8751ec53c21d8f6f6d9596905fa74368fd58117。NSIS/更新清单和实际包登录页/native桥通过，三个受限GPU失败保留，同包正常宿主原参数通过。GitHub三平台37714297856全部通过；四发布资产size/digest核对、公开latest与下载清单0.5.1通过，**10:08:00北京时间正式发布**。PR20仍草稿、未合main，v0.5.0固定标签及0.4.0旧草稿保留；未安装/重启用户软件。
- 证据在Git外 `.runtime/desktop-social-workspace-20261007`（云/发布、backend/live-20261008020302496_4ff920cd）和 `.runtime/desktop-social-workspace-20261008`（0.5.1兼容UI及打包）。历史候选/失败事实保留在后续条目；新的AI以当前状态和本批收据接手。

## 2026-10-08：工作台/广场版本不匹配修复与授权部署准备

- 用户已授权Edge阿里云维护会话的备份、API/worker成对升级及019/020。现有API镜像实际d56ee747、公开ready0.19，桌面新列表404不是账号资料丢失。固定5c949980后台源码子集627743字节、SHA256 a3370b55e3390e45966cf2394423020429992a1242c97d416abc26ba26b8b80d在服务器校验通过；Workbench文件网关NoSuchKey、完整包单连接过慢的失败证据保留，改用公开源代码资产。GitHub推送恢复，v0.5.0与草稿PR20已建立，生产切换仍在执行。
- Windows0.5.1增加公共ready版本检查、旧服务明确更新说明、停止不兼容读取/创建/公开、本机报告独立可用，以及权限错误保留。8项隔离界面检查和renderer类型通过；旧health与权限响应受控，0.21工作台/广场数据走真实HTTP/SQLite。SDK与native桥合成，没有用户资料或真实模型调用。证据在Git外 `.runtime/desktop-social-workspace-20261008/frontend/availability-7a3b25cf`；尚不把本地验证称线上验收。打包/迁移结果随后记入收据。

## 2026-10-08：Windows 0.5.0 人与 Agent 协作工作区

- `feature/desktop-social-workspace` 合并 0.3.3 的设置/更新和 019 定时任务基础。桌面使用消息、通讯录、工作台、广场四入口；微信式灰白绿、紧凑会话列表、方形头像、直接文件/图片/语音工具栏。实际历史搜索、引用、SDK 置顶/免打扰、分页群成员、连续输入/流式/发送恢复接入现有聊天。
- 统一人和 Agent 的名片、创建/导入/兼容外部连接；本人能力明确公开或撤回，公开广场联系请求与本人同意后聊天。工作台展示实际提案、参与、群聊、运行、结果、指定消息验收，以及定时管理和当前身份原生报告。显式迁移 020，contract0.21/chat1.10；旧科研任务/资料/记忆权限保留。社交群中本人明确选择的自有 Agent 直接加入，其他人/Agent 仍须同意。
- 群里开头 @一个已加入的站内 Agent 可请求处理；普通聊天和 @真人不调用模型。引用内容追加在原消息后，UTF-16 提及位置不移位。外部 Agent 仅支持既有 chat_completions 连接和逐次转发同意，不开放群资料自动外发，不宣称新接入 CopilotKit/AG-UI/A2A。
- 最终工程检查通过：45 文件/568 项、2 项生产 020 CLI/HTTP、B0 真实进程、Web 生产隔离；renderer/Electron 类型、引用恢复 3 项、群提及 6 项通过。旧 accepted 跨空间 plan:null 的 403 测试期望经实际授权讨论群断言更新；待同意、科研资料、私有记忆和撤销后的边界仍拒绝，首次失败证据保留。
- 真实 React/HTTP/SQLite 通讯录、任务、广场等 12 类交互分段闭合，pageerror0、1024×726 无横向溢出。隔离 Electron22 的聊天连续输入、流式、持久回复、SDK 免打扰、授权搜索及任务群 @/worker 结果关联通过；SDK 网络、原生报告桥与模型厂商明确为合成端口。Antd/Router 警告和夹具选择器失败保留。截图经过查看，未操作用户账号、模型 Key 或正常窗口。
- 第一份实际 NSIS 候选通过资产门禁，但打包启动检查发现 preload 运行时导入浏览器 WASM SDK，在页面 URL 就绪前初始化 worker，出现 Invalid URL。preload 改为纯类型导入并使用 OpenIM 原生平台 ID；Electron 类型通过，重新生成安装包。隐藏窗口截图超时和诊断脚本 require 未定义是检查夹具错误，证据同样保留。
- 证据在 Git 外 `.runtime/desktop-social-workspace-20261007`、`.runtime/desktop-social-workspace-20261008/frontend`、`.runtime/desktop-chat-final-review-20261008`。Windows 候选另存 `PersonalAgent-Windows/0.5.0`；最终资产摘要、固定源码及发布收据随后补充。用户正常客户端未安装或重启。
- 云端此前记录仍 API/worker94b26d1、contract0.19/chat1.8/schema18。019/020 尚未执行；已有私有 Workbench 会话访问的自动审批拒绝未绕过，已明确询问本次备份、配对服务升级及两项迁移授权。服务器达到新版契约并验收前，0.5.0 保持安装候选，不公开自动更新。

- 最终重打包实际启动通过：原生 SDK/preload 桥可用、平台ID3、登录 UI 正常；未登录 session401 保留。修正预加载后，打包运行暴露 SDK 必需 peer 未入包，构建依赖闭包现包含非可选 peer（Electron 自身除外），恢复 53 个实际已安装运行包，随后启动通过。最终 NSIS 86,295,352 字节，SHA256 `8baa1eeedbebc944e58bbaac47421cf7a5da7380c5ef3967d0151da79998ff49`；exe/blockmap/latest.yml 门禁通过，四资产另存0.5.0目录。2026-10-08公开云ready实际200/contract0.19，未把登录启动称为新版服务器验收。

- 本地运行提交 `5c9499800ec71f6b6ad444b2e9d89ba06d9a4808` 与标签v0.5.0固定。GitHub正常授权推送返回服务器内部错误；分开ref以及HTTP1.1/非thin完整pack定向恢复仍失败，远端API未找到该分支/提交。没有创建PR或Release草稿，不声称源码已上传。收据 `.runtime/desktop-social-workspace-20261007/github-push-final.log`；固定源码tar摘要 `c7bea17d666eb156735ca83f408a1243c26f3789411298232f48c1e027b17c26`，019/020部署计划已准备但未执行。自有4518/4519测试服务已关闭，用户软件未触碰。下一步：取得私有维护会话明确授权、完成配套部署、恢复GitHub上传/PR、验证公开更新资产后发布。

## 2026-10-07：Windows 0.3.3 固定设置 / 版本更新入口

- 22:21:46北京时间正式发布 [v0.3.3](https://github.com/luoyan96/personal-agent/releases/tag/v0.3.3)，源码 / 标签固定 `1fbb238ddc274bb7388d431756cd7d010ad37f13`；4个公开资产的size / SHA256 digest与本地一致，latest正确为0.3.3，0.4.0保持草稿。[PR19](https://github.com/luoyan96/personal-agent/pull/19)已创建 / 附加且未合入main；Foundation checks37635589030读取时运行中，未宣称全部CI通过。草稿未生成标签时按tag读取404，改为按发布列表读取准确ID核验后发布；未绕过资产门禁。

- 用户要求左下角设置内随时可检查更新。分支 `feature/settings-version-updates` 从已发布0.3.2的6448412建立，新增固定“设置 → 版本更新”，同菜单保留模型设置。展示原生真实版本 / 检查结果 / 发布说明 / 下载进度 / 安装重启，设置红点与原左下角提示共用一个订阅；晚到快照不覆盖新状态。打开更新页会检查，下载中 / 已完成保留候选，关闭页面不重复下载。保留启动15秒、6小时、唤醒检查及原生重启确认。
- renderer / Electron类型与既有5组控制器检查通过；真实Electron22 / Chromium108生产React / 原生IPC / preload方法 / 控制器18项定向交互完成。两次QA选择器重名失败保留，仅补余下安装确认、免安装指导、迟到快照与最终截图。最小1024×726及1280×820无溢出 / 遮挡，pageerror0；截图发现Badge图标颜色继承问题后修正并专门检查。开发Router / CSP / Antd告警保留，不称console全空。Browser插件不在环境中，使用隔离Playwright Electron，发布端口 / 安装资格 / OS响应及无关聊天均合成，未真实执行下载或安装器，用户profile和软件未触碰。
- NSIS安装包及更新清单门禁、源码 / 资产SHA与GitHub收据保存在Git外 `.runtime/settings-version-updates-20261007`，正式源码以v0.3.3标签为准；另存 `PersonalAgent-Windows/0.3.3`。仅客户端变化，不改契约、数据库或云端。旧版先经托盘或安装包升级一次，再出现永久设置入口；待发内容需要用户先复制保存。
- 定时任务PR18 / 0.4.0仍独立待部署，migration019与云端Workbench明确授权未完成；现有0.4.0草稿不公开，本批0.3.3兼容线上contract0.19 / schema18。交接入口分别记录，避免将安装包生成或GitHub推送误称为云端上线。

## 2026-10-07：重复提醒与定时 Agent 执行（本地候选）

- 固定候选 f91b9d552c4f786b61434718dea114187ca9e1d2 已推送[PR18](https://github.com/luoyan96/personal-agent/pull/18)，Windows0.4.0草稿四资产全部uploaded，大小 / GitHub SHA256摘要与本机一致。安装包86290794字节、SHA256 `3d522eacce1a9242db2b84b6c02db16c858d1bce65277d80497759f63a2e6a2c`；公共自动更新仍0.3.2。部署计划 / Git归档及上传核对收据Git外保存，维护会话权限已提出明确请求、尚无答复，没有接入生产。
- Actions37628593268的两Ubuntu完整CI通过；Windows545项通过，唯一旧001→019磁盘迁移框架5秒超时。只增加这一测试harness期限到20秒，生产期限和全部断言保持；实际窄迁移检查1项通过 / 9项未运行。运行源码保持f91b9d5，未重打包 / 放宽服务限制或绕过main门禁。GitHub后续修正检查另读实际运行，原失败日志保留。

- 用户要求补齐定时能力。分支 `feature/recurring-agent-tasks` 基于6448412，Windows候选0.4.0；contract0.20 / chat1.9 / 显式019。详情见[定时任务交接](development/recurring-agent-tasks.md)。尚未云端迁移 / 发布公共桌面更新，线上仍94b26d1 / schema18。
- 增加日 / 周多星期重复、自然语言明确时点保存、指定本人站内Agent的有界文字任务、持久运行历史及暂停 / 修改 / 恢复 / 结束。历史018提醒默认不重复，019只新增发生表 / 索引。当前权限和原有模型 / 聊天栅栏保留，服务输入只授权准确匹配保存安排的发生轮次。
- 每次发生事务去重、逾期合并一次、下一未来本地时间、DST歧义跳过、安静时段延后；失败 / 未知用量不自动重新调用，模型不可用 / 聊天忙明确记录。暂停 / 修改取消未完轮次，迟到结果不能写入。隔离恢复暂停全部active安排。
- 新增8项真实HTTP / SQLite / 实际ChatWorker合成模型专项通过；最后工程44文件 / 546项通过，生产入口019同步后2项、B0进程 / Web隔离通过。第一次新增表fixture遗留、service输入原仅允许human、旧迁移 / 契约数断言失败均修正并保留原证据；生产断言18失败导致打开库未关闭，Windows清理报EPERM，该断言修正后通过，没有放宽权限或生产时限。
- 桌面左侧“定时任务”与创建 / 编辑 / 运行记录表单接入生产组件。renderer类型、13项隔离Electron22 / Chromium108生产组件交互、实际Windows0.4.0 NSIS打包通过；修改 / 暂停 / 恢复 / 取消、保存失败保留原文、1024×726无横溢出，pageErrors0，截图已查看。开发Router / CSP / Antd警告及故意503保留。初次加号按钮可访问名、Select内输入点击受覆盖、旧Vite契约缓存、编辑文字多匹配失败报告保留；辅助fixture修正未控制用户窗口、账号或Key。证据Git外 `.runtime/recurring-agent-tasks-20261007`，候选安装文件另存 `PersonalAgent-Windows/0.4.0`。
- 不能读取关闭客户端后的本地文件夹，也不新增搜索 / 通用工具 / 外部Agent调度 / OS通知。以现有模型和近期有界聊天文字生成结果；合成检查不能替代真实云模型验收。生产先备份 / 019迁移 / 配对API-worker发布，后公共桌面更新；schema19库不能直接回退schema18镜像或覆盖旧快照。

## 2026-10-07：Windows 0.3.2 发送恢复

- `fix/desktop-send-recovery`基于e1d38de：普通请求30秒总期限、附件120秒，包含会话准备与正文。取消传播到fetch；保留原文、原请求和原编号，手动重试核对原结果；不自动跳过失败前句。SDK文字同样有界且保留原nativeMessage。切换联系人暂停原记录，新scope不被旧pump锁住，迟到回执不能删除暂停记录。
- 独立恢复卡完整呈现错误、原文、重试和移除本地记录；“停止等待”不声称撤回服务端消息。原生代理处理半截响应和总期限，诊断日志仅传输元数据。固定TLS / Origin / cookie规则不变。
- renderer / Electron类型、生产API合成传输6项、生产proxy本地真实HTTP / 合成上游4项、Electron22 / Chromium108生产组件16项通过，pageErrors0；minimum1024×726与1280×820无遮挡，截图已查看。真实无凭据云 / 桌面proxy ready200 / 0.19、session401、无效POST400快速响应。未使用真实账号 / Key或发真实需求，不把合成回执称模型成功。
- Git外`.runtime/desktop-send-recovery-20261007`保留证据及打包发布收据；CJS测试准备、fixture注释 / 缓存、宽API glob误拦源码失败保留。浏览器维护读取遭自动审批拒绝后提出明确授权请求，桌面工作继续，未绕过拒绝；那次云端具体故障尚未证实。两个交接文档补丁因标题不匹配未写入，改用准确标题后成功。
- 无共享代码、SQL或后台部署修改。升级前复制旧版未确认需求：现有待发sessionStorage不跨软件重启。v0.3.2标签与Release / Git外收据记录准确软件与资产，main保留合并门禁，既有Windows基础CI超时不通过放宽生产期限解决。

- 实际NSIS构建、更新资产门禁、隔离profile包启动通过；启动日志保留受限网络EACCES与有效元数据，不把启动判为云端回复。exe86286669字节，SHA256 `c0ecd187b8a5e84f37a8f652a99089c7a55d582a3874b6cf43e41a29fb38d6c2`，另存`PersonalAgent-Windows/0.3.2`；未安装 / 重启用户软件。Git外发布收据记录源提交、PR、CI和公开资产最终状态。

## 2026-10-07：Windows 0.3.1 左下角更新按钮

- 用户明确要求做好窗口左下角更新入口。分支`feature/desktop-update-button`基于main6122b91，客户端版本0.3.1；复用原生真实更新状态，增加只接受固定动作与同一候选版本的主frame IPC和preload方法。React先订阅再读取快照，并以revision避免迟到快照覆盖新进度；左下角发现新版 / 下载百分比 / 重启更新 / 失败重试，页面重开不重下。自动检测不打断聊天，手动托盘原生入口及明确安装确认保留。
- renderer与Electron类型、既有5组控制器检查通过。真实Electron22 / Chromium108运行生产导航、主进程、IPC、preload方法和控制器，17项定向交互通过，1280×820无横溢出、按钮在左下角、pageerror0；过时候选 / 完成前安装 / 非主窗口均拒绝。发布执行器、安装版资格及OS响应为合成；安装器仅验证调用次数，未真实下载或安装，不能宣称旧安装版升级重启成功。
- 实际NSIS构建、清单 / 安装包 / blockmap与公开GitHub更新源门禁通过；安装包86287581字节、SHA256 `bd7702604c996910baecef8d68c28f12b29a001486870aec6284637d2c945d89`，本机`D:/deepseek-agent/PersonalAgent-Windows/0.3.1/ResearchWeChat_0.3.1.exe`。源码发布以`v0.3.1`和Release固定，后续Git外发布收据记录精确源码、PR / CI、公开资产与最终状态；无共享代码 / 服务端 / 数据库变更。
- Git外`.runtime/desktop-update-button-20261007`保存类型 / 交互 / 截图 / 打包 / 清单门禁，首次QA依赖解析失败、截图补拍字段遗漏、默认进程读取拒绝均保留失败记录。改正合成服务结构后只补拍按钮截图；残留自有验收进程已单独确认并清理，Vite已关闭，正常用户程序和账号未触碰。旧版须先更新至0.3.1，之后才能使用新按钮。

## 2026-10-07：Windows0.3.0桌面界面与真实状态呈现

按用户要求，前端交给gpt-6.1-sol / high，独立分支`feature/desktop-agent-interface`；总控生成并检查完整设计参考、审查实际截图、修正汇总计数、打包与整合。桌面发布源码以GitHub `v0.3.0`标签及Release为准。当前交互机制及CopilotKit / AG-UI后续适配边界见[桌面说明](development/desktop-agent-workspace.md)。

- 深色72px导航、300px会话栏及真实会话搜索，模型设置 / 添加联系人 / 创建或接入Agent均接已有动作。聊天头部、圆头像、蓝白气泡、Markdown及168px输入区统一；直接媒体 / 文件工具栏，群聊保留作者身份。
- 既有模型增量以带头像的消息呈现；文件任务阶段 / 当前资料范围 / completed与total / 取消 / 报告均在可展开聊天卡呈现。计数按分析步骤而非文件数，最后汇总成功后计入completed；本机保存成功才显示完成。原生报告真实错误保留可读原因，移除IPC前缀。没有替换服务鉴权、授权目录或OpenIM投递机制。
- renderer最终类型通过。真实Electron22.3.27 / Chromium108生产组件17项定向交互通过：已有会话搜索、任务详情 / 完整范围、生成中连续草稿、同身份报告打开及失败清理、生产runner精确取消、群聊作者、模型设置及人与Agent联系人添加 / 搜索，pageErrors0。1280×820、72 / 300 / 82px布局、168.24px输入区、无横向溢出；概念与实际聊天 / 联系人截图经view_image检查。Browser skill不在会话工具中，因此使用隔离Playwright Electron；SDK / HTTP / 报告桥明确合成，没有使用真实账号、Key、资料或模型。
- 总控修复completed计数后，仅运行已有真实长文件→合成模型→持久报告用例，完成数与真实提交次数 / total一致，专项1项通过。没有重复旧整套文件/原生验收。开发Router / CSP / Antd废弃警告保留，不能称console完全无输出。
- Windows0.3.0实际NSIS打包及只读发布门禁通过；EXE86284271字节，SHA256 `69e561754a6222e620ab274d0f9bfaba71221cd9d2ee6d020726ec7c2292565a`。exe / latest.yml版本、名称、大小 / SHA512、blockmap、公开GitHub更新源均一致，无嵌入Token。安装文件另存`PersonalAgent-Windows/0.3.0`，用户正常客户端未被安装或重启。
- 隔离UI fixture首次宽API路由误拦源码、缺失早期监听、窗口发现超时、缺失合成原生桥以及取消文字多匹配的失败报告保留；均没有改动用户正常窗口。最后独立原生runtime成功检查，静态补拍只记录capture结果。自有Vite / Electron均已关闭。
- Git外`.runtime/desktop-interface-20261007/{report.json,chat.png,contacts.png,capture.json,*failure*.json}`及`.runtime/desktop-ui-refresh-20261007/{concept.png,final-renderer-types.log,analysis-counter-test.log,windows-build.log}`。源码无fixture、截图、模型凭据或用户资料。此批不连接CopilotKit / AG-UI，不执行后台部署 / 数据迁移；正式发布及自动更新文件另外记录。

## 2026-10-07：Windows桌面0.2.0与文件工作区

按用户“集中做好桌面端、先不管网页手机、不反复扩测”的要求，完成本批客户端/Electron改造，独立分支`feature/desktop-agent-workspace`；安装包发布源码以`v0.2.0`标签为准。说明见[桌面文件工作区](development/desktop-agent-workspace.md)。

- 桌面携带自己的React界面，通过精确本机origin/固定HTTPS API代理连接已有后端；服务会话Cookie按服务域名区分。默认窗口1280×820，标题栏去除无功能空白框、提供联系人入口和Agent创建/接入；头像文字缩短，聊天安全Markdown排版，工具栏直接显示，输入区与技术/阅读回执收紧。
- 所选文件先全部本机读取成功，再逐段提交既有Agent附件接口。每段12000字符、最多40步源资料分析，必要时分层汇总。切换聊天继续原目标，换身份停止后续；模型状态/实际段落范围来自服务，失败不伪造报告。退出程序后本地后续编排不恢复，已提交聊天/已保存报告保留。
- 原生报告桥保存Markdown/转义HTML，账号和聊天分区、固定自身生成路径、checksum及重建模板核验。可列表/打开/定位。源文件保持原样，支持文字PDF/DOCX及UTF-8文字；工作区单文件提取20万字符/512KB，原合并52KB模式保留。无OCR、通用Shell/浏览器/MCP能力。
- 客户端与Electron类型检查通过；最终集中专项3项通过：本机Origin/代理/会话隔离、真实长文字尾段→合成模型分步→持久报告、真实报告FS隔离/转义/篡改/路径。实际86MB Windows安装包打包成功。原生程序7项核心检查通过：本地界面/隔离preload、生产HTTPS公开健康、原生PDF/DOCX列表及完整提取、真实报告保存/列表/自身HTML打开、renderer未捕获异常0；模型编排测试为合成响应，不宣称真实模型质量验收。
- 首次空配置的Cookie迁移放在首次导航前曾使隔离程序等待，已调整加载顺序并重新打包；早期启动失败证据保留。最终核心检查后的隐藏窗口截图超时单独记录，没有将截图计为通过，也没有为可选截图再跑整套。旧启动烟雾检查通过，但不足以代替本批新增桥接与业务检查。
- Git外证据：`.runtime/desktop-modernization-20261007/{tests-final.log,build-final.log,native-core-report.json,native-core-initial-failure.json,native-core-capture-limitation.json}`和`core-*/core-report.json`、`backend/review.json`。安装包另存`PersonalAgent-Windows/0.2.0`；未使用用户真实目录、Key或新增服务器部署。数据库/API契约未修改。

## 2026-10-06：旧消息停留与阅读全文验收（22:01:49北京时间）

固定客户端 `622e84bff20af8cefdd6d9004286da6ba6ba4a22` 已于2026-10-06 22:01:49静态上线；[PR8](https://github.com/luoyan96/personal-agent/pull/8)已合入main（288b56f），[三平台完整CI](https://github.com/luoyan96/personal-agent/actions/runs/37474793438)全部通过。发布标签 `personal-agent-2026-10-06.4` 指向这份源码；API / worker仍94b26d1、镜像d56ee747、contract0.19 / chat1.8 / schema18，没有迁移。

- 查看历史后明确暂停自动跟随；消息由短加载行变成长正文、模型增量、canonical回执或尺寸变化不能仅因列表几何到底重启。Virtuoso followOutput为真正false；初始会话、同身份本人发送、显式End或真实向下滚到底才恢复。阅读全文成功ACK只向原会话 / 身份 / generation发跟随事件，迟响应不跨账号或页面生效。
- 当前Nginx root `/opt/research-openim/client-releases/622e84bff20af8cefdd6d9004286da6ba6ba4a22/clients/openim/dist`；精确公网index SHA256 `9f2591fb39dcf489669c693202d1006c926c24ac72df824cb142bf092ba99742`，八服务运行、API healthy、HTTPS ready0.19；八镜像与backend current全部保持。静态恢复只将Nginx副本 `/opt/research-openim/ops/history-scroll-622e84bff20a-20261006T140148Z/research-openim-production`复制回现有配置，nginx -t并reload后核对8c5f14c的e4ccf4c首页、健康和八镜像；不恢复数据库或切后端。原21:25补发记录仍保留各自基线。
- types / Web / 四固定SDK资源通过；7个必要production React / HashRouter / QueryChat / Virtuoso场景通过（6+1两次窄运行），API / SDK / model均合成，pageerror0 / unexpectedAPI0。旧源码本地合成场景未复现，不称失败门禁；真实Edge旧跳回观察为原故障证据。两个harness启动失败以及库警告保留。
- 线上确认浏览器加载精确新脚本index-0cce9eaf.js。旧IDE部分回执保持原142字范围；用可见“继续阅读全文”键盘Enter触发真实新请求，精确复用既有解析源而未重传文件。新轮成功使用全部5页 / 29415字符，partial=false，实际9127输入 / 446输出 / 3573ms，outbox sent。刷新后新canonical回复1份、编辑器空白；完整阅读入口和实际模型 / IM路径闭合。
- 先前自动化click几次未形成新turn、位置改变，不能单凭这些操作归因window focus；没有把未提交点击计通过。厂商上传Session过期一次，刷新同权限Workbench后同包上传、hash守卫及激活成功，无新增SSH / Key / 端口。维护连接已按本批收尾关闭，用户聊天保留。
- Git外 `.runtime/document-followup-20261006/history-scroll/summary.json`及两个render报告；`history-release/{bundle-receipt,deployment-online-1,source-review,upload-session-failure,live-button-final}.json`与真实新回复截图。用户论文正文、凭据和运行资料未入Git。扫描OCR / 图像 / 版式及超过20非空页、64000预算的全文仍未实现。

## 2026-10-06：文档全文修复实际上线及旧正文继续

2026-10-06 **21:02:07北京时间**，全文上下文修复 `94b26d1d4871c45ace12a86f93d4c19cce377c4d` 已成对部署API / worker及客户端；**21:25:34**静态补发客户端 `8c5f14c91f0248c522a52bb4c5eb31f440500f5b`，增加旧解析正文的“继续阅读全文”入口。[PR5](https://github.com/luoyan96/personal-agent/pull/5)与[PR7](https://github.com/luoyan96/personal-agent/pull/7)已合入main，后者软件合并提交2292360。发布标签 `personal-agent-2026-10-06.3` 指向受测客户端8c5f14c，其API / 契约 / Harness代码与已部署94b26d1完全相同；文档提交不改变运行软件。contract0.19 / chat1.8 / schema18，无迁移。详见[文档阅读交接](development/document-reading.md)。

- 原问题是4000总预算和旧历史优先挤掉正文；此前GitHub修复尚未部署。这次真实既有IDE论文新追问使用全部5页 / 29415字符，partial=false，实际9252输入 / 671输出 / 5066ms，回复涉及正文方法及实验。不是新上传用户论文，也未读取 / 改变Key或密码。
- 既有已登录Edge个人助理实际上传13页 / 49622字符合成PDF，Linux真实解析、既有模型及OpenIM路径通过。新上传实际13596输入 / 149输出 / 1895ms；新追问实际13582输入 / 80输出 / 2193ms，正确返回第4 / 8 / 13页末尾标记。两次预算均63352 / 90，全部13个文字范围及partial=false；这份合成重复文本不代表论文研究质量评估。三个正式回复outbox均sent；13页追问刷新后canonical回复1份，编辑器空白。
- 新请求以所选正文JSON UTF-8字节数 + 8192保守估算，范围4000–64000 / 90秒；正文优先于旧历史。普通无文件仍4000 / 90；旧回复、旧预算、未知用量与原重试不追溯修改。超限至多选20个非空页并明确部分读取；全文仅可提取文字，扫描OCR / 图像 / 版式未实现。
- “继续阅读全文”发新的明确agentChatMessage，精确引用已解析源messageId，沿自然文字continuous=true，不另传budget、不下载、不重发SDK文件。仅部分成功Agent回复或无输出终态的原human请求显示；完整成功 / pending / 无源旧消息 / 外部Agent隐藏。重新验证本人、direct会话、加入成员与发送权限，账号 / 导航变化栅栏；不确定ACK仅手动同键同body重试。旧SDK取回失败与已有解析回执分别显示，未放宽origin、redirect或cookie策略。截图的通用取回错误没有单独证明实际HTTP302。
- 两次固定源码的GitHub三平台完整CI分别通过：94b26d1的37456957982，以及8c5f14c的37469860577（Ubuntu22.19 / 24、Windows24）。上一批根537项 + 2生产入口和后端23 + 3专项保持；客户端本批types / Web / 四固定SDK资源及9组实际production HashRouter / QueryChat / ChatFooter / CKEditor渲染通过，API / SDK / 解析元数据 / 模型在该9组中均合成。原401 fixture初始化失败和既有Router / Antd警告保留，pageerror0，不称console无错误。
- API / worker实际镜像 `sha256:d56ee747229eeaffec170810b846f1265ca5c2afbffa4d32a95e69e66871017d`；backend current为 `/opt/research-openim/releases/94b26d1d4871c45ace12a86f93d4c19cce377c4d`。最终Nginx root `/opt/research-openim/client-releases/8c5f14c91f0248c522a52bb4c5eb31f440500f5b/clients/openim/dist`；公网index `e4ccf4c4069a7ab1cb5771880cd8b480c9aef09b70a0221470dd0381d322a65d`，八服务运行 / API healthy / HTTPS ready0.19。静态补发期间八镜像及后端current未变。
- 主发布停写78表SQL / 全行hash保持一致，备份 `/srv/research-openim-backups/20261006T130148Z` 的12checksum / 9gzip / 隔离SQLite integrity及18迁移检查通过；完整组件恢复 / 异地备份仍未验。静态补发回退只恢复Nginx副本 `/opt/research-openim/ops/continue-reading-8c5f14c91f02-20261006T132533Z/research-openim-production`及94b前端，API / worker / 数据库保持；主发布恢复2e69688需先栅栏未完轮并保留用量，不能覆盖旧快照。
- 沿用现有Workbench免密SSH；前次断开经刷新恢复。静态上传一次厂商Session过期、对应归档不存在守卫失败，刷新同权限连接后同包上传 / 核验 / 激活成功，失败记录保留。没有新增SSH、端口或Key。Git外证据 `.runtime/document-reading-20261006/release/{prepare-online-1,deployment-online-1,public-online-1,live-document-final}.json`、真实IDE及13页截图；补发 `.runtime/document-followup-20261006/{frontend/summary.json,frontend/render-7214ef96/report.json,release/bundle-receipt.json,release/deployment-online-1.json,release/github-ci.json,release/software-merge.json}`。


## 2026-10-06：附件输入区临时回执清理（本地修复，待发布）

- 用户指出附件已经回复后，输入区仍常驻“附件上传阅读回执”、页数和“AI已回复”。根因是useAgentFileReading持续保留accepted成功条目，且重复展示聊天中已有的提取元数据。
- 移除输入区重复的文件提取摘要；服务返回succeeded且没有读取错误后移除该临时条目、卸载状态轮询。上传 / 取回 / 等待、解析失败、模型不可用与不重复发送的重试仍保留；聊天消息中的真实阅读范围与未发送草稿不变。
- 独立分支fix/file-reading-feedback，客户端typecheck / build:web及四固定SDK资源实际通过。既有隔离Edge Playwright验证实际QueryChat / ChatFooter，四组桌面1280 / 窄屏320场景通过，详情可展开，成功后至少一个轮询周期不再发临时状态请求；失败重试保持同一幂等键 / 原字节且SDK仅发送一次。API、SDK、提取及模型明确合成，不计真实云投递或厂商阅读质量通过。
- pageerror0；既有React Router未来版本警告、故意503 / 422响应保留。首次pnpm按上级packageManager尝试创建工具目录遭EPERM，关闭自动版本管理并独立客户端检查后通过；首轮UI已过桌面场景，但并行构建更新dist触发Vite watcher EBUSY / 后续导航拒绝，保留失败报告，监视排除生成目录后四场景通过。
- Git外证据 `.runtime/file-reading-feedback-20261006`：verification.json、client-build.log、component-857ede49/report.json与截图；原第一轮组件失败证据保留于 `.runtime/agent-files-20261005/component-*` 当次目录。没有共享源码 / 契约或依赖变化，故不重复共享根CI；未部署，生产仍27c3279前端 / 787ca23后端 / schema18。


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

## 2026-10-06：连续 Agent 私聊与自然回复（本地完成，未部署）

用户确认微信式连续文字交流：可以连发补充、实际渐进输出、运行中调整方向。软件提交 `1eb9f8d42e39031442a79c663f400c7facf1dda1`，分支 `feature/continuous-agent-chat`，父基线0bb8562包含附件临时回执修复；后续文档提交不改变此软件SHA。contract0.19 / chat1.8，SQLite仍18，无迁移。本批没有合并、云部署、真实提供商Key操作或生产IM消息；线上仍API / worker787ca2314b24320ae0b90da4db4d1401b209f719、客户端27c3279f7dc6584ebde905fd821e21f7166e5c74、contract0.18。

- 后端每条human消息先保存，queued1200ms滑动合并、最多4秒，同批一个turn/root/4000/90预算；运行中明确新输入使旧生成失效、新批独立默认预算，旧actual/unknown usage保留、不refund/自动retry。当前批全部文字参与，明确创建意图切换与撤销仍检查，不让迟到旧建联系人 / 计划落库。外部每条先验同意，仅当前文字、不合并外传历史/记忆/文件。
- Harness保持固定0.2.0-rc.1公开接口，CLI可选NDJSON delta/result和IPC AbortSignal；StringDecoder保留UTF-8碎片，仅公开text-delta。progress重新检查original owner/ACL/上下文；暂存正文不是业务成功，结构化创建/协作只在完整校验后展示。canonical/outbox仍为最终记录。waiting_input澄清的已校验回复phase=final，但任务状态仍waiting_input。
- 前端连续入口按原key/body顺序提交，早期失败保留并暂停后续；不会锁住编辑器等待模型。暂存回复按finalMessageId与SDK locator去重，刷新从实际当前human指针恢复。本人标签页sessionStorage有界512KiB UTF-8/50项/24小时；恢复为paused、无自动发送，UI手动核对原请求。退出/换账号清除，损坏或保存失败提示。普通重复等待行从输入区移到聊天区。
- 最终完整根CI44文件534项+2生产入口/B0进程/生产fixture排除通过；客户端最终typecheck/build:web/四固定SDK资源exit0。后端12最终专项（10实际HTTP/SQLite+2实际固定Harness/CLI本地合成SSE）及此前233回归通过；总控新dist四项实际HTTP/SQLite通过，progress revision从4到7，旧输出拒绝、旧usage保留、他人404、持久final恢复。前端8项必要组分阶段闭合，实际生产HashRouter/QueryChat/CKEditor、loopback HTTP/SQLite/worker，ModelCall与SDK/映射明确合成，不当作一次全套浏览器或云模型/IM验收。
- Git外索引 `D:/deepseek-agent/.runtime/continuous-chat-20261006/{backend-review.json,root-ci-final.log,http-b302661a/report.json,frontend/summary.json}`。首轮root-ci.log为533pass/1fail：旧CHAT1数量50，新增progress后修51；之后完整CI通过。原backend fixture断言、重复合成回答文本计数、Router/SDK fixture hydration、新账号初始化、CKEditor空白换行、桌面菜单选择器及关闭harness失败均保留。最终pageerror0，既有Antd/Router与注入失败/匿名401仍在console，不能称console0。
- 自有API helper/Vite/Playwright已关闭，两个隔离测试账号UI退出完成；运行证据与临时私有凭据均Git外保留。真实模型语气与流式质量、生产OpenIM投递、完整Muse并行任务/语音/原生App另验。下一步发布须API/worker先升0.19，再升客户端，保留schema18数据，并另录精确镜像/公网/恢复与隔离账号线上证据。

## 2026-10-06：连续Agent私聊正式发布与真实模型 / OpenIM验收

用户明确回复“可以发布”。18:16:59北京时间，固定源码 `2e696881583842eb0e251d222083bccd925524fe` 发布客户端、API / worker，contract0.19 / chat1.8 / schema18无迁移；PR3及祖先PR2已合并（软件合并1d94cf5），标签 `personal-agent-2026-10-06.2` 指向受测部署源码，后续仅交接文档不改变运行版本。上节“本地完成，未部署”是发布前的历史事实。

- 最初GitHub CI37445290637的Linux22.19 / 24失败：合成私钥默认0644被生产凭据权限守卫拒绝。2e69688仅修正测试为0600、增加masterAvailable及创建201断言；没有放宽生产守卫。固定源码[CI37446680799](https://github.com/luoyan96/personal-agent/actions/runs/37446680799)在Windows24 / Linux22.19 / 24全部通过；总控新完整根CI44文件534项 + 2生产入口 / B0 / 生产fixture排除通过，客户端最终类型 / Web / 四SDK资源通过，后端13针对项及类型通过。首次pnpm默认依赖验证拒绝无交互purge的日志保留，使用既有依赖配置的后续完整检查通过。
- API / worker镜像 `sha256:63915f409f27dd18f1ab14fc8cdd3f5e1cf2da4de16bbda80e620a5a90c37d06`；current与客户端root同属 `/opt/research-openim/releases/2e696881583842eb0e251d222083bccd925524fe`；精确公网index `7df13778196d25cfcb8e37e54015c9254a6edaeae1616184270e7fa8318c1be9`。八服务运行、无OOM、API healthy / HTTPS ready0.19，其余六镜像不变。78表SQL及全部行hash在开启写入前一致；备份 `/srv/research-openim-backups/20261006T101640Z` 的12checksum / 9gzip流CRC / 隔离SQLite恢复integrity与18迁移checksums通过。没有新增SSH授权或端口，没有数据迁移。
- 准备阶段三次失败原样保留：根700导致www-data不可读、相同归档已存在、四个WindowsCRLF文件与Git归档LF的hash不同。最终release755、归档精确匹配复用、新归档独占写入，source hash从固定Git blob生成canonical manifest并逐源 / 镜像 / 运行文件核验后才激活。实际helper SHA256 `668d9a3080c993c958e970b5ef6306cdf7b2a416d92aca784911fa23cfcee8bc`；归档路径 / 78表fingerprint / 实际SQLite保留用量和记忆的栅栏3项本地验证通过。生产回退没有实切演练，完整栈恢复和异地备份仍待做。
- 使用用户既有已登录Edge个人助理、合成测试文字和既有模型配置，未新建隔离验收账号，未读取 / 复制 / 修改真实Key、密码或记忆设置。两条快速输入一个批次、一次真实模型调用并接上补充；生成中补充旧turn被栅栏、outputMessageId为空，unknown usage原样保留，新的独立默认预算轮次成功。编辑器与发送持续可用。四个成功测试轮的canonical / 实际OpenIM outbox均sent、attempt1。
- 实际AX在完成前显示“正在回复 · 尚未结束 M”；最终turn `ae051720-1396-4a5a-b5f5-58ef6edd6a2d` revision9，实际输入919 / 输出228 / 2273ms。刷新同URL canonical回复1份、临时气泡0、编辑器空白。原locator尝试提前中止且误报10秒未见delta的failed报告保持，后续真实AX与revision另证。附件完成临时回执修复随PR2一起上线。
- 800字及250字长文两次 `BUDGET_EXCEEDED`，真实计量及失败保留，无伪造完整答复；后续明确短请求成功，默认4000 / 90秒未增。当前浏览器日志捕获为空，仅描述本轮范围，不表示历史SDK map(null)问题全部修复。完整Muse并行 / 实时语音 / 原生App / 第三方Agent流式未计完成。
- 恢复保持当前schema18，停API / worker / OpenIM写入者、核对迁移并栅栏不兼容未完轮次；保留actual / unknown usage、消息 / 记忆 / outbox，再恢复原787ca23镜像e632d1c、current及27c3279前端 / 精确首页 / ready0.18，不覆盖旧库。Nginx副本 `/opt/research-openim/ops/continuous-chat-2e6968815838/activate-20261006T101638Z/research-openim-production`。详见[ECS当前恢复](deployment/openim-ecs.md)。
- Git外证据 `D:/deepseek-agent/.runtime/continuous-chat-release-20261006`：部署、prepare、公网、CI / merge收据、helper验证、`cloud-turns-final.json`、`live-stream-actual.json`、`live-refresh-proof.json`及`live-chat-final.png`；原准备失败、CRLF修正收据、selector中止均保留。本地实现证据仍在 `.runtime/continuous-chat-20261006`。后续优先完善长文预算体验与日常自然聊天，再逐步推进任务组织 / 长期行为记忆闭环。

### 2026-10-06 文档阅读上下文修复：本地通过，尚未上线

- 用户13页 / 49622字符论文仅读到第一页118字符：不是解析失败，而是普通4000预算和旧历史占满输入。分支 `fix/document-reading-context-20261006` 以main38c8849为基线，修复文件阅读独立预算、正文优先及实际范围展示。新文件或明确追问按所选JSON字节数 + 8192，限制4000–64000 / 90秒；普通聊天不变，同批沿原预算，换源 / 页码开启新批，旧轮 / 重试 / 未知用量不隐式扩额。
- 真实HTTP / SQLite / PDF解析13页49622字符的合成样本，逐页全文和末页结论全部进入合成模型输入。预算63336、准入58226、输出4096；第13页追问完整3817字符，整份partial。大文件均匀选至多20个非空页并如实标部分；没有OCR / 图表理解。没有实际厂商或云端模型验收。
- 根CI44文件 / 537项，另2项生产入口、B0和生产fixture排除通过；后端23专项 + 3最终边界 / 源和测试类型通过。客户端类型 / Web / 四固定SDK资源通过，八组实际生产路由 / CKEditor界面检查覆盖全文、118字符部分、失败 / 等待 / 旧数据、去重、空白页及1440 / 320px；此组API / SDK / 提取元数据 / 模型均合成。pageerror0，Router警告及首轮排版 / fixture / 路由失败保留。
- contract0.19 / chat1.8 / schema18无变化，无迁移和依赖变更。发布助手以线上2e69688 / 镜像63915f4 / 首页7df1377为严格基线，保留现有数据和计量；归档、78表fingerprint及SQLite栅栏三项本地检查通过。现有Workbench断开，自动审批把返回入口识别为VNC并拦下，改用原SSH入口仍未恢复；已请用户恢复原连接，不索要凭据，尚未在云端执行。
- Git外 `.runtime/document-reading-20261006` 保存根CI、`backend/backend-review.json` / `thirteen-page-call-proof.json`、`frontend/summary.json` / `render-d9dbb750/report.json`和发布准备日志。下一步固定源码PR、同版客户端 / API / worker发布，再用该13页合成样本验证真实厂商 / SDK、范围、用量及刷新去重。既有旧论文回复不会追溯改成全文；发布后需新发明确全文追问。

### 2026-10-06 19:37 文档修复合入主线，发布包已准备

- 软件固定提交 `94b26d1d4871c45ace12a86f93d4c19cce377c4d`、[PR5](https://github.com/luoyan96/personal-agent/pull/5)已合入main0a2070f；[同一源码三平台完整CI](https://github.com/luoyan96/personal-agent/actions/runs/37456957982)全部通过。后续仅交接文档更新，不重跑已通过的共享本地CI。
- 发布包固定94b26d1，归档SHA256801e674d、helperfdeb01df、候选首页a33adc48；源 / Web / helper哈希、canonical Git blob和所有归档成员守卫通过。收据 `.runtime/document-reading-20261006/release/{github-ci,software-merge,bundle-receipt,bundle-verified}.json`。19:35:53公网ready0.19正常，首页仍旧7df1377，证据 `public-pending.json`。
- **尚未上线**。现有Workbench终端仍断开，已请用户在Edge恢复原SSH连接，无需提供密码或Key；没有执行云部署、变更端口 / 授权、调用真实厂商或发布新版本标签。恢复后须完成13页样本真实SDK / 模型验收再登记部署结果，不能把三平台CI或合成模型当成线上读完全文。

### 2026-10-06至07：Windows 0.1.0与本地文件夹候选

- 用户要求做好Windows客户端并试读本地目录。本批基于main `eb18b6fb498975f94540ec6771705beacee3c2d3`，分支 `feature/windows-local-folder`；仅独立客户端和交接文档改变，共享contract0.19 / chat1.8 / schema18未改，无迁移。当前云端仍客户端622e84b、API / worker94b26d1。
- 原生Windows选择器授权目录，窗口主frame持有随机grant / fileID；相对列表、文字预览、10文件 / 52000 JSON字节上限和正式任务，单一合并Markdown走现有SDK文件与科研阅读API。UTF8 / 常用代码 / 文字PDF / DOCX，junction / 秘钥常见名 / 隐藏与依赖项排除，文件变动拒绝；取消 / 导航 / renderer退出撤销。目录只读，不执行或自动改文件，无OCR / 图像 / 旧DOC / XLSX。
- 固定PDF.js3.2.146并禁用eval。在实际Electron22 utilityProcess中它将Node16识别为无DOM浏览器，原generic build缺workerSrc导致解析失败；最终使用官方legacy、本地同版worker与自身流兼容层，没改process身份或放宽网络。Canvas可选native渲染依赖从打包closure排除，保留OpenIM DLL原hash。Node24真实FS / PDF / DOCX4组、renderer / Electron类型、Web / 四SDK、NSIS安装包和smoke通过。
- `native-final/report.json`记录最终已打包Electron22 / Node16、main IPC / preload / utilityProcess五项通过：PDF第二页和DOCX真实正文、任意路径拒绝、release与hash导航撤销。`frontend/summary.json`12个必要React场景分阶段通过，bridge / SDK / API / model全部合成。最终 `frontend-native-ui/render-6d14edc8/report.json`另两项真实打包程序与生产React集成通过：预览零上传；原生临时MD544字节与API base64逐字一致，正式text独立，仅OSdialog / SDK / API / model为替身，各一次发送 / 请求，pageerror0。不能称真实模型或IM通过。
- 默认正式HTTPS登录在正常网络权限下通过：`default-cloud-final/report.json`，version0.1.0 / packaged / webSecuritytrue、真实隔离preload。隔离匿名session预期401记录；受限网络回落连接页、隐藏窗口CDP截图timeout、Canvas打包失败、两个残留测试进程占用DLL和前端fixture / selector失败均保留。最终用Electron capturePage获得稳定截图，未通过新权限绕过用户窗口控制。
- Git外 `D:/deepseek-agent/PersonalAgent-Windows/0.1.0/ResearchWeChat_0.1.0.exe`（86163661字节，SHA256 `28b8a1938efdff5655bc24dac53337bb3501028022e4484fd6c514a67964e208`），免安装入口 `app/ResearchWeChat.exe`已启动供用户登录；app.asar SHA256 `91663c7013a7604cf725381c4dd94b8142dd8dd0d00c56a79282465b9644201e`。用户真实资料未读取或传输。Windows操作工具新增应用审批超时，没有控制该用户程序。所有自有测试Electron / Vite已收尾。
- **云端新入口未发布**：客户端加载云端UI，阿里云Workbench登录过期，已请求用户恢复Edge原登录；尚未上传静态资源、修改生产Nginx或调用真实桌面模型 / IM。源码/安装包成功不能代替发布。证据在Git外 `.runtime/windows-local-folder-20261006`，使用和下一步见[Windows交接](development/windows-local-folder.md)。
- 固定实现提交 `8b42d35a9e47b5159bfd19e5ce4155508d53f7e0` 已推送，[PR10](https://github.com/luoyan96/personal-agent/pull/10)已附着当前任务；CI37560444750启动中，尚未计通过。后续交接文档提交不改变安装包代码。静态准备包41735965字节、SHA2562698a4de、helperbc27f0bc、候选首页3a43637b；逐个canonical客户端源码与四SDK hash通过，后端 / contracts / Harness差异为空。生产助手保留原622e / 9f2591、94b26d1 / d56ee747 / schema18 / 八服务与Nginx自动回退守卫；没有执行到云端。收据 `static-release/bundle-receipt.json`。

### 2026-10-07：Windows文件夹入口云端静态发布

- 用户回复“已登录”，现有阿里云Workbench原SSH会话恢复；没有新增临时SSH公钥、开放端口或读取用户Key。10:24:26北京时间，固定客户端8b42d35经文件管理上传、外包SHA2562698a4de校验、有界目录解包及已审阅助手发布。Nginx root `/opt/research-openim/client-releases/8b42d35a9e47b5159bfd19e5ce4155508d53f7e0/clients/openim/dist`；精确公网首页3a43637b，八服务运行、API healthy、HTTPS ready0.19，八镜像与后台current94b26d1 / d56ee747保持不变。没有数据库迁移或后台重启。
- 10:27:25本机独立HTTPS核对同一完整index SHA256与健康通过。Git外 `.runtime/windows-local-folder-20261006/static-release/{deployment-verified,public-verified,github-ci}.json`；部署收据原文来自实际Workbench终端。文档HEAD31995a5的CI37560573547三平台全部通过（Ubuntu22.19 / 24、Windows24），与上一节未完成发布及启动中CI分开。
- 静态恢复副本 `/opt/research-openim/ops/windows-local-folder-8b42d35a9e47-20261007T022425Z/research-openim-production`；只恢复Nginx配置、nginx -t / reload并核对旧622e84b首页9f2591、健康及八镜像，不恢复数据库或更换API。Windows包代码仍8b42，文档更新不触发重构建。
- 原生电脑操作工具此次成功定位并显示真实用户Windows0.1.0客户端；目前是科研微信登录页，已请求用户在桌面手工登录。准备 `D:/deepseek-agent/PersonalAgent-Windows/试用文件夹/`，仅复制已有合成两页PDF与DOCX。真实桌面模型 / OpenIM投递仍未计完成；不会将本地合成SDK/API验收冒充真实线上结果。

### 2026-10-07：Windows0.1.1原生更新候选

- 用户要求版本检测、提示及点击升级。基于main abed83e（WindowsPR10已合入），分支feature/windows-updates；沿原electron-updater5.3.0、NSIS与本项目公开GitHub发布，新增主进程更新状态和托盘入口。安装版15秒启动 / 6小时 / resume检查，后台等待focus提示；检测零下载，明确下载 / 库校验之后本人“安装并重启”，退出不自动安装。不降级、不预发布、不Web安装器，无renderer安装IPC、Token、TLS或签名检查放宽。
- 5组控制器必要故障与动作门禁通过：并发一次、失败重试、迟到 / 不匹配或坏元数据不能安装、安装抛错恢复forceQuit。renderer / Electron类型、NSIS最终构建、真正打包启动smoke及HTTPS登录通过；native-final3原生未安装保护与提示参数通过，OS提示响应为明确替代。未登录、未发用户资料或执行安装。初次strip-only参数属性与pnpm入口失败、两个native测试模块导入失败保留；首轮build重复publish参数导致缺GH_TOKEN失败无上传，最终原单个never构建通过。
- 安装包86257023字节、SHA256 d3350cdd7405aec2526ac9e917e65970ad901d3a2c96ba4977621795891572a0；read-only发布门禁实际核对exe / latest.yml版本与SHA512 / size、blockmap及包内公开GitHub配置无Token。Git外 `.runtime/windows-updates-20261007`，本机交付目录 `PersonalAgent-Windows/0.1.1`。0.1.0需首装一次，免安装不原地替换。
- 本批没有修改云端UI / 后台 / schema，线上8b42d35 + 94b26d1维持。候选尚未GitHub发布；真实公开源下载校验及安装重启另验。准确操作见windows-updates交接，先前0.1.0桌面账号 / 文件夹模型验收仍待登录。

### 2026-10-07：Windows0.1.1正式发布与公开更新下载验收

- 11:06:33北京时间，[正式v0.1.1](https://github.com/luoyan96/personal-agent/releases/tag/v0.1.1)发布，源码固定e8cffadb38ab5bb3abeb951107491ea39a482c10；[PR11](https://github.com/luoyan96/personal-agent/pull/11)及[源码三平台CI37564725311](https://github.com/luoyan96/personal-agent/actions/runs/37564725311)全部通过。先一起上传exe / blockmap / latest.yml并核对GitHub资产digest与大小，之后公开草稿，无覆盖不同字节。安装包SHA256 d3350cdd7405aec2526ac9e917e65970ad901d3a2c96ba4977621795891572a0、86257023字节。
- `live-final4/report.json`真实Electron22打包程序及electron-updater5.3生产网络执行器、公开GitHub源检测 / HTTPS下载 / 库SHA512校验通过，独立SHA256 / 大小完全一致、15次有效进度；autoDownload / autoInstallOnAppQuit / allowDowngrade / allowPrerelease均false。只明确模拟比较版本0.1.0与隔离缓存，实际程序0.1.1，没有执行安装器，不能称真实已安装旧版本升级重启通过。
- 首轮自有验收`live-final3`传测试adapter，库不创建HTTP执行器，因此检测失败；原报告保留。改用库正常构造、仅模拟版本 / 缓存后通过，产品代码和已发布包未改。Git外 `.runtime/windows-updates-20261007`保存release-published、upload-verified、software-ci、live-final4证据；当前新文档提交不重构建安装包。
- 用户0.1.0先手动安装一次0.1.1，再从安装快捷方式启动；随后可检测、点击下载 / 安装并重启，托盘可手动检查。用户机器安装执行与之前桌面真实账号 / 文件夹模型仍待验。云端UI8b42d35、API / worker94b26d1 / d56ee747、contract0.19 / chat1.8 / schema18保持，无云部署或迁移。

### 2026-10-07：Windows历史消息查询兼容修复与真实桌面验收

- 用户登录后本人和个人助理消息都误报“当前权限下无法读取”。分支 `fix/windows-message-query` 基于main32e6ab8，软件固定 `b3eb21536d696f25fc5535e6a3b2c6e854f03c18`、[PR12](https://github.com/luoyan96/personal-agent/pull/12)。真实打包Electron22.3.27 / Chromium108的 `URLSearchParams.size` 为undefined，导致GET分页 / 筛选全部丢失；生产researchApi改用序列化字符串非空判断，缺失fact改为真实未找到提示。没有放宽后端鉴权、修改契约或数据迁移。
- renderer类型、Web及四SDK资源检查通过；固定软件[三平台CI37572397265](https://github.com/luoyan96/personal-agent/actions/runs/37572397265)全部通过。独立Electron22运行生产API及消息组件，41条HTTP事实 / SDK明确合成：旧代码复现两条误报；修复后第40 / 41条、afterSequence / limit、中文及&搜索、会话筛选、Unicode cursor编码、空查询与刷新去重通过，console / pageerror0。最终 `after-d401dc00/report.json`及前后截图保留；fixture误拦路由、错误临时目录前缀、隐藏窗口截图timeout和挂起中断均保留。最后实际showInactive后截图成功，自有Electron / Vite退出已确认。
- 13:00:32北京时间固定b3eb215静态上线，精确首页SHA256 `92a23a8d1a9dd2446648da15dbb522e86e624dc471a2ecb11de41bff5cb6c773`。整包10259166字节 / SHA256 `0c32cd5126996d3dd816918548deac4665de8e9612209889cde60b57e4d2ebb4`、source / Web归档、两处修复源码及四SDK校验通过；八服务运行、API healthy、ready0.19，后台94b26d1及八镜像全部保持。13:01:16独立HTTPS同一首页 / ready核对通过。可依据Git外私有收据的Nginx副本回退静态UI至8b42d35 / 3a43637b；无需数据库恢复。
- Workbench上传网关两次NoSuchKey失败，GitHub单连接下载60秒timeout；完整含运维元数据包公开上传被自动审批拒绝。改用仅公开前端源码 / dist的封装上传既有v0.1.1，服务器八分段206 / Content-Range / 总SHA校验成功；助手与manifest从原私有SSH部署文件生成，helper精确hash0cb3b48e。没有新增SSH / Key / 端口，也没有公开该私有运维包。Windowsv0.1.1正式安装包、latest.yml与blockmap保持原样，未创建影响更新通道的新正式Release。
- 用户现有Windows已登录会话实际验收：普通Ctrl+Shift+R不重载无菜单窗口，既有开发工具页面重载后，21:15原提问与原回复恢复，三个末页标记和全部13页阅读范围显示，权限占位消失、编辑器空白。没有发新消息、重新传附件、读取凭据或调用模型。开发工具已关闭，真实聊天窗口留给用户。这是历史显示修复，Windows本地文件夹实际模型 / IM以及真实安装升级重启仍另验。
- Git外 `.runtime/desktop-message-query-20261007`保存 `runtime-query-proof-final.json`、前后合成报告 / 截图、types / build、源码CI、`release/deployment-verified.json` / `public-verified.json`和`live-desktop-verified.json` / `live-desktop-after.png`。私人会话与运维运行资料均未入Git，后续文档提交不重构建已上线的静态软件。

### 2026-10-07：隔离桌面验收未捕获异常窗口修复

- 用户截图 `Unexpected desktop review directory` 对应先前自有测试启动：目录前缀错误，且生产bootstrap在注册错误处理之前执行目录守卫。原失败日志保留。基于main e498fa7，分支 `fix/desktop-review-startup-error` 将同一守卫和userData设置移入既有try块、放在错误处理注册之后；没有放宽合法目录范围，也没有改用户正常启动逻辑。
- Electron主进程类型检查通过。13:23:34北京时间，缓存的实际Electron22.3.27运行生产bootstrap / smoke源码：错误前缀和OS临时目录外路径均退出1且保留原拒绝错误；正确私有目录进入合成最小main、userData完全匹配并退出0。三组均无12秒超时；无业务renderer、网络、模型或账号，不声称完整软件验收。Git外 `.runtime/desktop-startup-error-20261007/report.json`和各组stdout / stderr保留，进程检查无自有测试残留。
- 当前正常用户客户端继续运行，本批未操作其账号或重启软件。只同步源码及交接文档；未重发Windows安装包、修改更新清单或部署云端，线上b3eb215 + API94b26d1 / contract0.19 / chat1.8 / schema18保持。此次主进程源码修复将在下一次桌面打包纳入。
