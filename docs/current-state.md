# 新 AI 接手：当前项目状态

更新日期：2026-10-20（北京时间）。这是快速交接入口；历史报告保留各自受测版本，不能直接当成当前线上状态。

## 最新后台批次：DSH0.2.1-rc.2已部署

评审入口：[草稿PR78](https://github.com/luoyan96/personal-agent/pull/78)，base `fix/chat-sidebar-resize-0.10.24`，已推送并附任务、未合并；b64b4f3远端Foundation三项首读IN_PROGRESS，不称已通过。

用户要求更新后台。从实际干净`fix/chat-sidebar-resize-0.10.24` / `46b531f`新建`chore/harness-0.2.1-rc.2`，产品固定 **47ec4969ec83c751053f229daac6b20f3271cb39**。[部署与回退](deployment/harness-0.2.1-rc.2-20261020.md)。官方LLM/provider精确**0.2.1-rc.2**，Cordis**4.0.5**；空工具/原模型选择、业务权限及contract0.26/schema023保持，无迁移。Windows0.10.24包未变，无需重装；无公开Release/飞书权限或密钥修改。

生产API/worker已配对更新，镜像 **research-openim-api:harness-0.2.1-rc.2-20261020** / **sha256:34bba4d03a5d714d731c248302f1484d47382c52e833d004dda68c88e01c5130**；组合revision `47c42ac+key-preview.4bc8d1f+feishu.2bbcfbc+harness.0.2.1-rc.2`，仅五源文件覆盖旧feishu镜像，未整体部署桌面分支。实际running/restart0、API healthy；其他6服务ID/镜像/状态保持。

**694项/55文件全量CI、2项生产CLI、Linux候选29项及飞书HTTP隔离检查通过**。上线后本人既有DeepSeek默认模型真实合成短句返回OK、流式2字符、23输入/1输出tokens、1016ms；无私人材料/历史/业务任务。公网ready200/0.26，Harness health仍not_verified；真人工探针与健康标记分开，不称真实科研质量完成或千问/豆包真厂商已验。

停写备份/恢复与上线前核对94表/6原件逐项一致，模型凭据/默认选择整表哈希保持，schema023未迁移；备份`/srv/research-openim-backups/harness-20261020-20261020T094007Z`。首轮审计对象prototype误判触发自动恢复旧服务，未还原覆盖数据；修正后原恢复副本通过并重新备份切换，第二轮17:40:05—17:40:18，不含首轮窗口。旧镜像和两轮备份保留，可回退。失败与最终证据Git外`.runtime/harness-upgrade-20261020`。

## 最新批次0.10.24：聊天列表拖动宽度，安装包已制作

评审入口：[草稿PR77](https://github.com/luoyan96/personal-agent/pull/77)，base `fix/library-agent-dock-0.10.23`，已推送并附任务，未合并。文档16abb76远端Foundation首读两项IN_PROGRESS、一项QUEUED，不称已通过。

接续实际干净 `fix/library-agent-dock-0.10.23` / `2a30b65`，新分支 `fix/chat-sidebar-resize-0.10.24`，产品固定 **2b5c0db8022bbd392333bb1649ed7024b341e06c**。[交付与验收](deployment/acceptcat-0.10.24.md)。聊天列表分隔条支持左右拖动、本机记忆、双击复位及键盘调整；220—480像素，窄窗保留正文空间并在恢复宽窗后还原偏好。

Windows x64 **C:/Users/luo/Desktop/AcceptCat_0.10.24.exe**，**87,431,310字节**，SHA256 **6512d67a1508d0ea9417e6e05be3b98c48c85e3f296e1b17066de5a6cfa38e54**。生产构建、实际NSIS载荷、18JS/8CSS逐字节、52运行包/55装配包和隐藏隔离原生启动通过；没有代安装或公开发布。

渲染/主进程类型、34项定向及实际拖动/重开恢复/搜索/会话选择通过。1280×720视口、820像素应用容器验证收窄/恢复；最终只有旧Router警告，初始分页/HMR夹具错误保留Git外 `.runtime/chat-resize-20261020`。Browser插件缺席用CUA/Playwright；真实消息/模型和更多窗口尺寸未重验。共享代码未改，不重复根693项CI。

纯客户端布局改动，无后台同步/部署/迁移/飞书或密钥变更，沿下述0.26/schema023、image4ee12e77、飞书0.1.0仅罗岩；公开latest仍v0.6.0。继续获准真实资料与科研质量验证。

## 前批次0.10.23：资料 Agent 底部聊天框，安装包已制作

评审入口：[草稿PR76](https://github.com/luoyan96/personal-agent/pull/76)，base `feat/library-agent-0.10.22`，已推送并附任务，未合并；文档0862a04远端Foundation三项首读IN_PROGRESS，不称已通过。

实际干净 `feat/library-agent-0.10.22` / `5f1becc` 接续，新分支 `fix/library-agent-dock-0.10.23`，产品固定 **316768dc5707c4c43677f046165d590da194f9b1**。[交付详情](deployment/acceptcat-0.10.23.md)。按用户反馈移除中部跳转卡片，改为底部常驻输入、原地回复/追问/停止/历史恢复和来源核对，资料范围收进聊天区；复用已有本人Agent和私聊，不跳“消息”页。未选集合只用聊天内容；私人/共享权限、模型与后台接口保持。

Windows x64 **C:/Users/luo/Desktop/AcceptCat_0.10.23.exe**，**87,431,664字节**，SHA256 **11f46da4811d5ce68e489bcaf5fd9888ff8885db5b4765ad1e2ccf62a63a10c3**。实际安装载荷、18JS/8CSS、52运行包/55装配包、新样式/旧卡片移除与旧功能通过；隐藏隔离启动通过，旧electron-log提示保留。没有代安装、关闭用户客户端或公开发布。

渲染/主进程类型、33项客户端、26项/3文件真实HTTP/SQLite/合成模型资料与连续聊天通过；1280×720实际界面走通提问/追问/进度/停止/引用原文、丢回执刷新恢复且原消息仅1条、A/B/A隔离。Browser插件缺席，用CUA/Playwright；最终只有既有Router警告，夹具热更新首败/包检查误判保留在Git外 `.runtime/library-dock-20261020`。真实模型/私人资料/其他窗口尺寸未验，不计科研质量已完成。API/契约/核心/Skill未改，不重复根693项CI。

本批无需后台同步或迁移，无后台/飞书/密钥/公开Release变更；沿下述0.26/schema023、image4ee12e77、飞书0.1.0仅罗岩，公开latest核对仍v0.6.0。下一步以实际获准材料验证中文问题、检索与回答质量。

## 前批次0.10.22：课题组资料与资料 Agent，安装包已制作

评审入口：[草稿PR75](https://github.com/luoyan96/personal-agent/pull/75)，base `fix/desktop-network-0.10.21`，已推送并附任务，未合并；文档cb729ae远端Foundation首读一项QUEUED、两项IN_PROGRESS，不称已通过。

接续实际干净 `fix/desktop-network-0.10.21` / `3d5270c`，新分支 `feat/library-agent-0.10.22`，产品固定 **df184820f44f023dc8cb0363298b13a41df39e2f**。[交付与验收](deployment/acceptcat-0.10.22.md)。工作台/页标题统一“课题组资料”，新增资料Agent入口：先明确选择获准集合，再创建/复用本人Agent，保存范围并进入普通聊天；沿用真实片段检索和来源回执。私人集合不自动共享，每人使用自己的模型和私聊；不自动同步飞书、执行代码或搬移原文件。旧表单不能覆盖另一处的新范围。

Windows x64 **C:/Users/luo/Desktop/AcceptCat_0.10.22.exe** 已制作，**87,432,807字节**，SHA256 **e696d8ad798ca36df5a27fa35375d33dc315d160ca22a9e76ad1184d2219a179**。实际NSIS的EXE/ASAR、18JS/8CSS逐字节、52运行包/55装配包、旧功能及无QA内容通过；隐藏隔离原生启动通过，旧electron-log提示保留。没有代安装、关闭用户客户端或公开发布。

渲染/主进程类型、34项客户端定向及16项真实HTTP/SQLite/合成模型资料聊天检查通过；1280×720实际React走通创建/绑定/聊天导航、复用、范围冲突恢复、A/B资料隔离。无生产会话/私人资料或真实模型试读；IM为合成夹具，其他窗口尺寸与真实科研质量仍待验。Browser插件未列出，用CUA/Playwright；既有Router/AntD提示保留，夹具首败保留于Git外 `.runtime/library-agent-20261020`。API/契约/核心/Skill未改，不重复根693项CI。

本批后台、数据库及飞书应用不变，仍沿下述0.26.0/schema023、image4ee12e77、飞书0.1.0仅罗岩；公开ready实读200/0.26.0，公开latest仍v0.6.0。新入口复用已有接口，不需要本批同步或部署后台。

## 前批次0.10.21：桌面系统代理联网修复，安装包已制作

评审入口：[草稿PR74](https://github.com/luoyan96/personal-agent/pull/74)，基于飞书试点分支/PR73，已推送并附本任务，尚未合并。

从干净飞书试点head `94aca6b` 新建 `fix/desktop-network-0.10.21`，产品固定 **543dc9cb4716da413fd23afa5ceb2a5154ed4dcb**。现装0.10.20的地址正确、后台正常，脱敏日志有约21秒超时/重置；同机Electron22对比Node8次有1次超7秒、Chromium8次均200，系统代理已存在。桌面API转发改用Chromium net，保留固定服务、会话/CSRF/取消/截止边界；真实22版压缩、空POST和事件顺序已复验，不新增写请求自动重发。[诊断与交付](deployment/acceptcat-0.10.21.md)。

Windows x64 **C:/Users/luo/Desktop/AcceptCat_0.10.21.exe** 已制作，**87,425,242字节**，SHA256 **061a5e162c74c877dd65b95d19222aa9b65e0084a65548c317fe3f9b437ee8f7**。实际NSIS载荷、17JS/8CSS、52运行包/55装配包、新调用点与旧功能核对通过，隐藏隔离原生启动通过，既有electron-log提示保留。未代安装/退出旧版或清理数据，用户需覆盖安装获得修复；无公开Release/更新源变更。

渲染/主进程类型、36项定向通过；真实Electron22网络和线上公开health16/16成功，实际React/HTTP/SQLite经原生转发走通断线→恢复→重试→新建集合→任务/资料栏目切换。仅合成账号，无生产会话、真实模型或私人资料试读；既有Router/AntD提示保留，无新运行异常。Git外 `.runtime/desktop-network-20261020` 保留失败与最终证据。API/契约/Skill未改，不重复根693项CI。

后台/数据库/飞书本批未变，仍为下述0.26.0/schema023、image4ee12e77、飞书0.1.0仅罗岩。代码、安装包、用户安装、后台部署及公开发布分别记录。

## 前批次0.10.20：飞书本人试点后台已部署，应用已发布

评审入口：[草稿PR73](https://github.com/luoyan96/personal-agent/pull/73)，基于release/acceptcat-0.10.19，已附本任务；代码与记录已推送，尚未合并。

从实际干净 `release/acceptcat-0.10.19` / `b497bde01cff96c0a24b5f3422f29485a1581e95` 新建 `feat/feishu-readonly-pilot`；产品代码固定 **2bbcfbce2e369fe8b64a92caf0dd22350a22b870**。用户同意优先连接课题组已有飞书，[首批实现与边界](development/feishu-readonly-pilot.md)：资料库连接入口、本人 OAuth/PKCE、选定 docx 或 wiki/docx 纯文本预览、确认保存私人文字副本、连续原文片段带入新的任务规划对话。沿用资料库版本/引用与 Agent 显式集合绑定；没有知识库全量同步、自动授权 Agent、成果写回或群消息。

contract **0.26.0** / schema **023**，新增三张飞书表，不改旧业务表。首批不申请 offline_access、不过期自动刷新，按令牌返回时限重新授权。保存前重读权限/修订/哈希，账号/空间/会话/连接变化拒绝迟到响应；密钥和令牌不下发客户端，预览加密、十分钟、每人最多五份。默认未配置时显示真实缺少配置状态。

**693项/55文件全量CI、2项生产CLI检查及进程/构建/类型/契约检查通过**，客户端类型与6项规划helper检查通过。实际React/HTTP/SQLite与合成飞书服务走通预览、勾选保存和规划输入衔接；没有真实模型调用、实际文档试读或正式任务创建。首败为旧迁移夹具/版本断言，修正后通过；证据与失败日志在 Git 外 `.runtime/feishu-pilot-20261020`。

**Windows0.10.20候选安装包已制作、复制桌面** `C:/Users/luo/Desktop/AcceptCat_0.10.20.exe`，87,422,226字节，SHA256 `7abe46bad498dd58eac626b4325d8f966c666d83e38454d8de00909dca2eb9ad`。实际NSIS载荷与受测EXE/ASAR一致，17JS/8CSS逐字节匹配生产dist，飞书入口存在、QA材料未打包，隐藏的隔离数据目录原生启动通过。未代安装或关闭现装，0.10.19旧包/数据保留；没有公开Release或更新源变更。

用户明确批准上线本人试点后，2026-10-20 10:58已发布飞书“AcceptCat 科研资料只读接入”0.1.0，后台显示已启用/已发布/审核通过，**可用成员仅罗岩**、对外共享关闭。保留 **用户身份** `contact:user.base:readonly`、`docx:document:readonly`、`wiki:wiki:readonly`，范围与用户权限一致，精确回调 `https://chat.acceptcat.com/api/v1/feishu/callback`。App Secret已通过隐藏终端输入，仅保存服务器root/0600文件，API内复制为0600；未进入Git、镜像、安装器或明文输出。没有绑定真实用户、读取私人资料或扩大到全企业。

**后台已配对部署API/worker，contract0.26.0 / schema023。** 组合修订 `47c42ac+key-preview.4bc8d1f+feishu.2bbcfbc`，镜像 `research-openim-api:feishu-20261020` / `sha256:4ee12e77f80da2e196e6640980dbdb521a1bfa5e168ac1ced6012f387e63ea0d`；仅覆盖12个运行源码，生产原公共目录种子保持。新备份及恢复副本演练022→023→022→023通过，91旧表/6原件逐项哈希一致；线上显式迁移后、启动前再次一致，启动后个人/课题组模型凭据与默认选择整表哈希未变。其余六服务和既有设置不变，API仅新增飞书环境变量/只读secret挂载。公网ready200、DB/storage/auth ok、Harness not_verified；飞书匿名401、无效callback400并带no-store/CSP/no-referrer；服务器配置检查configured:true。详见[部署与回退记录](deployment/feishu-pilot-20261020.md)。

保留隔离HTTP首败：测试脚本漏开B3_AI_ENABLED，修正后通过飞书OAuth/预览/私人导入幂等/旧Key预览，不改产品代码。GitHub ba6dc89首轮Ubuntu22/24成功，Windows既有execution A12用例5秒超时，仅重跑失败节点后5分56秒成功，run39360378751三平台最终通过，未改测试时限。部署文档6fde7a7已推送，225份Markdown/10份Skill及diff检查通过；其新一轮远端文档head CI另行运行。真实OAuth、用户选定文档、科研质量仍待本人在0.10.20操作验证；飞书应用发布与AcceptCat公开发布分开，本批无Release/更新源变更。Git外证据 `.runtime/feishu-pilot-20261020`。

## 最新批次0.10.19：保存后的模型身份与密钥脱敏预览，后台已部署

实际从干净release/acceptcat-0.10.18 / 513dd3e接续0.10.19，产品/API/契约和包固定 **4bc8d1f7cde314a1a9a99d3360b49a8647d43497**。模型设置顶部显示真实默认型号/服务商/配置名；左侧列具体模型，已保存Key只读显示首尾、更换使用单独空输入框，遮罩/空白不能误提交。保存改名/型号保留原Key；移除后清预览，后台版本/账号隔离。[实现和范围](development/saved-model-preview.md)。保留0.18任务规划与既有功能，未切main或覆盖修改。

原接口只有hasApiKey，原严格响应不变；契约兼容补丁0.25.1新增本人只读key-preview路由，长Key首尾各4位、短Key各2位，中间固定8遮罩。不返回完整Key/密文，不新存预览，不向模型或联系人传输，不做迁移。匿名401、跨账号404、密文移植/解密失败安全503；旧后台/读取失败显示已保存和预览暂不可用，仍可管理配置。

根完整ci最终通过：54文件/680项、构建/类型/导出、2项生产装配、B0进程/生产无夹具；个人模型专项12项、客户端类型与实际IAB/React/HTTP/SQLite的保存/替换/省略/移除/刷新、默认Qwen切换、旧404/503、延迟换账号与1536/1024实拍通过。新error0、已有Router警告2；原始可空类型和Web测试旧版本断言首败留证，修后重验。无真实供应商请求或生产私人Key读取。

**Windows0.10.19已制作并复制桌面** `C:/Users/luo/Desktop/AcceptCat_0.10.19.exe`及说明，**87,419,799字节 / SHA256 ad49a0c4ae921a0048152d7e9e651fb4addf49f1a269eb5b5fb4241da5b6b650**。17JS/8CSS逐字节、真实NSIS载荷与隔离原生启动通过，旧日志警告保留；未代安装/关现装/删旧数据。[交付与待部署边界](deployment/acceptcat-0.10.19.md)，证据Git外 `.runtime/model-config-summary-20261019`，根design-qa.md更新。

**用户明确授权后，本人只读预览接口已独立部署，未公开发布。** 生产基于实际核对的47c42ac/b78613b5镜像，只覆盖受测4bc8d1f的四个API/契约源文件；新镜像8defb397，OCI revision明确标为47c42ac完整SHA+key-preview.4bc8d1f，不是整条桌面分支覆盖生产。[部署、备份和失败记录](deployment/key-preview-20261020.md)。schema022无迁移，91表/6原件停写备份及恢复副本一致，启动后已有凭据与默认选择整表哈希未变；其余六个服务、运行设置不变。首次审计只读挂载失败后已恢复旧服务，修挂载后第二次成功，日志保留。新镜像隔离真实HTTP通过首尾/重启/匿名401/跨账号404/旧响应兼容；公网09:19 ready200/0.25.1、db/storage/auth ok，新路由匿名401，harness仍not_verified。未读取生产完整Key或调用模型；使用0.10.19重新进入模型设置即可读取已有Key预览，无需重填。实际公开latest再次核对仍v0.6.0，无Release/更新源/目录操作。证据Git外 `.runtime/key-preview-deploy-20261020`。

[草稿PR72](https://github.com/luoyan96/personal-agent/pull/72)已推送、创建并附当前任务，base release/acceptcat-0.10.18；首读86ec606三项Foundation均QUEUED，不称远端已通过。220份Markdown/10份Skill及diff检查通过。4956/4957合成预览保留，30304/24972完整Node命令见preview-retained.json；不是正式部署。桌面最终包87,419,799字节/ad49a0c4 hash及说明已读回；包和API源码仍固定4bc8d1f。

## 最新 Windows 0.10.18：与任务规划 Agent 连续沟通并创建任务

`release/acceptcat-0.10.18`接续实际干净的0.10.17 / b11e1f5，未切main；产品与最终包固定 **8bf46f17ee720f2e8c5e028001b4dda384c077db**。按用户图将右上规划按钮改为底部常驻聊天，直接说目标、回答追问、连续修改分工/交付，再在对话内说“确认创建任务”；真实版本校验后建立任务、刷新课题组进展并直达详情。研究计划为完整聊天/折叠记录，旧链接接上下文；保留既有三栏、个人助手与我的任务衔接、权限和连接恢复。[实现与限制](development/task-planning-agent.md)。

本机对话/输入/待核对操作按服务、账号、课题组隔离；服务端仍保存计划和任务。每轮连续上下文有长度上限，不自动跨设备同步；已经确认的任务通过任务详情修改。明确日期可显示/确认，复杂时刻/多日期要求继续澄清。未知回执复用原幂等键，其他窗口改动阻止确认；取消前读同一任务最新版本并处理排队竞态。未入组个人不显示课题组内容，未配模型明确提示并保留原文。

59项定向、最终类型通过，中文序号收尾后13项helper/类型通过；实际IAB/React/HTTP/SQLite/ExecutionWorker合成模型验证追问→三轮修改→确认前0任务→确认3任务、两种丢回执恢复不重复、停止、错误/断线输入、账号/个人空间、详情/返回计划及1536/1024布局。原始首败与HMR夹具问题保留，清洁重载新error0、已有Router警告2。无共享/内置Skill变化，不重复根全套；不称真实供应商/IM或科研质量已验收。

**Windows x64 NSIS0.10.18已交付桌面** `C:/Users/luo/Desktop/AcceptCat_0.10.18.exe`及说明，**87,419,218字节 / SHA256 57b2c6e94b2395b52c307c96a2fde08658fd54d5ccf800ccf2cce95bed9edbcf**。17生产JS/8CSS逐字节、实际NSIS载荷、隐藏隔离原生启动通过，既有日志警告保留。首个候选另存before-ordinal证据，桌面仅最终包。未代安装、关闭用户现装或删除旧包/数据。[交付记录](deployment/acceptcat-0.10.18.md)，Git外证据 `.runtime/planning-agent-20261019`；根design-qa.md已更新。

无需新API/迁移/数据库同步，本批未部署后台或发布目录/Release/更新源；公网ready实际200/0.25，db/storage/auth ok、harness仍not_verified。生产47c42ac/b78613b5沿前批inspect，本批无容器新inspect；实际公开latest仍v0.6.0。自助开组/已有账号加入/多组、独立共享方向、复杂日程、长对话管理、跨设备聊天和真实科研规划质量待后续；PR50/PR68及PR66目录运营各自独立，服务器磁盘/网络长期风险未被短时健康探针消除。

[草稿PR71](https://github.com/luoyan96/personal-agent/pull/71)已推送、创建并附当前任务，base release/acceptcat-0.10.17。首读dfaea8b三项Foundation均IN_PROGRESS，pr-final.json留证，不称远端全过。218份Markdown/10份Skill与diff通过。保留4946/4947合成预览，8824/31556完整Node命令见preview-retained.json；预览不等于生产部署。桌面最终包hash/大小与说明已读回，用户现装未由本次操作替换或关闭。

## 最新 Windows 0.10.17：按用户标注调整课题组任务与进度

`release/acceptcat-0.10.17`接续5c30f5d，产品与包固定 **12c100d1cd70d4a38205c1b739e402a40578f5c2**。按用户在旧版上的批注，恢复简洁布局并移除0.10.16照片欢迎区；主栏为课题组任务/我的任务/资料与素材库，计划及定时安排并入我的任务，旧链接保持。上层列正在推进/准备开展的方向，下层按真实planId归组，展示任务、分工、截止、阻碍、成果和明确验收进度；成员摘要区分承接/审阅/邀请。只读获准任务，私人目标仍仅本人可见，摘要无进度详情时标记未知，个人未入组只有说明。[实现与限制](development/lab-task-progress.md)。

46项定向/最终类型、23条分项IAB真实React/HTTP/SQLite与1536/1024实拍通过；合成8项任务包含学生接受/交付、导师验收，正确1/3；草案不提前共享、方向/搜索/待审/详情/返回计划、503清旧统计及恢复、账号隔离、定时导航通过。跨页同snapshot最多1000项并明确截断，不拿本页推全组；依赖排序和重复分页/变版/取消有边界检查。无共享/内置Skill变化，不重复根全套；SDK/IM夹具不计真实模型和科研质量。根design-qa.md已对照源图与实拍通过。

**Windows x64 NSIS0.10.17已交付桌面** `C:/Users/luo/Desktop/AcceptCat_0.10.17.exe`与说明，**87,417,662字节 / SHA256 a5369f56cdc51b5b063a79dfbe05241acf2191455332247048bfba725d5d2156**。17生产JS/8CSS逐字节、NSIS实际载荷与最终隐藏隔离原生启动通过，旧日志警告保留；检查器补齐JSON回执写入竞态容错，仍保留启动期限。包内产品固定12c100d，后续仓库检查脚本/文档不改变载荷。未代安装、关现装或删旧数据。[交付](deployment/acceptcat-0.10.17.md)。证据在Git外 `.runtime/lab-progress-20261019`；前一候选包/首败另留证，桌面为最终hash。

无新API/迁移/后台部署或目录/公开Release/更新源变更；本次公网ready200/0.25，harness仍not_verified，生产47c42ac/b78613b5沿前批inspect。actual latest仍v0.6.0已核对。独立共享方向编辑/跨计划OKR、自助开组/已有账号加入/多组仍待后续；PR50/PR68及真实科研质量独立。目录11项/7仓库沿PR66记录，本批未发布。保留服务器85%磁盘和代理链路长期稳定性风险，未将短时探针称根治。

[草稿PR70](https://github.com/luoyan96/personal-agent/pull/70)已创建、推送并附任务，base release/acceptcat-0.10.16。首读16c6b97三项Foundation均IN_PROGRESS，pr-final.json留证，不称远端全过。216份Markdown/10份Skill及diff检查通过；main客户端0.3.0再次按远端包manifest核对。保留4936/4937合成预览供用户查看（26488/28896，完整Node命令见preview-retained.json），不是正式后台；viewport已reset、预览页标记交付。用户现装四进程未动，最终包与说明hash读回一致。

## 最新 Windows 0.10.16：清楚的科研起点、待办与进展

`release/acceptcat-0.10.16`接续04dd9ba，产品/包固定 **6c50ea9c67e810a1cb5ab7c957af42bbaa519294**。总览突出新建科研计划与三个带目标的研究起点，个人待办/研究进展分栏；空状态隐藏零统计、筛选、分页和空成员栏，有任务显示简洁表格、完整详情与快速查看；范围/协作和成员下一步折叠，四主栏目及助手抽屉保持。复用原品牌照片/Ant图标，生成两状态设计后实际实现。[设计/实现/QA](development/workbench-home-redesign.md)。

选入PR67产品3ed606a为6b13c33：跨登录旧请求/CSRF/401/写入取消；待办、详情和列表补actor读取门槛。未覆盖其他任务文档/分支，PR68内置统计Skill未集成，不计为本包更新。38项定向/最终类型、24条分阶段IAB/cua_repl真实React/HTTP/SQLite与1536/1024/430实拍通过，首次起点0计划0任务、保存1草案0任务、确认3任务、学生提交后导师准确待审；旧任务个人404、503区分空状态、账号切换/断线目标保留与助手抽屉通过。原生IM/SDK为夹具投影，无真实模型/科研质量验收；首败/已有警告保留，无共享/Skill改变，不重复根全套。

**桌面Windows x64 NSIS0.10.16已交付** `C:/Users/luo/Desktop/AcceptCat_0.10.16.exe`与说明，**87,416,748字节 / SHA256 d9ee235500f8fafdf8c6c28a434e0f6eb5a28238ed94d33049a1c3a27f52222f**。55运行依赖、17生产JS/全部CSS逐字节、新层级/原品牌/无QA、实际NSIS载荷一致、隔离原生桥/renderer稳定启动通过，旧日志初始化警告保留。[交付](deployment/acceptcat-0.10.16.md)。未代安装、关闭用户现装或删旧包/数据；Git外证据 `.runtime/workbench-home-20261019`。

本批无API/迁移/后台部署、目录运营或公开Release/更新源变更；本次公网ready200/0.25，harness仍not_verified；生产47c42ac/b78613b5沿上批inspect，本次不新inspect。actual latest仍v0.6.0已核对。独立[目录运营PR66](https://github.com/luoyan96/personal-agent/pull/66)已报告三项上线，目录11项/7仓库，本批读回其交接，旧三项待发不再作为当前阻碍；本次没有自行发布目录。PR50后台正文边界、自助开组/已有账号加入/多组、通用工具执行与真实科研质量仍待后续；服务器85%磁盘/代理链路长期稳定性沿前批风险。

[草稿PR69](https://github.com/luoyan96/personal-agent/pull/69)已推送、创建并附任务，base release/acceptcat-0.10.15。首读5e445e0三项Foundation均in_progress，pr-final.json留证；前批PR65/04dd9ba三项SUCCESS已实际读回，不套用本支。214份Markdown/10份Skill及diff通过。只按完整Node命令核对关闭本批4926/4927的31580/33580，无监听；用户现装4进程保持，viewport已reset、QA页关闭，cleanup.json留证。桌面包最终hash与说明读回一致；产品/包始终固定6c50ea9。

## 最新 Windows 0.10.15：工作台连接恢复与实际生产核验

`release/acceptcat-0.10.15`接续0.10.14/f153d48，产品与打包源码 **a3a795b74775039c483c33903363efd20ecce5fc**。总览合并重复健康请求，当前账号已确认的公开契约版本不会因一次健康复查失败而卸载任务/未保存草稿；显示真实连接警告、保留退避轮询、增加online/回到可见页复查。首次失败/旧版仍阻止未确认功能，账号变化清版本记忆；业务403清旧统计，不保留授权事实。健康读取传递AbortSignal。[诊断及QA](development/service-connectivity-recovery.md)。

现装0.10.14实际地址正确、ASAR与交付一致；传输日志有ETIMEDOUT/ECONNRESET，本机Clash虚拟地址链路正在使用，尚不能单独归因代理。公网与现装loopback代理各3次ready200/0.25。Edge既有Workbench会话已恢复，生产API/worker实际镜像b78613b5/revision47c42ac，healthy/running、restart0/无OOM，其他六服务运行；服务器ready约0.19秒。**本批无需数据库同步或后台升级，未部署/重启或改网络权限。** 磁盘85%/约7.3GiB可用需后续维护；current指针仍旧94b26d1，实际后端版本按容器核验，不凭该指针推断。

21项定向、类型、8组真实React/HTTP/SQLite合成流程与1536/1024实拍通过，pageerror0。包括10秒超时草稿保留、首次失败/online恢复、旧契约/账号切换、约20秒无操作轮询恢复、403清除统计；夹具选择器/挂载时机/统一错误映射首败与既有警告保留。未读取生产科研材料、验证真实IM/模型或长期网络稳定性。无共享/内置Skill变化，不重复根全套。Git外证据 `D:/deepseek-agent/.runtime/service-recovery-20261018`。

**Windows x64 NSIS0.10.15已交付桌面** `C:/Users/luo/Desktop/AcceptCat_0.10.15.exe`与说明，**87,413,798字节 / SHA256 11484e44a5f843139a513e418326dee445cf8696b287df5b79f19d8149190a58**。55依赖、17生产JS逐字节/新警告/无QA、NSIS实际载荷一致、隔离隐藏原生桥/renderer稳定启动通过，已有日志初始化警告保留。[交付](deployment/acceptcat-0.10.15.md)。未代安装或关闭现装/删除旧包与数据。

无社区目录发布、公共Release或更新源变更，actual latest本次仍v0.6.0。PR50后台边界和三项目录运营独立待办保留；维护登录已恢复，不再需用户重复登录。课题组自助创建、已有个人账号加入、多组及工具执行仍未实现。后续围绕真实课题使用及网络复发证据继续，不能把本次短时探针当永久根治。

[草稿PR65](https://github.com/luoyan96/personal-agent/pull/65)已创建、推送并附任务，base release/acceptcat-0.10.14；首读8cf79c3三项Foundation为1queued/2in_progress，pr-final.json留证，不称远端全过。212份Markdown/10份Skill及diff检查通过。本批QA4916/4917仅按完整Node命令核对后关闭32400/29664，端口无监听、用户现装仍运行，cleanup.json留证；本次云端只读shell已exit，Aliyun账号未退出。包与说明均再次读回。

## 最新 Windows 0.10.14：科研分工与个人助手任务衔接

`release/acceptcat-0.10.14` 接续 PR63 / 9b32c56，产品与安装包源码 **6d643df393b91ce9f5a5c6d3bfb6b6d6a173d3fb**。科研计划与联系人协作入口分开，计划可批量安排自己/同组邀请/待认领、确认前逐步预览；稳定类型链接连接计划/总览/准确任务及返回所属计划。个人助理聊天与总览读取同一工作台待办，委派按真实turnId定位对应任务，任务可返回真实来源对话；预选Agent与成员保持一致，新建个人任务不残留科研类型。包含PR63未打包的折叠按钮移除及课题组身份边界。[实现及QA](development/assistant-workbench-tasks.md)。

客户端32项/最终类型、11组分阶段真实React/HTTP/SQLite/合成ChatWorker与1536/1024实拍通过，通过阶段pageerror0；新增6项边界在类型修正后再次通过。首败与明确503/404故障保留，未放宽ACL/限流/版本/成员接受。原生SDK与聊天映射为投影，来源返回实测为本地IM未连接，不计真实模型/IM/科研质量；前批PR63三项Foundation已读回success。Git外证据 `D:/deepseek-agent/.runtime/task-workbench-20261018`，无共享/内置Skill变更，不重复根全套。

**Windows x64 NSIS0.10.14已交付桌面** `C:/Users/luo/Desktop/AcceptCat_0.10.14.exe` 与说明，**87,418,294字节** / SHA256 **b8700d88411776da4716ef0ea1695a031aaee995562b1b84cfa88435e4ff02e7**。实际55依赖、17生产JS逐字节、无QA/旧折叠入口、实际安装载荷EXE/ASAR与隔离隐藏原生桥/renderer启动通过，既有日志初始化警告保留。[交付](deployment/acceptcat-0.10.14.md)。没有代安装、关闭现装或删除旧包/数据。

无新后台接口/迁移、API/worker部署、目录运营、公共Release或更新源；actual latest本次核对仍v0.6.0。旧生产47c42ac/0.25/1.12/022仅沿用记录，未新inspect。课题组自助创建、已有个人账号加入、多课题组仍未实现；PR50后台边界、三项目录及既有维护登录待办保持。

内容检查210份Markdown/10份Skill及diff通过；本批QA4906/4907按完整Node命令核对后关闭（Vite22660/API32612），端口无监听，cleanup.json留证，旧服务与用户现装保持。

[草稿PR64](https://github.com/luoyan96/personal-agent/pull/64)已创建、推送并附当前任务，base为fix/lab-capabilities-entry。首读701e03a三项Foundation均IN_PROGRESS，pr-final.json留证，未声称本支远端全过；产品与包仍固定6d643df。

## 最新本地修正：聊天列表入口与课题组身份

`fix/lab-capabilities-entry` 接续 `release/acceptcat-0.10.13` / `ff0f21e`。移除聊天收起/展开按钮及专用状态；“课题组能力”按服务端 session 身份显示：个人空间只有未加入说明且不读取目录，身份未知/失败保留真实状态，已加入账号沿用同组目录，负责人可打开既有网页邀请管理。此前个人空间自身成员/Agent被当成课题组内容的问题已修正。[实现与实际管理边界](development/lab-capability-membership.md)。

客户端27项/类型/生产Web与四份固定SDK资源检查、8组分阶段真实React/HTTP/SQLite通过，1536/1024实拍已看，通过阶段pageerror0；SDK/聊天记录为明确投影，无真实IM/模型或生产材料。夹具选择器/取消/重定向与首次登录等待首败保留，未放宽权限/限流。Git外证据 `D:/deepseek-agent/.runtime/lab-capabilities-20261018`。本批尚未制作新安装包、部署后台或公共发布；桌面0.10.13仍为原受测包。课题组目前仍由维护者开通、负责人网页签发邀请码、成员注册时加入；客户端自助创建与邀请已有个人账号尚未实现。PR50/三项目录与旧维护登录待办保持。

修正提交 `2fe690fb32f72d57ca3189e4953768c25c750836`，已推送并创建/附上[草稿PR63](https://github.com/luoyan96/personal-agent/pull/63)，base为release/acceptcat-0.10.13；首读该提交三项Foundation均进行中，未计为远端通过。仅关闭本批完整命令核对的API4897/Node22000与Vite4896/Node30680，端口无监听，cleanup.json留证，旧服务未动。

## 2026-10-18 接手核验

实际工作目录 `D:/deepseek-agent/research-agent-platform-chat-integration`，接手时分支 `release/acceptcat-0.10.13`、HEAD `ff0f21ea6c702c53286f04bb9c3d833be723822d`，工作区干净；未切换到 main。已读取根 AGENTS、当前状态、日志最新记录、README 与路线图。Git 因目录属主不同拒绝初次读取，后续仅使用命令级 `safe.directory`，未修改全局 Git 配置。

本次实际重新计算桌面 `AcceptCat_0.10.13.exe`：87,406,620 字节，SHA256 与下方交付记录一致。GitHub API 读回 PR62 仍为 open/draft、base `release/acceptcat-0.10.12`，head 为上述 ff0f21e；该提交三项 Foundation（Windows/Node24、Ubuntu/Node24、Ubuntu/Node22.19.0）均 completed/success。公开 latest 仍为 v0.6.0。本次仅交接核验及文档更新，未重跑产品测试、安装软件、检查或部署生产、发布目录/Release/更新源；原生产版本仅沿用历史记录。继续保留 PR50 配套后台边界、三项社区目录运营与既有维护登录待办，以及真实师生科研使用验收；等待用户下一项具体需求。

## 最新用户改动与Windows0.10.13：独立“我的”，工作台四主栏

`release/acceptcat-0.10.13`接续PR61 / 13eea26，产品及安装包源码 **8acfbed107b222c4c4f404068c8ecc6cbb821eff**。侧栏广场下“我的”独立页集中个人资料、模型、记忆、通用设置、版本/诊断，头像直达，无底部设置或头像信息Pop。我的Agent/课题组能力移入；工作台只保留总览/规划/任务/资料，定时任务与本机报告分别归规划/资料。实际资料写入、账号显示、技能返回定位和旧链接重定向；无新后台接口或迁移。[实现及QA](development/my-workspace-navigation.md)。

客户端27项、最终类型、11组分阶段真实React/HTTP/SQLite、1536/1024实拍通过；通过阶段pageerror0。修复我的根布局缺少flex column，重新实拍；夹具图标名称/v前缀/任务标题、模型平台关闭503及未填时间/时区首败保留，补齐真实条件续验，未绕过ACL/校验。账号切换后迟到A资料响应不覆盖B身份/草稿；原生报告/版本/偏好为桥接投影，未计真实模型/IM、文件打开、更新下载或日志上传。Git外证据 `.runtime/my-workspace-20261018/qa-summary.json`，前批PR61三平台Foundation读回SUCCESS，无共享/Skill内容修改，不重复根全套。

**Windows x64 NSIS0.10.13已交付桌面** `C:/Users/luo/Desktop/AcceptCat_0.10.13.exe`及说明，**87,406,620字节** / SHA256 **d3df15b6280a953a6065e601f357957575321334bdaecb028c743f0eacc591d7**。实际55依赖/18生产JS逐字节、无QA/猫咪素材、NSIS载荷EXE及ASAR一致、隔离隐藏原生桥/renderer稳定启动通过，既有日志初始化警告保留。[交付](deployment/acceptcat-0.10.13.md)。未代安装/关现装或删旧包/数据。

无API/worker部署、目录运营、公共Release或更新源变更；actual latest仍v0.6.0本轮核对。旧47c42ac/0.25/1.12/022仅沿用记录，无本轮生产inspect；PR50后台边界、三项目录与既有维护登录待办保持，不重复请求。

[草稿PR62](https://github.com/luoyan96/personal-agent/pull/62)已创建并推送，base为release/acceptcat-0.10.12。当前没有attach_artifact可调用工具，未附任务附件，保留直接链接。本轮4886/4887完整命令核对后关闭API23092/Vite13592，cleanup.json留证，旧预览未动；本支CI状态以实际PR为准，不套用前批SUCCESS。

## 最新用户改动与 Windows 0.10.12：技能收进我的 Agent

`release/acceptcat-0.10.12` 接续 PR60 / a6bb210，产品与安装包源码 **da1858ecb7fe2876fc25b11a714d4cdf4f51e45c**。工作台删除并列“我的技能”，我的 Agent 内增加技能库；本人站内助手配置统一“技能 / 资料”，实际读取绑定数量/版本/启停，添加和管理定位目标助手，明确绑定保留其他助手与授权，返回恢复原助手。旧 view=skills/catalog 链接兼容；无新 API/迁移。[实现与 QA](development/agent-skill-management.md)。

27 项客户端、最终类型、7 组分阶段真实 React/HTTP/SQLite 及1536/1024实拍通过，通过阶段 pageerror0。合成包选择器投影不是原生导入或真实模型/IM验证；好友授权夹具/两字按钮选择器首败和重复登录429保留，完成实际好友接受、修选择器、新隔离库与路由导航后续验，未放宽 ACL/限流。无共享/内置Skill修改，不重复根全套；前批 PR60 三平台 Foundation 已读回 SUCCESS。证据 Git 外 `.runtime/agent-skill-hierarchy-20261018/qa-summary.json`。

**Windows x64 NSIS 0.10.12 已交付桌面** `C:/Users/luo/Desktop/AcceptCat_0.10.12.exe` 及说明，**87,403,174字节** / SHA256 **990c217477b6747d49c5ae8da32bade0437df7ce1febc01f6dc01275aa900892**。55依赖/15生产JS逐字节/目标配置文案/无QA、实际安装器 EXE/ASAR 一致及隔离隐藏原生桥/renderer稳定启动通过，既有日志初始化警告保留。[交付记录](deployment/acceptcat-0.10.12.md)。没有代安装、关闭用户现装或删除旧包/数据。

未部署 API/worker、发布目录、公共Release或更新源；实际latest仍v0.6.0本轮核对。旧47c42ac/0.25/1.12/022仅沿用记录，无本轮生产inspect；PR50后台边界、三项目录与既有维护登录待办保持，不重复请求。

[草稿PR61](https://github.com/luoyan96/personal-agent/pull/61)已创建并推送，base为release/acceptcat-0.10.11。当前工具列表没有attach_artifact，未附到任务附件列表；保留直接链接，不声称已附。核对本轮4876/4877完整Node命令后关闭API26060/Vite7536，cleanup.json留证，旧预览未动。本批GitHub检查以实际PR状态为准，不将前批三平台通过套用于本支。

## 最新用户改动与Windows0.10.11：广场发现，工作台管理

`release/acceptcat-0.10.11` 接续PR59 / 8b3386b，产品和安装包固定 **d0386f0503701eff530a89e0e282ecc93354901d**。按用户截图要求移除广场“发现能力/课题组能力/我的Agent”整排顶部导航，无空toolbar占位；广场保留GitHub推荐/Star热门/最新/方向与搜索。课题组能力、本人及内置助手移入工作台独立栏目（`view=capabilities`/`view=agents`），复用原配置、资料绑定、聊天和名片管理，不改授权/API。[实现和QA](development/square-workbench-navigation.md)。

27项客户端/类型、7组分阶段真实React/API/SQLite与1536/1024实拍通过；实际模板添加/资料绑定读回、公开撤回、其他栏目及B隔离通过，pageerror0，无未解释console。fixture六仓库数组用于七仓库的500与选择器/标题/动画首败保留，修夹具后续验，不改产品ACL/限流。无共享/Skill内容修改、不重复根全套；前批PR59三平台SUCCESS已读回。证据Git外 `.runtime/square-workbench-20261018`，无真实IM、模型或生产私人数据验证。README当前预览明确合成目录事实。

**Windows x64 NSIS0.10.11已交付桌面** `C:/Users/luo/Desktop/AcceptCat_0.10.11.exe` 及说明，**87,401,103字节** / SHA256 **0c763b4dd18ea9f34c3d629327d83dc4bdf3f46f366a4668d273b8cbd0568530**。实际55依赖/15生产JS/无旧范围行/无QA、安装器payload EXE和ASAR一致及隔离隐藏原生桥/renderer稳定启动通过，既有electron-log警告保留。[交付记录](deployment/acceptcat-0.10.11.md)。未代安装/关闭现装或删除旧包/数据。

无需后台升级/迁移；未部署API/worker、发布目录、公共Release或更新源。实际latest仍v0.6.0已核对；旧47c42ac/0.25/1.12/022仅沿用记录，本轮未新inspect生产。PR50后台边界/三项目录运营/旧维护登录待办保持，不重复请求。自建4866/4867核对完整Node命令后关闭，旧预览未动。

[草稿PR60](https://github.com/luoyan96/personal-agent/pull/60)已创建并推送；首读c2c70c5三平台Foundation均进行中。当前工具列表不再提供attach_artifact，实际尝试TypeError且检索未找到，未称已附任务，链接在此保留。自建4866/4867 Node24244/7076完整命令核对关闭，cleanup.json留证。

## 最新技能库与Windows交付：0.10.10，素材导入范围与恢复

`acceptcat-2`，`release/acceptcat-0.10.10` 接续PR58 / da6ec83，产品和包源码 **24858567a318ab4302f53eead42713e1405dea1f**。Skill原件加入资料库改用现有文件导入：选集合/读原件只准备，确认后才上传；保留原路径/修订/SHA256、首次快照/key的未知结果重试、已确认结果分流和范围变化阻断。读取期间锁定目标，换账号/会话/Skill/面板清除迟到结果；清单失败不再显示无原件，普通本机文件导入保持。[实现与QA](development/skill-material-import.md)。

客户端22项/0跳过、类型、真实React/HTTP/SQLite/本机原件九组及窄窗/普通导入专项通过；服务器保存后丢响应重试仅一份来源，私人变公开旧窗口零写入、B私人/本机原件拒绝而团队/公开按范围可读。1536/1024最终实拍已看，pageerror0、无未解释错误；夹具/截图动画首败和既有警告保留。无真实模型或生产私人材料，未修改共享/内置Skill、不重复根全套；前批PR58三平台SUCCESS本轮已读回。证据Git外 `.runtime/skill-material-import-20261018`。

**Windows x64 NSIS0.10.10已交付桌面** `C:/Users/luo/Desktop/AcceptCat_0.10.10.exe` 及说明，**87,396,801字节** / SHA256 **5f046ace333612dbf3c8d757364c14fad7800b131c8a226d6f1bd2c99e78a2e8**。55运行依赖/16生产JS/实际安装器EXE及ASAR一致、隔离隐藏原生桥及renderer稳定启动通过，既有electron-log警告保留。未代安装或关闭用户窗口，旧包/数据保留；[交付](deployment/acceptcat-0.10.10.md)。

无需新后台接口/迁移；未部署API/worker、发布目录、公共Release或更新源，实际latest仍v0.6.0已核实。PR50后台边界和三项目录运营仍待既有维护登录，本轮不重复请求或新inspect生产；旧47c42ac/0.25/1.12/022仅沿用记录。仅root活动，旧预览未动；本轮4856/4857自建服务核对关闭。

[草稿PR59](https://github.com/luoyan96/personal-agent/pull/59)已附任务，首读e20c155的三平台Foundation均进行中，未称全部通过；4856/4857 Node26636/29248已按完整命令核对关闭，回执cleanup.json。

## 最新Windows交付：0.10.9，真人与Agent跨设备名片

`acceptcat`，`release/acceptcat-0.10.9` 接续PR57/19acbe3，最终产品/打包源码 **a44e4471262757fe0df8a7618111a82282b53ee5**。修复原名片链接实际指向桌面随机loopback地址的问题，改为携带真实服务origin/唯一Contact ID的版本化名片口令；通讯录可整段粘贴、查找真人/Agent，显示服务端实际资料，同名不猜目标。其他服务先拒绝、不外访或自动切服务；真人和私人Agent仍分别申请/审批，收件人不获管理权。复制失败全选、关闭前晚结果阻断；窄窗弹窗居中及内部滚动，修复底部裁切。详见[实现](development/portable-contact-cards.md)。

客户端50项/类型/生产构建通过；真实React/API/SQLite九组、实际剪贴板/多行Ctrl+V、独立空间真人添加/同名Agent单独授权与各错误边界通过，另有1024窄窗/同查询重试专项。1536/1024实拍已看，pageerror0，无未解释console错误。CRLF/临时库定位/既有警告夹具首败与因布局问题中止的首轮构建保留，最终从修正后源码重新打包；未放宽产品权限/限流。无真实IM送达、模型或生产私人材料验证。证据Git外 `.runtime/contact-cards-20261018`；仅客户端不重复根676项，前批PR57三平台SUCCESS本轮已读回。

**Windows x64 NSIS0.10.9已交付桌面** `C:/Users/luo/Desktop/AcceptCat_0.10.9.exe` 及说明，**87,396,864字节**，SHA256 **5719cd499ebd6eb79ba5c508d2600056a824e11ce43ffb3ad3036139ef5313be**。实际55运行依赖/16生产JS/新名片行为/无QA、安装器payload EXE与ASAR哈希一致、隔离隐藏原生桥/renderer稳定启动通过，既有electron-log警告保留；没有代安装或关闭现装窗口，旧包/数据保持。[交付记录](deployment/acceptcat-0.10.9.md)。双方需升级才能识别新口令；旧版仍可用真人AcceptCat号。

名片功能兼容既有API，无新后台接口/迁移、部署、目录运营、公开Release或更新源；最新公共包v0.6.0本轮重新核实。PR50超长正文边界和三项社区目录运营仍待既有维护登录，不重复请求；本轮未新inspect生产，旧47c42ac/0.25/1.12/022仅沿用记录。4846/4847自建服务已按完整Node命令核对关闭，旧预览未动。

## 最新社区来源：统计报告与图注自查（待维护登录发布）

`acceptcat-3`，`feature/statistics-reporting-catalog` 接续PR56/47060af，目录源码 **03e4d6fa035e651afe8f257283f6cd45deaea0b9**，[草稿PR57](https://github.com/luoyan96/personal-agent/pull/57)已附任务。新增Boom5426/Nature-Paper-Skills固定6f8eaa0的统计报告/独立重复/图注自查；独立Skill未标版本，仓库0.2.0，本模块Apache-2.0、根原创MIT分别说明。中文输入/交付/费用/材料完整；明确不重算统计值，提示上游“No data were excluded”骨架不能无依据使用，不冒充期刊背书或Word工具接通。本地11项/7仓库，没有重复内置Skill或改前端组件。

15份固定原文经Git blob/原ZIP核对；实际0.10.8 ASAR解析器与新解析器输出一致，8选中原件/5参考/完整原ZIP私人往返、异账号拒绝通过。真实HTTP/SQLite/ChatWorker三组合成调用及停用/跨账号拒绝，真实React/原生预览/取消和确认私人安装三组、1536/1024实拍通过，pageerror0，既有警告/夹具首败保留。目录11项与根CI54文件/676项、生产2项/B0/隔离通过；[来源、限制与QA](development/statistics-reporting-catalog.md)，证据Git外 `.runtime/community-stats-20261018`。合成模型不计真实科研质量。

**尚未生产发布。** 本轮阿里云Workbench实际重新导航仍跳登录页，保留旧登录请求，不重复询问。前批两项与本项合并三项公共目录材料已准备，尚未上传/运行；沿既有运营CLI、固定主机/镜像、SQLite一致性备份、旧项/并发保护和发布读回，不部署或迁移。线上八项/五仓库仍仅沿用旧记录，未新inspect生产。现有Windows0.10.8已验证兼容，无需为目录新增做新安装包；没有代安装、公开Release或更新源。PR50配套部署独立待办保持；PR56三平台CI本轮读回SUCCESS。

PR57首读两平台运行/一排队，未称三平台通过；4836/4837自建服务已按完整进程命令核对后关闭，旧预览未动，维护登录页保留handoff。详情与失败证据保持，不重复已过全套。

## 最新 Windows 交付：0.10.8，AcceptCat号展示/复制与查找

用户要求把添加联系人所需ID说明并落地后，`release/acceptcat-0.10.8` 接续PR55/e099cc1，产品与包源码 **c88f2285d78c69e81785d4f8e34dc67e049e4b2c**。注册时的原用户名统一显示为AcceptCat号，昵称单独显示；头像菜单、我的资料、真人名片和添加窗口可复制真实号码，登录/注册/重号/错误提示同步，大小写和原API保持。复制成功才提示、失败选中号码提供Ctrl+C，换账号/关闭面板清除晚反馈；头像语义按钮支持键盘。没有新ID表/迁移/账号改号。

定向41项、类型与真实React/HTTP/SQLite八组通过（实际剪贴板读回、精确查号/大小写、真实发送申请/新账号同意、手动复制失败/晚反馈、注册重号）；1536/1024实拍已看，pageerror0，无未解释console错误。夹具同名定位/昵称标签与暂停动画等待失败保留并修正，只改夹具等待。详见[0.10.8交付](deployment/acceptcat-0.10.8.md)，证据 `.runtime/acceptcat-account-20261017`。

**Windows x64 NSIS 0.10.8已交付桌面** `C:/Users/luo/Desktop/AcceptCat_0.10.8.exe`，**87,393,639字节**，SHA256 **beee9d36df9bed4af51cd63b8bf18d26109cccc6ab8ebe503ed3670f21cb15a1**，安装说明同目录。实际NSIS/55运行依赖、包内0.10.8/16生产JS/新号码行为/无QA、安装器payload EXE/ASAR哈希一致、隔离隐藏原生桥/renderer启动通过，既有electron-log警告保留。旧包保留，没有代用户安装。

无需新后台接口/迁移，没有部署、目录发布、公开Release或更新源；latest仍v0.6.0已重查。PR50超长正文边界与PR51来源发布独立待办保持，不把独立待办阻挡UI交付；生产47c42ac/0.25/1.12/022仅沿用旧记录，本轮没有新inspect。仅客户端不重复根共享全套。

## 最新 Windows 交付：0.10.7 已制作到桌面

用户明确要求更新安装包后，`release/acceptcat-0.10.7` 从PR54 / c27170a接续，版本源码 **595eddaa777d082a8d690f559530700a169083a1**。Windows x64 NSIS **0.10.7** 已实际生成并复制到 `C:/Users/luo/Desktop/AcceptCat_0.10.7.exe`（安装说明同目录），**87,390,081 字节**，SHA256 **3941d839f8968626d481010eadf9afeba86c912b0ad224ec9de29637720b5834**；包含下述广场排序、Agent卡片动作/首次导航及资料库下载修复。

实际NSIS、55运行依赖、包内0.10.7/16生产JS/猫咪素材、桌面哈希与安装器payload中的EXE/ASAR一致通过；实际win-unpacked隔离隐藏启动、原生桥及renderer就绪通过，既有electron-log警告保留。PR54源码39021205757三平台SUCCESS已读回；只版本打包不重复产品全套。证据 `.runtime/acceptcat-0.10.7-20261017`，[交付记录](deployment/acceptcat-0.10.7.md)。没有代用户安装/关闭其窗口。

**本轮不再停留于源码/演示；新本地安装包已交付，但没有生产部署、迁移、公开Release或更新源发布。** 公网ready本轮200/contract0.25/ok，harness not_verified；实际latest仍v0.6.0已核实。UI使用既有API，继承PR50的超长正文边界与PR51两项目录发布仍单独待配套，不冒称在线，也不再阻挡本次桌面体验。旧安装不会自己变为0.10.7，须运行新文件覆盖安装。生产47c42ac/chat1.12/schema022仅沿用已有容器记录。

## 最新用户改动：Agent 卡片按添加状态提供操作

`feature/agent-card-actions` 接续 PR53 / e744fae；产品源码 **93da85f170285765c12aae50105ee8f82ed44912**。未添加卡片右下“查看”；真实 own/accepted Agent 右下“和它聊天”、左下“Agent 配置”，接到既有 canonical 私聊与同 ID 详情/管理入口。pending/revoked/真人和未接成聊天 Agent 的 GitHub 工具不会冒充已添加，缺聊天权限按钮禁用。独立按钮无嵌套，失败原卡重试，账号/页面/面板变化取消晚结果。

发现页的 GitHub Skill 真正安装、启用、获准并绑定本人站内 Agent 后也显示聊天/配置；精确仓库/子目录与当前关系校验，多个绑定显式选择对象，停用/解绑/读取失败不保留虚假聊天动作。仅安装未绑定仍查看，不自动创建 Agent 或执行工具。

本机版本化模板 ID 提示按账号隔离、实际所属/关系/角色重新校验，保留改名后的助手；旧添加入口共用，无提示的改名旧模板不猜匹配、不覆盖配置。实际 UI 暴露首次新 Single 会话已选择但不导航的旧问题，已在同 tick 的账号/路由/提交目标核对下修复；旧实现新例3/4，修复后四例全过，异步期间变化仍阻断。

桌面定向38项、类型、最终生产构建与真实 React/API/SQLite 14组界面通过；1536/1024截图已看，无横溢或嵌套按钮，pageerror0，无未解释错误。成功聊天采用明确 SDK/ready mapping 夹具，未配置 transport 用真实API错误验证，不计线上 IM/模型通过；[实现与QA](development/agent-card-actions.md)，证据 `.runtime/agent-card-actions-20261017`。夹具等待/服务启动/账号回入口及旧路由失败保留。演示4816/4817（PID40144/34196）为预览保留，须按preview-services.json核对进程后处理。

**没有新安装包、部署或公开Release**，现装仍0.10.6；继承PR50需配套发布和PR51目录待运营发布保持。旧登录请求不重复，本轮不新查生产或私人资料；生产47c42ac / 0.25 / 1.12 / 022仅沿用记录。仅clients/openim，无共享包/Skill/API变更，不重复根CI。

## 最新用户改动：GitHub发现、推荐/热门/最新与我的Agent分工

`feature/github-discovery-ranking` 接续PR52 / 72355c7；产品源码 **4376ca8a439f9d4cff6ec92d68738aa1fb869060**。按用户要求，发现能力只显示GitHub来源；六份内置科研模板移到我的Agent，课题组成员/Agent保留独立页。默认推荐，其后最热门（仓库Star降序）、最新（仓库代码pushedAt降序）及六个方向；已审阅与待审阅统一排序，未知值排后，候选继续没有安装入口。

推荐实际按本人明确方向/关注词与当前公开专长匹配并显示理由；无偏好时明确提示，按可用文字流程等排序，不冒称模型行为学习。版本化本机偏好按账号隔离，写入失败提示会话应用；没有读取聊天/记忆/文件或新增模型请求。原个人名片发布/撤回设置仍可管理，人物卡不再混入GitHub发现。后台每日同步与固定审阅版本、私人安装边界保持，没有新接口/迁移/内置Skill变更。

客户端23项、目录/工作台API实际HTTP/SQLite18项、客户端类型与生产构建通过；实际React14组、另有公开/撤回名片流程、1536/1024实拍通过，pageerror0，无未解释console错误。原始下拉覆盖/控件状态/动画与定位失败、测试累计登录429保留，未放宽产品限制。证据 `.runtime/github-discovery-20261017`；[实现与QA](development/github-discovery-ranking.md)。本地预览已标明演示数据，Codex打开请求返回queued（未确认面板显示）；4806/4807自建Node PID38336/29152为用户预览保留，后续勿误停其他任务。

**未新做安装包、部署或公开Release**，当前安装版仍0.10.6，旧软件不会自动包含这次修改。界面读取兼容现有API；继承PR50仍待前后端配套发版，PR51目录描述也仍待原运营流程，之前维护登录请求不重复发送。生产47c42ac / contract0.25 / chat1.12 / schema022仅沿用记录，本轮没有重新inspect或读取生产资料。

## 本轮前后端维护：资料库原件下载可靠性（待配套发版）

`acceptcat`，`fix/library-original-download` 接续PR51 / 60bd743；产品源码 **9d08fa30d870b0ee8cc20700000a02bb85868c52**，[草稿PR52](https://github.com/luoyan96/personal-agent/pull/52)已附任务。资料库现在按所选不可变版本核对响应类型、10MiB/实际大小及SHA256后才请求保存，提供停止、重试和明确版本提示；切换版本/来源/账号/面板取消旧读取，晚结果不保存。复用已有任务材料Blob保存与文件名清理，JSON/Markdown/其他合法原件类型保持。实际GET仍由服务重新授权，已保存副本不能远程收回。

旧实现新例6/8失败保留；客户端定向25项、资料API真实HTTP/SQLite10项、客户端类型通过。实际React9组流程与1536/1024实拍通过，pageerror0、无未解释console错误；实际Electron22.3.27隔离窗口v2/v1落盘SHA/中文名、模拟系统取消/重试通过，外部窗口请求0。夹具首败/登出401/复用登录限流429保留，最终新临时库验证，不放宽产品限制。只改桌面，不重复共享全套或使用真实用户资料/模型；[实现与界面QA](development/library-original-download.md)，证据 `.runtime/library-download-20261017`。

本轮保留可审阅修复，**未新打包、部署、迁移或发布公共Release**，现有试用包仍0.10.6，旧安装不会包含本轮变化。下载本身兼容现有API；集成分支继承PR50解析器待桌面/API配套发版，维护登录请求仍待回复，不重复询问。PR51两项目录描述也仍待原运营流程发布。后台47c42ac / contract0.25 / chat1.12 / schema022沿用记录，本轮未重新inspect线上或读取账号资料。根README继续保持产品展示。

协调读取上批839b131 / Foundation38934745489已三平台成功，回执 `previous-source-ci-final.json` 保留；PR50原Windows迁移超时事实不抹去、不放宽时限或重跑。PR52实现/文档头3ab1f0a的38938558378初次查询三平台运行，未计全部通过；后续文档头独立追踪。4796/4797隔离服务按完整命令行核对后已关闭；无其他文件被覆盖。

## 最新广场候选：申请书结构与数据体检（待维护登录发布）

`acceptcat-3`，`feature/research-data-catalog` 接续PR50 / 33e3aac，目录源码 **839b13112ae1051718c45e307457066d3fa1de51**，[草稿PR51](https://github.com/luoyan96/personal-agent/pull/51)已附任务。本地种子10项/6仓库：Writer申请书目标/路线/里程碑为可确认私装文字流程（Skill1.3、MIT、17原件/15参考）；Scientific Agent Skills数据体检为待接入（Skill1.4、MIT、13Python文件），实际全仓库ZIP超过32MiB且没有脚本运行时，无安装入口。明确中国申报需本次指南，提示上游NIH模块步长错误；数据体检不夸大格式、匿名化或因果结论。

实际50文件Git blob/字节/SHA与14Python静态审阅，EDA **18次**合成离线CLI（缺失/跨split对象、中文、扫描前缀、严格JSON、路径/覆盖拒绝）通过，数据/源码保持。申请书17原件与ZIP/私人存储往返，实际0.10.6 ASAR解析模块与新解析器输出一致；真实HTTP/SQLite/ChatWorker私装/绑定/仅选参考/回执/跨账号404通过，模型合成。根CI **54文件/676项**、生产2/B0/生产隔离通过；真实React/HTTP/SQLite/原生导入两组界面、1536/1024与取消零安装通过，pageerror0，既有警告保留。未重复内置Skill或改前端组件。

**尚未生产发布。** 已授权Edge维护页实际跳转过期登录页，已保留并异步请求重新登录；未写生产目录、未做生产备份、部署/重启/迁移或新安装包。上一批线上八项仍仅沿用原发布记录；0.10.6虽能兼容目录，但不能声称现在已可见。本机已准备仅两项公共描述与保护旧八项/并发重读/SQLite一致性备份的运营发布材料，均Git外 `.runtime/community-curation-20261017`；登录恢复后可继续现有CLI，不需部署PR50或生成新客户端。[来源与验证/后续](development/research-data-grant-catalog.md)。

本批source CI38934745489最后为两Linux成功、Windows运行，未称三平台全通过。协调读取PR50源码38930884416：两Linux成功，Windows旧personal-assistant的017→020迁移例5000ms超时，675/676；失败日志已保存，不放宽时限或反复重跑。后续前后端维护继续处理该门槛；本批目录候选不替代其配套发版。隔离4786/4787服务经完整命令行核对后已停止，维护登录页再次核对仍未登录并保留，只有root活动。

## 本轮技能库：文字导入边界一致（待配套发版）

`acceptcat-2`，`fix/skill-import-text-limits` 接续a6f877e / PR49，修复源码 **db87e7906db719688f1f8837b91204617a7da28f**，[草稿PR50](https://github.com/luoyan96/personal-agent/pull/50)已附任务。普通参考此前可通过本机预览却被保存API拒绝；正文恰好120,000字符又因YAML被误报缺少SKILL.md。现在普通参考、链接模板及正文统一按既有API字符上限校验，超限/空字符/原生UTF-8损坏均指出路径，保留全文、不静默截断；400KB单份、900KB总量、原件和权限边界保持。

实际本地根CI **54文件/675项**、生产2项/B0/生产隔离通过；随后追加真实HTTP/SQLite/ChatWorker边界并定向 **14项** 通过，不冒称全套676项。原生 **11项**、客户端类型与关闭composite的独立原生类型检查通过；直接composite检查的已有imageClipboard TS6307和夹具首次失败保留。三份已核对科研包 **66份原件/41份参考** 的package/manifest/digest及原ZIP与前次完全一致，原件存储往返、其他账号拒绝通过；固定绘图原包原件回归也通过。无真实供应商调用或科研质量验收。

本轮交付可审阅修复，不生成新安装包、不部署/重启后台、不迁移或发布公共Release；前后端同版解析器需一起进入下次配套发版，不能只换桌面就声称该长度边界在线修复。此前桌面0.10.6、后台47c42ac / contract0.25 / chat1.12 / schema022沿用上批记录，未重新inspect或读取用户资料。内置十项Skill正文、公共目录及私人/团队权限未改。详情见[文字导入边界](development/skill-import-text-limits.md)，证据Git外 `.runtime/skill-import-limits-20261017`。

协调回执：前批任务下载38771771667已三平台成功；目录38776266627最新是两Linux成功、Windows失败，已保存原始回执，不再称待运行或全通过。本批db87e79的38930884416已开始、尚未计为全部通过；远端状态单独记录，不重复改动前后端/广场任务，仅root活动。

## GitHub产品首页已更新：AcceptCat介绍、猫咪图标与预览

用户指出README简陋和过期后，文档提交 **52dad5f22aedaba35dbfdb44afe9c21c521871a3** 已从main6122b915普通快进发布到实际默认分支；仅12项文档/展示文件，无应用实现变化。首页围绕科研场景、师生协作流程、实际广场/交付预览、试用和开发入口组织，旧首页保留在历史快照，AGENTS约定后续工程更新不要继续prepend到README。现有集成实现与服务仍以本文件下方最新记录为准；main应用代码较早，README没有把功能分支或0.10.6试用包伪称为已公开Release。

实际latest Release仍v0.6.0/ResearchWeChat旧名；本机0.10.6的87,402,492字节和SHA256重新核对一致。新增[版本与试用说明](product-status.md)区分公开包/试用包/集成源码/服务。153份Markdown/10Skill及HTML图片/导航/固定快照链接/三图原件检查通过，实际GitHub默认首页AcceptCat正文、0.10.6与v0.6.0表格、三图加载通过；IAB650px实拍与导航核对，非应用或模型质量重验。

GitHub CLI/API多次TLS超时、连接器写入403、Edge CDP与IAB首次导航超时均保留；最终Git保留证书验证并以TLS1.2/HTTP1.1成功上传，仅按普通快进方式发布文档，没有force或绕过分支保护，未创建成功的PR不能计作已创建。备用API脚本在首个blob/PR读取时失败，无远端未知写入；GitHub实际已显示52dad5f并读回。当前集成合入相同文档，冲突只在README/状态/日志/路线，保留本分支最新工程事实。

证据Git外 `.runtime/product-readme-20261016`，公开素材来源见[说明](assets/README.md)，无部署、迁移、模型调用或安装包发布。原GitHub用户页保留，完成页在IAB展示。

## 最新收录：选题决策与可证伪假设工作流已上线

`acceptcat-3`，`feature/research-question-catalog` 接续PR48 / d8cd9e9，目录源码 **ba4aa090a0484481a0522eb5e5899340734f8ef5**，[草稿PR49](https://github.com/luoyan96/personal-agent/pull/49)已附任务。新增Anthropic官方选题/项目风险/决策路线，以及K-Dense可证伪假设/检验计划；固定SHA、适用许可、中文输入/交付、材料/费用和实际限制。前者13原件/9参考/无脚本；后者28原件/18可选文字参考与模板/8个Python文件，文字流程可确认私人安装。未复制上游正文入Git，私人资料/模型Key/团队权限保持。

根CI53文件/669项、生产两项/B0/隔离通过；41原件独立核对、原生导入/存储/原包往返、13次公开合成CLI及两组真实HTTP/SQLite/ChatWorker私人调用/选择性参考/跨账号隔离通过。实际React两组安装预览与1536/1024实拍通过，pageerror0，既有Antd/Router警告和首败证据保留。合成回复不代表科研效果；上游作者引用错误与中文因果词漏检已如实提示。脚本、PubMed/MCP、绘图均未自动接通。

两项通过既有运营CLI于 **2026-10-15T17:22:46Z**（北京时间10月16日01:22）加入实际生产目录；SQLite一致性备份/integrity_check通过，原六项逐值保持，备份 `/srv/research-openim-backups/community-review-20261015T172242Z`。GitHub同步17:22:44.578Z—17:22:50.446Z成功，最终公共缓存 **version38 / 八项 / 五仓库 / 二十候选**，全部metadata error=null；下一次10月16日16:00Z（北京时间17日零点）。后台仍47c42ac / community-47c42ac / b78613b5c6e1f77d07e7af392149744161e25460cb7e4f14b2ec0500e3fda2cc，未重启、部署或迁移，contract0.25/chat1.12/schema022保持。独立公网ready200/0.25/ok，harness not_verified。

**现有Windows0.10.6打开“广场→研究设计”刷新即可读取，无需新安装包。** 本轮不发0.10.7，不更新已安装私人Skill或公开Release。旧客户端0.10.4及以下可能无法选择包内JSON/CSV，旧安装需新版明确重新导入。远端ba4aa09的38776266627首轮两Linux成功、Windows旧registration迁移/reuse撤回测试分别15000/5000ms超时；保存失败并仅重跑失败节点，未计全通过。上一批663a033的38771771667首轮Windows旧文件解析超时，保留失败并仅重跑失败节点，尚在运行。其他分支PR35/36未包含。

[来源、验证与发布恢复](development/research-question-catalog.md)，证据Git外 `.runtime/community-curation-20261016`。隔离4766/4767服务已按完整命令行核对后停止；后续优先用授权课题资料验证中文科研交付质量，再接入受控检索和脚本执行。

## 最新交付：Windows 0.10.6 修复任务材料下载

`acceptcat`，`fix/task-artifact-download` 接续PR47 / f29917d，产品源码 **663a0330c083faef0d09632a64a756cbee24543a**，[草稿PR48](https://github.com/luoyan96/personal-agent/pull/48)已附任务。任务材料改为当前应用会话读取，解决普通新窗口链接被Electron交给没有登录Cookie的外部浏览器。成功二进制单独处理，校验类型/10MiB/当前版本大小及SHA256后才请求系统下载；错误可重试，可停止，换账号/任务及晚响应不保存。撤回状态禁用，实际GET仍重新授权；只称已请求保存，不冒称系统落盘成功。

Windows x64 NSIS **0.10.6** 已制作并复制到桌面 `AcceptCat_0.10.6.exe`，**87,402,492字节**，SHA256 **ebb16e7e8f786f08cadffc715982d95033f946684ceedcb3f5a5acdbf4b2e600**，副本一致，安装说明一并在桌面。固定663a033完整构建，ASAR新材料下载/既有Skill预览、实际猫咪素材/图标和依赖核对通过，真实打包exe隔离启动/原生桥接通过。需退出旧版手动覆盖安装，未代装/重启、未发布Release或更改公开更新源。

新增7项加发送/代理原回归合18项、服务/认证5项、真实HTTP/SQLite协作原回归13项、客户端最终类型通过。真实任务React/HTTP/SQLite七组合成流程、1536/1024截图、原始字节/SHA、503重试/错误字节零保存、停止/账号晚响应、未接受无入口/撤回404通过，pageerror0；原Antd/Router等警告及主动错误保留。实际Electron22.3.27独立窗口保存/模拟原生取消后重试通过、外部窗口请求0；这不是用户现装账号或科研模型质量验收。[实现与QA证据](development/task-artifact-download.md)，Git外 `.runtime/task-download-20261016`。

只改桌面，未改共享/内置Skill/后台/数据库/依赖，不重复本地根全套。既有API兼容，无部署、迁移或公共目录发布；后台沿用47c42ac / contract0.25 / chat1.12 / schema022记录，独立公网ready200/0.25/ok，harness not_verified，未重新inspect镜像或读取用户资料。上批f063969的38767651485三平台已全部成功；本批663a033的38771771667最新快照两Linux成功、Windows运行中，未计全通过。隔离4746/4747服务及原生窗口已关闭，仅root活动；兄弟PR35/36未包含。后续继续真实师生课题试用、其他下载入口可靠性与资料授权下的受控工具适配，不能远程删除用户已保存副本。

## 最新交付：Windows 0.10.5 补齐 Skill 包内文字模板

`acceptcat-2`，`fix/skill-linked-reference-text` 基于PR46 / 47f6825，产品源码 **f063969258417c97e88cf3f5813ae0bc4c642ee2**，[草稿PR47](https://github.com/luoyan96/personal-agent/pull/47)。修复模板原件在包里却无法进入聊天参考的问题：从已提供的说明/参考链接收集所选目录内已有的文字模板，可在安装前逐项核对、聊天时按次选择。保持原包、目录/大小/编码约束和私人默认，不读取包外内容、不下载依赖、不执行脚本。展开模板的安装弹窗保持关闭与确认按钮可达。

Windows x64 NSIS **0.10.5** 已制作并复制到桌面 `AcceptCat_0.10.5.exe`，**87,402,569字节**，SHA256 **6256b59b26075c69b2e63d55f2c1283c8013abb5b68e5886b34c7cd2df9d9428**，副本一致。ASAR新增导入逻辑/预览文字/样式/依赖与真实打包exe隔离启动、原生桥接通过；未代装或重启用户旧窗口、未公开GitHub Release或修改更新源。**旧Skill不会自动补齐参考；须新版重新导入并确认保存新版本。** 原digest仍可读取，原件不被改写。

原生回归13项（新增3项）和既有API Skill13项通过；客户端/原生类型、最终构建、真实React/HTTP/SQLite/原生导入两组流程及1536/1024实拍通过。固定peer-review25原件、8脚本/9素材保持，参考6→14；完整原文/ZIP/存储往返、旧digest兼容和真实HTTP/ChatWorker选择JSON/CSV及跨账号隔离通过。模型为合成回执，不是科学审稿质量验收。已知Antd/Router兼容警告和首败/窗口越界失败保留。只改桌面，未改共享/内置Skill，不重复本地根全套；本批远端38767651485独立追踪。

**无需升级后台或数据库，本批没有部署/迁移/公共目录发布。** 后台沿用记录的47c42ac / contract0.25 / chat1.12 / schema022；现有API兼容参考路径已验证。本轮独立公网ready确认200/0.25/ok、数据库/存储/认证正常，harness仍not_verified，未重新inspect线上镜像。模型Key、资料库绑定和公共/团队/私人权限保持；脚本、绘图和MCP仍不可用。上一批产品4d0bc4b远端38666191233的Windows对话上下文/015迁移两项超时，仅重跑失败节点后三平台全部通过，未修改共享测试时限。

[实现、边界、检查与接续](development/skill-linked-reference-text.md)，证据Git外 `.runtime/skill-quality-20261016`；隔离4726/4727服务已关闭，无其他活动子代理/文件改动。不含兄弟PR35/36。接续实际科研质量评价与受控执行适配；依赖提示仍沿用既有启发式，可能把否定生图的上游说明也标为绘图依赖，本批未改判定或放开执行。

## 最新交付：两项科研来源上线与 Windows 0.10.4

`acceptcat-3` 接续同线程前后端/技能任务，`feature/community-evidence-review` 基于PR45 / 67a9749，产品源码 **4d0bc4bc8a04dece0dcc2c90d6a4a23628c91ffb**，[草稿PR46](https://github.com/luoyan96/personal-agent/pull/46)。增收研究设计与证据自查（固定Writer SHA / Skill1.3 / MIT，私人文字流程可安装）及Research Toolkit（固定09e9a8c / 1.1.0 / MIT，待接入无安装/调用）。动态卡片显示实际输入和交付物，详情补输入要求；小窗口不裁交付内容、单项分类保留正常列宽。没有复制上游技能正文/脚本进Git，`agents/skills`和权限边界保持。

Windows x64 NSIS **0.10.4** 已制作，桌面 `AcceptCat_0.10.4.exe`，**87,401,201字节**，SHA256 **6bea6f1c4f56c5f6ebf48c2422e8cd03381ad2899dfa6758780bc02134b77b8c**，副本一致；实际打包exe隔离启动/原生桥接和ASAR新文案/最终CSS/运行依赖核对通过。需退出旧版后手动覆盖安装，未代装/重启、未发布GitHub Release或修改更新源。源版本不等于用户现装版本。

根CI **53文件/669项**、生产两项/B0/隔离通过，后续仅桌面布局和文档不重跑根全套。客户端12项、类型/最终构建、真实React/HTTP/SQLite/原生导入三组流程、1536×1024和1024×726最终截图/内容边界通过，pageerror0。研究设计9原件/7参考/版本1.3真实导入和存储往返、合成HTTP/ChatWorker调用及跨账号源码/记录隔离通过；Toolkit90原件静态审阅与CLI7次公开虚构样例/完成及目录守卫通过。**没有真实模型科研质量、MCP/外部评审或用户账号现装验收。** 首次下载/编码/选择器/裁切/ASAR路径失败和机器重启中断保留。产品4d0bc4b远端38666191233三平台当时仍运行，独立追踪，不把本机通过当远端通过。

两项描述已用既有运营CLI在01:27:51Z加入实际生产目录。SQLite一致性备份/integrity_check通过，原四项不变；备份 `/srv/research-openim-backups/community-review-20261015T012748Z`。同步01:27:50.071Z—01:27:55.314Z成功，公共缓存version22，**六项/四仓库/十八候选**，所有metadata error=null；下一次2026-10-15T16:00Z。API healthy/worker running，公网ready200/0.25/ok。后台二进制仍 **47c42ac / research-openim-api:community-47c42ac / b78613b5c6e1f77d07e7af392149744161e25460cb7e4f14b2ec0500e3fda2cc**，**未重启、部署或迁移**，contract0.25/chat1.12/schema022。0.10.3已可读取新目录；新布局需装0.10.4。已安装私人Skill、资料授权和模型Key保持。

[来源、验证、发布和恢复](development/community-evidence-review.md)，证据Git外 `.runtime/community-curation-20261015`。不包含兄弟PR35/36。接续重点为Toolkit受控执行/授权材料、已安装Skill实际中文科研结果评估；脚本、绘图、统计与外部评审尚未自动接通，harness仍not_verified。

## 最新交付：Windows 0.10.3 与社区目录每日同步已上线

用户要求社区能力由软件/后台自动更新后，`feature/community-catalog-sync` 基于PR44完成后端持久目录、真实GitHub事实同步和待审阅发现。生产源码 **47c42acbccf64b1d329babb26a464733b81d51d3**（实现6c6b31f），[草稿PR45](https://github.com/luoyan96/personal-agent/pull/45)。客户端读取服务器目录，Star/Fork、代码更新时间、归档与上游提交独立展示；自动发现候选不提供安装/调用，运营者审阅后发布固定SHA的说明，私人技能和资料权限保持。

Windows x64 NSIS **0.10.3** 在桌面 `AcceptCat_0.10.3.exe`，87,399,966字节，SHA2565799fe92a664ae9c2a96882e63ad4ac89fd22ba7e856375dda59e0ba0c23ba2c，副本一致。最终根53文件/669项、生产2项/B0/隔离通过；客户端类型/12项、界面六组目录流程及三组安装/账号/布局流程、最终提示位置实拍、真实打包exe启动及ASAR核对通过。界面/模型验证范围分开，未使用真实用户科研数据或进行供应商科研质量验收。此前失败与警告保留。生产源码47c42ac的远端[38543331737](https://github.com/luoyan96/personal-agent/actions/runs/38543331737)最终三平台全部通过；首轮Windows旧解析/迁移超时失败，仅重跑失败节点后成功。后续文档HEAD检查与生产源码结果分开。

API/worker已成对上线47c42ac，镜像 **research-openim-api:community-47c42ac** / **sha256:b78613b5c6e1f77d07e7af392149744161e25460cb7e4f14b2ec0500e3fda2cc**，API healthy/worker running，公网ready0.25/ok。**contract0.25 / chat1.12 / schema022，无迁移**。停写备份与解压副本/新writer前原库91表/22迁移/6原件一致，六基础服务保持。服务器首次同步09:51:35.482Z—09:51:41.195Z成功：四项已收录、三个仓库、二十候选，所有来源metadata error=null，下一次2026-10-14T16:00Z（北京时间10月15日零点）。worker持续运行，桌面关闭不影响同步；无GitHub token。普通登录用户只有缓存GET，操作CLI不允许用户任意晋级。

[安装、实际上线及恢复](deployment/acceptcat-0.10.3.md)，[配置与运营者目录发布](development/community-catalog-sync.md)，证据Git外 `.runtime/community-sync-20261014`。首次因历史镜像摘要笔误在停写前停止，保留并核对实际旧ID后修正守卫；错误旧实例仅只读查询，没有安装软件。历史旧镜像ID若有不同记法，以本次实际核对的 **a8224977144450b2634f88317b305d4e0c63d8dfda6e0fe6766ab130296bff6c** 为准。

**需退出旧版手动覆盖安装；本批未公开GitHub Release或修改公开更新源，也未代用户安装。** 社区目录/元数据后续更新无需重新发桌面包，应用二进制与已安装Skill更新仍分别处理。未改静态网页、模型Key或材料权限，harness仍not_verified；候选科研质量、工具沙箱/向量/绘图/PaperQA执行仍需独立适配。兄弟PR35/36未包含，三项每日维护任务继续遵照新发布流程。

## 上一个桌面版本：Windows 0.10.2 科研发现信息流

用户反馈原广场没有可扫读信息后，`feature/research-discovery-feed` 基于0.10.1重做科研广场。生产源码 **31bd66c94ff34658ffc97d82133fe12da821ea93**：竖版用途/交付示例卡片、精简首屏、按任务检索、用途详情和真实添加/安装入口；六份内置私人文字配置及四项社区来源保持，未接通工具标记待接入。公开名片、资料和私人权限沿用原API。

Windows x64 NSIS **0.10.2** 已制作并复制到桌面 `AcceptCat_0.10.2.exe`，87,398,834字节，SHA25665bbe1888a305cc3054614789389640644398258221a9ec00f5c5992dbde5c72。真实React/HTTP/SQLite九组流程、12项客户端检查、最终类型、完整构建、原生启动与ASAR核对通过；1536×1024 / 1024×726 / 390×844动画结束实拍已对照概念查看。没有用户科研材料、供应商质量或现装账号验收。

[设计、验证、安装与限制](development/research-discovery-feed.md)，证据Git外 `.runtime/square-feed-20261014`。**需退出旧版手动覆盖安装；本批未发布GitHub Release、未代用户安装，也未改后台或迁移数据库。** 后台仍为下述8717dac3 / contract0.24 / schema022；公开更新源此前0.6.0未改变，harness仍not_verified。未接通脚本/绘图/向量/PaperQA；未包含兄弟PR35/36。保留失败测试和准确验证范围，后续继续积累真实师生科研交付案例。

## 上一交付：Windows 0.10.1 安装包与配套后台已更新

用户要求可安装试用版本并重新登录原维护会话后，固定源码 **8717dac3918b937b89c146f166ce5ee115d542ba** 已制作Windows x64 NSIS包，副本在桌面 `AcceptCat_0.10.1.exe`（87,391,016字节，SHA256698caa2f6f8d5cf49011df51112aff0038292d33760b5589684ab73a982fb831）。包含PR37—42的社区目录、Zotero只读元数据选入、Skill版本识别和资料导入恢复。版本提交只有0.10.1元数据，业务源码沿用PR42已通过的656项/三平台CI。实际客户端类型/构建/原生启动及ASAR当前依赖/素材核对通过。安装器身份/数据目录沿用，未代用户安装或重启。

科研API/worker已成对更新为8717dac3，镜像research-openim-api:release-8717dac3 / a8224977144450b26430bf488317b305d4e0c63d8dfda6e0fe6766ab130296bff6c，API healthy/worker running、公网ready0.24/ok。schema022无迁移，停写备份及解压验证91表/22迁移/6原件一致，新writer前原库一致；六基础服务保持。首次只读WAL挂载失败时旧pair已自动恢复，修正审计挂载后正式升级成功，失败保留。没有网页静态/模型Key/权限变更，harness仍not_verified，未做真实科研质量验收。

[完整交付、验证与恢复](deployment/acceptcat-0.10.1.md)，Git外 `.runtime/acceptcat-0.10.1-20261014`。**本地安装包尚未上传GitHub Release，旧版不会因为Git推送自动更新；请运行桌面包覆盖安装。** 公开更新源此前0.6.0本轮未改变。未包含兄弟PR35/36，未接通脚本/绘图/向量或PaperQA执行；后续合并/发布协调现有分支，优先真实师生任务试用。

## 前一本地候选：科研 Skill 连续输入保持所选流程

`acceptcat-2`分支 `fix/skill-continuous-routing` 基于 PR41 / e95db40，生产代码 **7d2a9c872e8855a37038737cb24969d4d94d6370** 已推送，[草稿 PR42](https://github.com/luoyan96/personal-agent/pull/42)。实际复现所选Skill连续补充误转创建Agent、助理分派或拆批；补齐三处排除条件，所选说明/参考/当前输入留在普通文字流程。持久混合Skill与助理路由在模型执行前取消为INPUT_CHANGED，不能直接重试，需新消息；不改写历史输入或撤销已发生的旧动作。

23项真实HTTP/SQLite/ChatWorker定向检查通过，新增7场景；含canonical SLR完整说明/引用与私人资料片段/来源回执，撤回零调用，旧混合请求零尝试/新有效消息恢复、其他账号不可读。最终完整CI52文件/656测试、生产两项/B0/生产隔离全部通过；早期fixture期望、旧集合版本和类型失败保留。没有真实供应商质量、工具执行或已安装桌面验收。[交接与复现](development/skill-continuous-routing.md)，证据Git外 `.runtime/skill-routing-20261014`，临时HTTP/SQLite测试资源随测试清理。

**没有安装包、Release、部署、迁移或用户客户端重启。** 沿用记录aee02447/Windows0.10.0/schema022/contract0.24，公开更新源此前0.6.0，本轮未重验线上。需后续成对升级API/worker；本批尚未到用户现装服务。界面、内置agents/skills、共享契约、权限策略和依赖不变；脚本/联网/绘图/artifact_save依然不可用。PR41生产db9ec3d的38502596075三平台已全成功；本PR生产38505283235的Ubuntu22.19/24已成功，Windows24仍运行，独立追踪。后续文档内容178/10通过。未含PR35/36，合并协调chat.ts和状态/评估文档；接续明确输入输出的工具适配与真实科研结果评估。

后续确认：PR42生产7d2a9c8 / GitHub38505283235的Ubuntu22.19/24和Windows24已全部成功；后续文档HEAD的自动检查独立记录，不等于部署。GitHub的PR说明/元数据请求分别遇到TLS超时/EOF，Git推送和生产检查已成功。

## 前一本地候选：科研资料导入与保存回执恢复

`acceptcat` 分支 `fix/research-file-import-recovery` 基于 PR40 / a2c1061，生产代码 **db9ec3d129920e67eead607cba3261de08c0acae** 已推送，[草稿 PR41](https://github.com/luoyan96/personal-agent/pull/41)。实际复现普通文件导入未知回执后编辑标题/版本重试创建两份来源；底层API原本按相同正文去重，问题是UI改变了原请求。现保留首次文件/元数据/版本/UUID，未知结果锁定编辑并只重试原提交；明确拒绝才恢复编辑，集合范围/任务授权变化阻断上传。真实保存回执和列表刷新分离，已保存后的HTTP读取503仅重试读列表；共用Hook新增可选refreshChecked，旧轮询/刷新语义保持。新版本与账号晚回执边界保留。

最终实际 React/HTTP/SQLite 七组流程通过，包含同请求仅一来源/仅v2、范围扩大零上传、空文件零请求、晚账号隔离以及真实HTTP列表503只刷新；1536×1024 / 1024×726截图查看，pageerror0。客户端最终类型/完整 Vite/Electron构建、完整根CI52文件/649测试、生产两项/B0/生产隔离通过。早期图标/确认弹窗选择器和pnpm工作目录失败保留；QA environment旧回调描述已在交接明确纠正，最终为真实HTTP读取故障。无用户账号、私人材料或已安装二进制/真实模型验收。[完整复现、命令、证据与限制](development/research-file-import-recovery.md)，Git外 `.runtime/research-file-import-20261014`，隔离4666/4667及浏览器已关闭。

**没有新安装包、Release、部署、迁移或客户端重启。** 沿用记录aee02447/Windows0.10.0/schema022、公开更新源此前0.6.0，本轮未重验线上；本批修复不在现装客户端。保留仅当前窗口的重试，跨关闭/重启恢复尚未做；集合创建/设置不属本批。PR40生产48b55aa的38498858027三平台已全成功，PR41独立跟踪；本批不含PR35/36，合并协调库/读取Hook/技能页面与状态文档。API/worker/共享契约/内置Skill/数据库/依赖不变，后台既有幂等权限已复验。

## 前一本地候选：科研证据审查与文献问答来源

`acceptcat-3` 分支 `feature/research-review-catalog` 基于 PR39 / 2000607，生产代码 **48b55aa34e42e70c69b14248d33a97d3f211f671** 已推送，[草稿 PR40](https://github.com/luoyan96/personal-agent/pull/40)。社区目录共四项，新增 K-Dense peer-review 固定 Writer 子目录（MIT / Skill2.2，文字流程可确认私人安装、脚本待执行接入）及 PaperQA2 固定源码（Apache2，待适配，无安装/调用入口）。中文详情包括输入/交付、知识库/素材、依赖/费用、许可/SHA、验证与具体限制；没有复制上游正文/脚本进 Git，agents/skills 单一来源及账号/公共/团队/私人边界保持。

客户端6项、类型与完整 Vite/Electron 构建通过；Peer-review 25 原件与独立下载/实际 importer/store 往返核对，14 个合成离线案例通过；实际 React/HTTP/SQLite/原生 handler 的7组流程和两个桌面尺寸通过，pageerror0。中文语气检查漏检反例和首次引用/GBK夹具失败保留；PaperQA 只静态审阅，固定索引源码仍含 pickle。初始详情截图处于动画初态，等待结束后重拍查看，最终内容/控制可达。没有已安装桌面或真实模型质量验收。[完整来源、验证、证据和接续](development/research-review-catalog.md)，证据 Git 外 `.runtime/research-catalog-20261014`。

没有部署/迁移/安装包/Release，沿用记录的 aee02447 / Windows0.10.0 / schema022，公开更新源此前0.6.0，本轮未重验线上；本批目录尚未进入用户现装客户端。共享代码/内置Skill未改，不重复本地根CI。PR39远端38319126589首轮Windows5项既有超时，失败节点重跑后三平台均成功，未改时限；PR40检查另跟踪。PR35/36未包含，后续合并协调目录/SkillLibrary/状态文档；下一步为明确输入输出的脚本适配、中文评估及带来源/安全索引/权限/预算的文献问答。

2026-10-14后续确认PR40生产48b55aa、GitHub38498858027的Ubuntu22.19/24和Windows24全部成功；这是受测生产HEAD，后续文档HEAD与安装/上线仍分别记录。

## 前一本地候选：科研Skill版本元数据修复

`acceptcat-2`分支 `fix/skill-release-metadata` 基于PR38 / 90dac3c，生产代码 **4cb23e515794983d1f0832a944648b37c3389b62** 已推送，[草稿PR39](https://github.com/luoyan96/personal-agent/pull/39)。共享安装解析器识别metadata.version，保留数字标签原写法如2.10，根版本优先、正文fallback兼容；异常/过长标签报错而不截断。安装预览、新导入/更新沿用此解析结果，原已安装DB修订、摘要、权限和本机原件保持，需用户明确更新才采用新标签。

完整本地CI52文件/649项、生产CLI/HTTP两项、B0及生产隔离通过，20项定向解析/API流程和9项桌面导入回归通过。固定公开Writer ZIP新解析标签2.1，32原件/完整ZIP与旧审阅哈希一致，旧存储仍可读、新摘要下往返通过，其他正规化字段不变。首次新测试误期望revise201而实际契约200，修正测试后通过，失败保留。只验证合成模型/公开缓存，没有真实供应商质量或用户安装验收。[交接与命令](development/skill-release-metadata.md)，证据Git外 `.runtime/skill-release-20261013`。

无安装包、Release、部署、迁移或用户客户端重启，沿用2026-10-10aee02447/Windows0.10.0/schema022记录，公开版本此前核对0.6.0，本轮未重验线上。内置agents/skills不变；自报标签不证明质量或授予权限。PR35/36未包含，后续合并协调共享解析器/文档；PR39远端CI另跟踪，当前本地全门槛已通过。

## 前一本地候选：Zotero本机文献元数据选入

`acceptcat` / `acceptcat-3`承接上轮待适配条目，独立分支 `feature/zotero-local-library` 基于PR37 / 0da9b08，生产源码 **5e85efe2e978c755c5d71edad44dc535f9ac4cfb** 已推送，[草稿PR38](https://github.com/luoyan96/personal-agent/pull/38)。广场详情进入资料库，本人私人集合可以连接本机Zotero个人库、分页检索、选择和预览后确认导入元数据与摘要为TXT来源。固定loopback GET、短期许可、无重定向、明确错误/空结果、世代取消和原请求幂等重试；复用真实资料服务，无API/worker/共享契约/schema/内置Skill修改。

13项客户端检查、客户端类型/原生非composite类型/完整构建/四SDK资源与7组实际React/API/SQLite/原生handler合成流程通过。包括真实提交后合成503仍只保存一个来源、集合变公开拒绝、取消零上传、切账号丢弃晚结果及第二账号隔离。1536×1024和1024×726截图已查看，pageerror0。原生许可/窗口/IPC与Zotero响应为夹具，未使用真实个人文献库、正式安装二进制或供应商模型。首次定位、类型和格式化失败及既有警告保留。[完整实现/限制/证据](development/zotero-local-library.md)。上轮PR37三平台GitHub38159262310均成功；本轮检查单独跟踪。

**没有新安装包、Release、部署、迁移或用户客户端重启。** 沿用2026-10-10的aee02447 / Windows0.10.0 / schema022部署记录，公开更新源仍0.6.0，本轮未重验线上。只读元数据与摘要，不读取PDF/批注/全文、不修改Zotero、不安装上游MCP、不自动调用模型。旧版缺Server-ID不保证跨库身份；不确定导入需在原窗口重试，未做跨重启恢复。PR35/36未包含，后续合并要协调公共页面及状态文档。证据Git外 `.runtime/zotero-local-20261013`，隔离4646/4647服务和浏览器已关闭。

PR38共享远端38299994061首轮Windows632/634通过、两个既有5秒时限超时；请求重跑该失败节点，GitHub矩阵最终Ubuntu22.19 / Ubuntu24 / Windows24均成功，受测HEAD0135f0b、生产源码仍5e85efe。本机execution A12定向通过，discovery整文件9项通过；最初只过滤分页测试因缺前序夹具失败，证据保留，未改共享测试/时限或生产源码。不为CI诊断重打包或部署，后续文档检查不改变受测生产代码。

## 前一本地候选：社区科研工具与固定子目录私人安装（2026-10-12）

`acceptcat-3`已在独立分支 `feature/community-research-catalog` 完成两项社区来源收录，生产源码 **6e14cabdc3ac88037da90cdc02c83ea6eed911bf** 已推送，[草稿PR37](https://github.com/luoyan96/personal-agent/pull/37) 基于 `feature/research-capability-center` / ffb406e。广场展示科研稿件与引用检查（MIT，离线样例已验证、文字说明可私人安装、自动脚本执行待接入）和Zotero文献库连接器（服务MIT/插件AGPL，待连接，不开放安装/调用）。中文详情包括输入、交付、知识来源/素材要求、费用、依赖、固定提交和验证限制。安装器新增完整40位SHA/子目录，保持祖先许可与原ZIP，不执行包内脚本；完整归档限制和实际符号链接属性检查均有回归。

最终新6项和原编译导入3项、客户端类型/完整构建/四SDK核验通过。官方Writer固定ZIP选中32原件，与raw独立下载逐字节匹配并完成本机往返；8项离线合成检查确认重复/无效DOI、占位符和中文题名去重缺口。7组真实React/本地HTTP/SQLite界面流程通过，第二合成账号不能发现/读源，窗口1536×1024和1024×726可操作，详情限高滚动。IPC传输/窗口和固定下载缓存为夹具，实际handler/importer/store执行；没有运行新安装桌面二进制、真实文献库或供应商模型。页面异常0；弃用提示/预期404、早期失败证据保留。

仅客户端与文档，无共享代码/内置Skill更改，未重跑根共享CI；未打安装包、发布Release、部署静态站/API/worker或迁移。**线上仍aee02447 / Windows0.10.0 / schema022，公开更新源仍0.6.0**。PR35技能授权修复（595a2c1）和PR36附件恢复（6e8137e）为已知兄弟分支，本分支不包含其实现；合并时协调SkillLibrary等文件。下一步为技能库执行依赖评估与Zotero明确范围的只读适配，未经验证不能升级可用标签。[完整来源、验证及交接](development/community-research-catalog.md)。Git外证据 `.runtime/community-research-catalog-20261012`，本轮隔离服务4636/4637及浏览器已关闭。

## 当前已发布基线：科研能力中心第一阶段 / Windows 0.10.0

本批在 `feature/research-capability-center` 完成科研能力分类、六份可编辑私人文字 Agent 配置、范围明确的资料集合 / 来源版本 / 原件下载、Agent 资料绑定、聊天来源片段回执，以及完整本机 Skill 素材管理。入口为广场的科研能力中心、工作台的资料与素材库、本人私人 Agent 的资料设置和私人 Skill 素材管理。发现列表与课题组列表只展示真实公开 / 获准能力；模板不伪装成已验证绘图或代码执行能力。详见[实现说明](development/research-capability-center.md)。

受测、打包和部署生产源码 **aee02447f985070a0c4b01c392192e7ae4960953**，已推送，[草稿PR34](https://github.com/luoyan96/personal-agent/pull/34) 基于 feature/research-team-workbench。Windows包 **D:/deepseek-agent/AcceptCat-Windows/0.10.0/AcceptCat_0.10.0.exe**，**87376116字节**，SHA256 **4afa9f8d6792917accdee244669db6b5c1b69877ab117e92c71fabef3bdd05fc**。同目录有安装说明、blockmap / latest.yml、摘要及合成组件截图；没有替用户安装或重启。未公开 GitHub Release，公开更新源最后仍为0.6.0，旧版不会发现本地0.10.0，需手工安装。

最终本地完整 CI 通过51文件 / **634项**、生产 CLI / HTTP两项、B0进程与生产夹具隔离；前端类型 / 6 focused、11组实际React组件 + API / SQLite合成UI流程通过，最小1024窗口可达。真实0.10.0独立启动和7组原生preload / IPC / 管理库 / PNG与ZIP原件检查通过；文件选择与保存对话框仅路径选择使用合成替身。上游指定Skill固定SHA的4,160原件往返通过；脚本未运行。没有真实供应商质量调用或认证后线上科研业务验收，工程测试不代替师生持续使用。

首次 GitHub [38043062776](https://github.com/luoyan96/personal-agent/actions/runs/38043062776) Windows24通过，Ubuntu24 / 22.19各6项失败；根因是新合成密钥夹具默认0644，被原有Linux密钥权限检查正确拒绝。仅测试文件补0600，定向6项通过。修正后的[38043725537](https://github.com/luoyan96/personal-agent/actions/runs/38043725537) Ubuntu22.19与24均成功；Windows原始生产源码检查已成功，最新检查结果见PR。生产源码 / 迁移 / 安装包不变。此前CI迁移夹具、旧预算和Skill调用身份、production SQLite清理失败及原生status桥误用均保留失败证据；最终修正没有扩大配置页权限或提高旧预算。

2026-10-10 **18:02北京时间**完成线上核验：API / worker同为 `research-openim-api:library-aee02447`，镜像 **sha256:1390545b7d576d4984b1263243010e07123d148c1358895e3e92772d3691f3cc**，revision与上述生产源码一致；API healthy、worker running。公网ready为ok / contract0.24 / database、storage、authentication=ok，harness=not_verified。资料集合、检索和工作台匿名探针均401。schema022新增五表、两个索引与四个不可变触发器，旧86表定义 / 行与6份原件保持；旧六项OpenIM / 基础服务实例、镜像和运行状态一致。仅部署API / worker，网页静态界面未更新。

完整科研库与原件备份 **/srv/research-openim-backups/library-aee02447-20261010T100009Z/research.tar.gz**，SHA256 **967db69de1cda008f2f0e464088416f3815c2a4187ef92bc71d4d9fc2fcee9a6**。解压副本核对schema21后，先在副本执行真实生产迁移并核对旧行 / 原件，再迁移正式库；新增五表在重启前为空。不是完整OpenIM一致备份。新服务已运行，不能直接启动不认识022的旧二进制或覆盖已产生写入的数据库。[部署与恢复边界](deployment/acceptcat-research-library.md)。Git外证据 `.runtime/capability-center-20261010`、`.runtime/skill-bundle-20261010`。

当前范围为关键词资料检索和文字助手；视觉 / 向量检索、绘图 / 脚本执行沙箱、专业知识包质量评估尚未实现。私人来源不随Agent公开，来源回执只表示提供给模型的片段，不能视为全文已读或所有结论已核验。


## 当前开发定位：老师与实验室团队的科研提效、标准化和管理对齐

2026-10-10 用户明确 AcceptCat 近期面向学校老师和实验室团队；先完善自己的软件和本人 / 学生的真实工作，再考虑面向广泛消费者的个人 Agent 愿景。按“项目目标 → 计划 → 分工 → 阶段交付 → 导师审阅 / 反馈 → 下一步 / 归档”组织产品，个人助理作为成员入口，负责人总览以获准项目的真实进展为依据。

优先修复基础聊天、材料处理、上下文和错误恢复，再完成团队任务流程，逐步沉淀可调整的科研模板和总览。微信 / 企微连接器、消费级增长、泛行业能力市场及手机端扩展暂缓；企微现场试验的已批准测试回复未发送，回发验证不再是当前下一步。产品范围与完成依据见[产品规划v0.9](product-plan.md)和[路线](roadmap.md)。用户已批准前后端并行使用 6.1 high 实施，当前批次进度见下方本地候选记录。

## 历史交付：AcceptCat 0.9.0 科研团队工作台

分支 `feature/research-team-workbench`，基于原 `feature/memory-experience`。桌面默认科研总览，汇总当前账号获准事项、待审成果、真实受阻情况和已确认截止；可切换我的事项，搜索和筛选当前分页。任务卡显示实际提交版本和导师意见，成员侧栏显示本页承接事项及下一步。邀请待学生本人接受；开始、受阻 / 恢复、交付、要求修改及验收沿用真实状态与确认入口。旧服务通过 contract0.23 门槛明确不可用，不伪装空数据。

新增 `researchWorkspace` 与 `planTasks` 两个只读接口，SQL 授权先于汇总和分页，计划步骤通过持久 `itemId` 关联实际任务，不按标题猜测。私人计划目标仅原所有者可读；摘要权限不返回交付 / 分工等详情。验收数量要求最新交付的真实审阅通过记录，任务标签本身不等于成果通过。schema021 保持，无新迁移。

新私人 AI 规划使用发起人自己的默认模型并绑定配置指纹，普通成员不继承管理员 Key；没有个人设置的课题组管理员保留旧实验室配置兼容。派发、心跳及回写核对配置，变更则停止并丢弃晚稿、保留实际用量；历史无绑定请求保持原路径，公共任务 Agent 执行仍走课题组配置。查询事实无需调用模型。

修复新消息自动继承旧附件：仅当前明确文件 / 页码引用、文件名匹配、明确文件选择或紧接附件的续问复用材料。无文件选择的新问题不带旧附件派生回执和正文，模型按当前请求 / 补充的消息 ID 定位输入；历史仍在会话中。未实现全历史语义理解，也不承诺真实模型永不误称呼。桌面代理与地址校验对齐，仅本机 loopback 可使用开发 HTTP，外部地址仍要求 HTTPS。

完整共享 CI 已通过49文件 / 603项、生产CLI / HTTP两项、B0进程与生产夹具隔离；客户端类型和18项团队 / 计划 / 代理 / 文件检查通过。实际HTTP / SQLite、生产React组件与隔离Electron22完成9组师生交付流程，个人模型由注入的合成供应商验证，不使用真实账号或Key。最终桌面主题、Segoe UI / 微软雅黑字体、任务交付窗口和1024×726无水平溢出截图已查看；renderer pageerror0，既有React / Ant Design警告和故意503保留。原生宿主为0.8.6，不将组件验收称为0.9.0安装包或线上OpenIM验收。

固定受测、打包及部署源码 **f9729a223e0b9ccd0089949e83c10f35c6e4e53d**，已推送 GitHub，[草稿PR33](https://github.com/luoyan96/personal-agent/pull/33) 基于 feature/memory-experience。GitHub [38034613297](https://github.com/luoyan96/personal-agent/actions/runs/38034613297) 的 Ubuntu22.19 / Ubuntu24 / Windows24 全部成功。真实 NSIS publish never、更新资产及包内版本 / 科研模块 / contract / loopback 代理 / 原有猫咪和记忆 OCR 资产通过；实际0.9.0打包 Electron22 用隔离 profile 启动通过，保留既有 electron-log 重复初始化提示。没有替用户安装或重启。

安装包 **D:/deepseek-agent/AcceptCat-Windows/0.9.0/AcceptCat_0.9.0.exe**，**87350666字节**，SHA256 **72fbea04952f506d2aba3bc870ece7a11665f68f1e6228d56a16deee5e143419**。同目录提供 blockmap / latest.yml、摘要、安装说明及合成师生流程截图。未公开 GitHub Release；公开更新源最后仍为0.6.0，旧版不会自动发现本地0.9.0，需手工运行该安装包。

2026-10-10 **15:48北京时间**完成部署后核验：API 与 worker 同为 `research-openim-api:team-f9729a22`，镜像 **sha256:c3e47a756279050379eb775884b2a7120b52ecb7b86f35c9c97b2465da5f1254**，revision 标签为固定源码。公网 ready 为 ok / contract0.23，数据库、存储、认证为 ok；Harness 为 not_verified，不计真实模型质量验收。两条新增路由匿名访问均401，未伪装404。API healthy、worker running，原六项 OpenIM / 基础服务仍使用原镜像并运行；本轮不部署网页静态界面。

备份 **/srv/research-openim-backups/team-f9729a22-20261010T074607Z/research.tar.gz**，SHA256 **55f405c898d6ee6469ce7b428f7011e41308169018af6647b6f0cfa9783bcae0**。停止科研服务后保存 schema21 / 86张表摘要，备份解压副本与原库的完整性、外键、表定义和所有旧行摘要一致，再启动新版；无数据库迁移。这是科研数据库与资产备份，不能当作整套 OpenIM 的一致恢复备份。[部署与回退边界](deployment/acceptcat-research-team.md)。

首次共享CI6项失败、两次定向上下文回归失败均保留；精简系统规则并只给当前私人消息保留定位ID，修复旧低预算准入，未提高用户旧预算。首轮 Docker FROM 使用 image ID 被当成远程地址而超时，科研服务尚未停止；改用已核对摘要的本地 tag 后构建成功。一次多行维护终端传输被取消，改为单行 gzip/base64 传输并校验脚本 SHA256 / bash 语法。最终CI日志 `ci-final.log`，9组流程 `qa.json`，主题核验 `render-final.json`，包核验 `package-proof.json`，公网核验 `public-ready.json` / `public-route-proof.json`，部署日志保留在服务器 ops。Git外证据 `.runtime/research-team-20261010`，详见[实现与验收](development/research-team-workbench.md)。

该历史批次云端 API / worker 为 f9729a2 / contract0.23 / chat1.11 / schema021，现已由上方0.10.0后台替代。课题组成员仍需负责人邀请码注册相同课题组，通讯录好友不会自动成为课题组成员。个人空间可独立规划。邀请管理复用现有网页入口；原生团队创建 / 多课题组切换、教师真实材料试用、完整科研自动化和学校部署仍需后续推进。线上该批仅验证部署健康 / 新路由鉴权，没有冒称线上真实 OpenIM 师生协作或供应商调用通过。

## 最近现场试验：企微好友消息进入 AcceptCat

2026-10-10，按用户要求操作已登录的 Windows 企业微信和 AcceptCat。企微聊天未暴露辅助功能消息正文；复用现有 Windows OCR 识别真实消息，全窗和放大裁切都误识关键日期，不计准确读取通过。随后通过消息菜单“复制”取得原文，粘贴进入 AcceptCat。真实已配置的 Agent 聊天链路返回任务表和回复草稿；没有新增凭据或使用合成模型。

旧个人助理会话的两次请求混入历史论文和验收标记，另有把收件人称呼误当成发送人的问题，保留失败证据。使用现有 UI 创建私人“企微收件助理”，独立空会话的一次请求返回两行任务草稿、日期待确认信息及简短回复，未出现旧论文回执。这个结果只验证独立会话配置，尚未修改或修复原有上下文代码，也没有实现按企微联系人自动隔离。

用户已确认首次发送的收件人和具体文本。填入回复时窗口连接中断，未触发发送；重新定位后企微显示“当前设备环境异常”，要求手机企微扫码安全验证。已暂停 UI 操作并交给用户完成验证，发送授权保留，尚无回发或送达验证；这条实际限制需纳入客户端收发方案。没有创建正式任务、安排提醒、安装持续收发服务、发布安装包或部署后端；也未验证无人值守、未读发现、多联系人、消息去重与主动跟进。当前 Git 产品源码沿用本地候选，运行中的已安装客户端版本与云端部署版本未重新核验。私人原文、识别失败和实际 Agent 输出均只保存在 Git 外 `D:/deepseek-agent/.runtime/wecom-pilot-20261010`。本批仅现场试验与交接记录，没有代码变更或重新运行 CI。

## 最新本地候选：AcceptCat 0.8.6，桌面记忆体验

固定桌面源码 **b57afde616de43eb977f2b147448ac9d6653cef8**（feature/memory-experience，基于2bbd740 / fix/ocr-readable-text）。将记忆管理表单改为先阅读已确认记忆：淡蓝摘要、实际更新时间、通用偏好/主题记忆数量、状态列表与搜索。新增、修改与设置独立打开；候选修改明确“保存并确认”。主页面缩短范围说明，细节从次要入口查看；小窗口只滚动内容，导航和关闭按钮不被滚动条占据。[使用与实现](development/memory-experience.md)。

复用现有个人记忆/设置/提醒API及expectedVersion，只有已确认内容进入摘要。真实空状态与读取重试，错误保留编辑内容；作用域变化关闭本页拥有的说明/确认窗口。未增加自动人物画像、健康数据、自主性格学习或单Agent私有记忆新逻辑；无后端、契约、schema或迁移修改。

最终客户端类型检查、12项隔离桌面检查（含页面身份）通过：空状态、真实API摘要/数量、筛选/搜索、503保存保留与重试、新增持久重开、移除历史、候选确认、时区/安静时段设置、联系人切换清理、读取失败恢复、提醒页导航和1024×726操作可达。使用生产React组件/Vite、隔离Electron22原生宿主、真实本地HTTPS API/SQLite与合成账号；候选仅通过测试端点写入隔离数据库。未使用真实用户会话或调用供应商模型，未重新验收线上个人记忆或聊天模型行为，未重复核心CI。

概念与1496×1051/1024×726实际截图已查看；按布局、字体、颜色、留白、图标、真实内容六点对照。页面无框架错误覆盖，renderer pageerror0；保留React Router/Ant Design既有弃用提示、故意注入的503，以及进入测试页前隔离登录服务502。没有将控制台称为零警告。早期夹具的按钮可访问名、异步列表刷新断言、候选请求路由/选择器和隐藏窗口截屏中断/残影保留；最终使用软件渲染并等待动作结束，仅内容滚动修复后清晰截图与交互通过。

实际NSIS **publish never**，最终包/更新资产/ASAR记忆标签样式、旧OCR桥、猫咪素材/橘猫图标/安装身份及打包启动核验通过。安装包 **D:/deepseek-agent/AcceptCat-Windows/0.8.6/AcceptCat_0.8.6.exe**，**87339259字节**，SHA256 **819c5f2ce59f641d9a2e39884441ff8832d70b80167b0de26633a79bbf6bcf85**。交付副本摘要一致，同目录含blockmap/latest.yml、散列、说明和标注合成内容的实际截图。尚未覆盖安装或测试自动更新重启，未安装/重启用户客户端或公开Release，旧版自动更新不会发现此本地包。

Git外证据 `.runtime/memory-experience-20261009`；私人研究资料没有进入本批测试或Git。自有测试服务/窗口交付前关闭，用户当前程序保持运行。未部署阿里云，服务版本沿用最后部署记录11cd20a / contract0.22 / chat1.11 / schema021，本批未重新核验线上。

## 上一本地候选：AcceptCat 0.8.5，图片正文整理与 Agent 校对

固定桌面构建源码 **9f9cdbb5f6e708acefb954344b830ef21b6efc62**（fix/ocr-readable-text，基于2765016 / feature/acceptcat-cat-entry）。用户反馈长图识字乱行和残字；现在按切片行中心分配重叠区，去除裁切残行，再按行距重建段落。默认“一整段 · 无回车”，可切换保留段落或原始识别，各格式编辑独立保留。复制、原生另存为和插入均使用当前正文，不加入文件名标题。[使用与实现](development/ocr-readable-text.md)。

本站 Agent 单聊可通过当前模型校对，点击前提示文字会发送给该 Agent，可关闭而仅本机整理。复用既有文件、任务与消息接口；明确成功且完整的最终消息才替换正文。错误保留本机稿、重试复用未知请求或已接受回执，窗口内可停止整理；超过6000字符不送模型、不截断本机正文。原生另存为实际写入成功才提示，换图、改格式或改正文清除旧保存提示。没有服务端、契约或数据库修改，猫咪入口与橘猫图标保留。

最终类型检查、7项图片检查、实际NSIS publish never、更新资产/摘要、包内版本/原生OCR/保存桥/素材/身份以及打包启动门禁通过。实际隔离Electron22/preload/IPC/WinRT OCR和生产React组件完成8项桌面流程，renderer pageerror0；用户提供的1200×10929原图仅本机识别，确认无硬回车、完整长图覆盖与重叠残行消除。复制在测试renderer记录值，原生另存为仅在隔离主进程模拟路径选择、真实fs写入并核对内容；真实本地HTTPS/API/SQLite/ChatWorker配合合成模型验证校对成功、503保留与幂等重试。1024×726操作可达，实际截图已查看。未验证真实供应商校对准确率、覆盖安装或自动更新重启，未重复核心CI。

安装包 **D:/deepseek-agent/AcceptCat-Windows/0.8.5/AcceptCat_0.8.5.exe**，**87327274字节**，SHA256 **075e8b8055711ee9a161677a2bb5ed8c7314d13630f6cf0a076aa6f8bc43ec39**。交付副本摘要一致，同目录有blockmap/latest.yml、散列、安装说明和标注合成材料的界面截图。未公开Release、部署阿里云或安装/重启用户客户端，自动更新不会发现此本地包；服务版本沿用下方最后部署记录，本批未重新核验线上。

Git外证据 `.runtime/ocr-readable-20261009`；原始图片、OCR文字和测试回执未进入Git，个人材料未发送到模型夹具或外部供应商。早期导出中断、QA窗口占用打包程序、恢复配置路径和关闭动画残留DOM导致即时count断言失败均保留，不计通过；最终选择可见性判据后同一固定源码8项通过。自有QA窗口及测试服务交付前关闭，用户运行中的程序不动。

## 上一本地候选：AcceptCat 0.8.4，猫咪科研登录、注册与启动页

固定桌面源码 **f8e2645c5c7ac8e559e98d4e9400a6b96b8901d3**（feature/acceptcat-cat-entry，基于0f9dcd2 / 0.8.3）。按用户指定查看 `E:/acceptcat/frontend/public` 和旧项目科研工作区，将原科研书桌/猫咪书房图原样用于登录、注册、服务连接、启动页。白底、科研场景、鼠尾草绿表单与Windows字体统一；保留蜷睡橘猫应用图标、八位密码及普通无邀请码注册。[入口交接](development/acceptcat-cat-entry.md)。

客户端类型、3项认证输入检查、实际NSIS publish never构建、exe/blockmap/latest.yml核对、app.asar版本/素材原图散列/图标/身份检查和打包启动门禁通过。实际Electron22/生产打包React入口用隔离合成认证响应完成10项流程：登录、密码显示、Enter发送/挂起/错误恢复、格式校验、无邀请码注册成功、重复用户名、1024×726滚动可达、390×844紧凑布局、服务地址原生校验、440×330启动图。概念与最终桌面截图已查看，renderer pageerror0；预期401/409测试响应与已有electron-log重复初始化告警单独记录。未重复聊天/OCR/共享核心CI，不声称真实账号登录或覆盖安装已测。

安装包 **D:/deepseek-agent/AcceptCat-Windows/0.8.4/AcceptCat_0.8.4.exe**，**87323352字节**，SHA256 **bbb13ee8673e3cce007afa0e4bb25b2afa734da3c71c287e8cbfdacd5d248ff4**。同目录有更新资产、散列、说明及实际新版截图。源码与素材可经Git协作；本地候选尚未公开Release，自动更新不会发现此包。未安装或重启用户窗口，未部署阿里云。服务/contract/schema沿用最后部署记录11cd20a / 0.22 / chat1.11 / 021，本批未重新核验线上。

Git外证据 `.runtime/cat-entry-20261009`；首次图片截图取帧过早、隐藏窗口rAF等待、测试启动期间重载导航竞争、在登录页调用仅限连接页的IPC和Windows ASAR路径分隔符诊断均不计最终验收。修正测试方法后以固定最终源码完成上述检查；自有隔离窗口已关闭，用户原客户端与旧项目未修改。

## 上一本地候选：AcceptCat 0.8.3，沿用Catnap桌面橘猫图标

固定桌面源码 **064c9f276c0bc74a07750724c0f6600f525aaa4c**（chore/acceptcat-cat-icon，基于9f5f78c / 0.8.2）。按用户截图，从原Catnap Desktop快捷方式指向的旧EXE提取蜷睡橘猫；原ICO七档16–256px完整保留，透明PNG用于标题栏和关于页。Windows安装包/程序/托盘、原生窗口和标题栏图标统一；没有合并或启动旧Catnap。0.8.2图片识字回复仍包含在本版。[来源和范围](development/acceptcat-cat-icon.md)。

客户端类型、真实NSIS publish never构建、exe/blockmap/latest.yml校验、实际app.asar图标/PNG/版本/数据身份核对通过。安装包和程序资源重建的ICO SHA256与旧Catnap完全一致；Windows实际DrawIconEx绘制256px图标，与旧程序绘制结果逐字节一致且已查看。隔离打包Electron启动通过；electron-log重复初始化提示保留在日志，不将其描述为零告警。没有重复0.8.2功能验收或共享核心CI，未实测覆盖安装/快捷方式缓存刷新。

安装包 **D:/deepseek-agent/AcceptCat-Windows/0.8.3/AcceptCat_0.8.3.exe**，**86862188字节**，SHA256 **68b4aa443f7d51233e9b6ce625c1fa457fa5df77cadc86c4915a802f405e6af4**。同目录有更新资产和安装说明。未公开Release、云端部署或安装/重启用户窗口；公开更新源不会自动获取此本地候选。appId、package.name、用户数据身份和服务沿用；API/worker/contract/schema仍沿用最后部署记录11cd20a / 0.22 / chat1.11 / 021，本批未重新核验线上。

Git外证据 `.runtime/cat-icon-20261009`。初版提取断言因打包程序图标目录记录长度与实际资源长度差异失败；改用实际资源长度后完整ICO校验一致，并由Windows真实绘制确认。`.NET Icon.ToBitmap`透明结果失真不计验收，保留诊断图。实际DrawIconEx图和安装资源检查通过。提取与检查仅操作图标文件/隔离测试窗口，旧Catnap及用户运行中的AcceptCat未修改。

## 上一本地候选：AcceptCat 0.8.2，发图后的Agent回复

固定桌面源码 **3f0c666c12baec996bfe1b6201dd690d0ae5574c**（fix/agent-image-replies，基于3c1880a / feature/desktop-image-paste-ocr）。旧发送链路只发IM图片；现改为SDK成功送达后，对完整原图本机OCR，将完整文字送入既有文件阅读接口并请求回复。图片下方“识别并回复 / 从本机选择识别”恢复已发消息，幂等键和文字附件名由原SDK编号固定，不重复发送图片；失败明确提示/重试，成功清除临时状态。真人、群聊、外部Agent不自动转发；切换联系人取消未完成识字。长图预览最高280px。[使用和边界](development/agent-image-replies.md)。

客户端类型、4项图片与10项消息恢复/代理检查通过；实际0.8.2 Electron22/preload/Windows OCR + 生产React组件 + 真实本地HTTPS/API/SQLite/ChatWorker通过11条流程，含长图底部、规范模型回复显示/完成提示清除、重试去重、503恢复、空图/SDK失败、真人不转发、识字中切换和最小窗口。模型与IM传输均合成；隐藏窗口模拟前台可见性验证轮询。没有用户账号/Key/研究资料/系统剪贴板、生产IM或供应商调用。图片文字识别不等同于图表/物体视觉理解；真实用户原图、不同语言包和覆盖安装未实测。

NSIS **publish never**，最终安装包和更新资产校验通过，app.asar版本/自动识字/恢复/原生OCR模块检查通过；实际打包登录启动pageerror0。安装包 **D:/deepseek-agent/AcceptCat-Windows/0.8.2/AcceptCat_0.8.2.exe**，**86415069字节**，SHA256 **e78438ef4b1d54fdfe7e7d99c5a4ff055a8aaffae5766003a1061b08cf29aa9a**，同目录有安装说明与更新资产。未公开Release、部署云端或安装/重启用户窗口；旧软件的更新源不会自动获取本地候选。后台/contract/schema沿用下方最后部署记录11cd20a / 0.22 / chat1.11 / 021，本批未重新核验云端。

证据Git外 `.runtime/agent-image-replies-20261009`，构建日志 `.runtime/agent-image-replies-build.log`。夹具布局/等待判据和隐藏窗口截图失败未计通过，修正测试方法后最终11项通过。后续文档提交不改变安装包源码；自有测试API/worker/TLS/Vite/Electron交付前关闭。

## 上一本地候选：AcceptCat 0.8.1，图片粘贴与本机识字

固定桌面源码 **6c6f9a48f419857f7482661556f74236313d0fa7**（feature/desktop-image-paste-ocr，基于2027291 / feature/openmuse-desktop-ui）。输入区支持Ctrl+V图片、工具栏粘贴、图片多选和拖入，共用可移除的本机预览；Windows10/11本机逐图OCR、长图完整分段与重叠去重，结果可编辑/复制/TXT保存/插入草稿。图片无原始文件路径时按字节写入SDK缓存，普通文字粘贴和原发送队列保留。[使用方法及微信格式边界](development/desktop-image-paste-ocr.md)。

renderer / Electron类型、4项图片检查和6项原发送恢复检查通过。新打包0.8.1的原生preload / IPC / WinRT OCR与生产React组件，在隔离本地HTTPS/API中九条流程通过：多图、真实中英文数字、5500px长图底部和边界去重、编辑插入、原队列发送、无路径图片SDK消息、损坏图错误保留、1024×726可操作和切换联系人清理。SDK回执是合成夹具，不是生产IM或模型调用。真实OCR包含中文误识，数字/专有名词需校对；实际用户微信私有多选格式、语言包缺失和覆盖安装未实测。未读取或修改用户系统剪贴板，Windows文件列表测试使用独立原生内存句柄。

真实NSIS构建 **publish never**，安装包 / blockmap / latest.yml校验通过；0.8.1实际打包登录启动、原生SDK、版本/数据身份和新识字模块检查通过，pageerror0，截图已查看。安装包 **D:/deepseek-agent/AcceptCat-Windows/0.8.1/AcceptCat_0.8.1.exe**，**86410555字节**，SHA256 **59d4d965ca6f538a8807dc049d782a8a9948cfe66b960cd92250009201f0e7ea**。尚未公开Release或安装到用户当前软件。

2026-10-09已读取GitHub，公开Release仍v0.6.0；本批没有后台/契约/worker/数据库变更，云端源码与schema沿用下方最后部署记录，未重新核验线上健康接口。证据Git外 `.runtime/image-paste-20261009` 保留合成图、OCR真实文字、九项流程、截图、打包检查与构建日志。首次缺失跨目录常量的打包、测试宿主路径/TLS失败已修复并留记录；不计通过。测试宿主资源跨来源缺失不代表正式客户端；实际打包登录资源正常。临时测试进程与宿主在交付前清理。

## 上一本地候选：AcceptCat 0.8.0，OpenMuse风格Windows界面

固定桌面源码 **74a076c389513b36dfbd5393b473e841b3ef59e8**（feature/openmuse-desktop-ui，基于514df6c / feature/research-task-planning）；后续交接文档不改变安装包代码。Windows继续使用Electron22 / React18和现有OpenIM原生SDK；appId、package.name、数据身份和GitHub更新源不变，无API / worker / 契约 / 数据库修改。

浅色导航、可收起聊天列表、居中联系人标题、840px正文、柔和蓝灰消息与浮动输入框；桌面图标工具栏、圆形发送、连续输入、引用和原消息失败重试保留。工作台、计划表单、通讯录、广场、详情和设置统一主题。参考OpenMuse固定提交1ac68f3的React Native设计模式，在当前DOM组件内适配，MIT来源说明进入安装包；没有新增CopilotKit Intelligence / AG-UI / A2A运行时。[设计、实际截图与边界](development/openmuse-desktop-ui.md)。

renderer / Electron类型、发送恢复和代理10项 / 规划4项 / 更新6项共20项、内容门禁160文档 / 10技能通过。实际隔离Electron22组件八组流程通过：折叠搜索、两条延迟回执持续发送、引用、失败保留与原消息重试、设置更新入口、本地实际HTTP / SQLite计划保存、最小工作台和通讯录/广场导航；聊天SDK回执为夹具，不是生产IM。1600×1000 / 1024×726概念对照已查看，pageerror0，无水平溢出；通讯录实际服务数据已读取，广场仅导航与服务检查状态。新打包0.8.0 Electron隔离启动到实际登录页，版本 / 数据身份 / 原生SDK和Skill桥接 / 打包MIT说明通过，截图已查看；不是用户登录或实际安装升级。

真实NSIS构建 **publish never**，exe / blockmap / latest.yml及公开GitHub更新源校验通过。本地候选 **D:/deepseek-agent/AcceptCat-Windows/0.8.0/AcceptCat_0.8.0.exe**，**86408559字节**，SHA256 **621c50174734a4ea32f3ff7f80139f992a14651242bee0db4683ddb4f0a85237**。同目录保留blockmap / latest.yml；未发布Release、操作用户安装版、部署服务器、迁移数据库或使用真实模型。公开更新/后端仍0.6.0 / 11cd20a，contract0.22 / chat1.11 / schema21。

证据在Git外 `.runtime/openmuse-desktop-20261009`：两个概念、最终聊天/工作台/联系人/设置截图、computed-styles.json、platform-fonts.json、ui-qa.json、build-windows.log、update-assets.json、packaged-ui.json及packaged-login.png。临时组件宿主已移出客户端，自有UI/API测试进程关闭；原生SDK夹具、选择器、夹具权限字段和Windows asar路径失败保留，不计通过。上一批科研规划的实验室B3模型、私人Agent/跨空间安排和完整工具执行限制仍保持；旧安装版实际覆盖升级/自动更新重启未验收。

## 上一本地候选：AcceptCat 0.7.0，科研任务规划

固定桌面源码 **d3e8b19f1a722eafcbbc2a4d7f997442244bfbe5**（feature/research-task-planning，基于f611d3f / feature/acceptcat-branding）；后续本批文档提交不改变安装包代码。用户要求参考Today并直接完善任务规划，本批仅修改桌面客户端及交接文档，复用既有计划与任务API，无共享核心、契约、Skill或数据库变更。

工作台默认“任务规划”：自然语言需求、AI异步拆解 / 生成记录 / 取消、论文阅读 / 实验推进 / 论文写作模板、可编辑步骤 / 交付物 / 验收标准 / 分工 / 依赖 / 截止日期、服务端保存与重开草案、同版本确认创建实际任务、验收计数及下一步操作。沿用原有单项任务、邀请、执行、提交与验收面板。日期未知不推测，邀请不等于承接，执行 / 回复 / 提交不等于验收完成。模型生成使用现有实验室科研规划服务；尚未迁移到个人默认模型。任意私人Agent / 跨空间好友的多步骤安排和完整科研工具执行仍未实现。[用法、参考依据、界面对照与边界](development/research-task-planning.md)。

renderer / Electron类型、规划4项与既有更新 / 地址8项共12项、文档门禁159文件 / 10技能、真实NSIS构建与exe / blockmap / latest.yml校验通过。本地真正HTTP / SQLite / worker、隔离Electron22当前组件的7项流程通过，涵盖保存 / 重开、3个独立任务、提交验收后下一步、AI异步草案与1024×726；模型为注入合成，pageerror0。实际0.7.0 app.asar含新模块，新打包Electron22隔离启动 / 登录界面 / 版本 / SDK及Skill桥接通过，截图已查看；仅启动，不代表用户已登录或实际安装升级。组件宿主1600×1000和1024×726与概念对照已查看，保留纵向滚动。

本地安装包 **D:/deepseek-agent/AcceptCat-Windows/0.7.0/AcceptCat_0.7.0.exe**，**86405556字节**，SHA256 **dc5e06358ecb0e7192b9b670fdf05ae3f3b20e877c043126195f427178006055**；同目录保留blockmap / latest.yml。本批没有发布Release、部署API / worker、迁移数据库、操作用户已安装软件或调用真实模型。公开更新与后台仍为下节0.6.0 / 11cd20a，contract0.22 / chat1.11 / schema21。构建使用publish never；旧安装版真实覆盖升级 / 自动更新重启尚未验收。

Git外证据 `.runtime/task-planning-20261009`：ui-qa.json、model-input-proof.json、最终组件截图、build-windows.log、update-assets.json、packaged-planning.json和packaged-login.png。测试宿主文件已移出客户端，自有API / Vite / Electron测试进程已关闭；保留初始选择器、原生导航与asar分隔符检查失败，不算通过。实际启动成功后Playwright进程未自动退出，按记录中的自有进程树关闭；没有重新运行用户软件。

## 前一本地候选：AcceptCat 0.6.1，近期聚焦科研

固定桌面源码：73cffd8eb3db7f15b20c3b3dcb628ec3f55d578b（feature/acceptcat-branding）；后续本批文档提交不改变安装包代码。

用户2026-10-08确定名称 **AcceptCat**，近期服务中国科研工作者，约半年先供本人和学生持续使用。保留微信式人与Agent联系人及长期Personal Agent目标；优先稳定聊天 / 文件、持续课题与学生协作、实际科研产出、跟进与背景复用。产品依据见[规划v0.8](product-plan.md)，旧探索来源及已迁入成果见[迁移记录](migration.md)。

分支feature/acceptcat-branding基于7e49368，仅修改桌面品牌、安装兼容与方向文档：窗口 / 标题栏 / 登录 / 设置 / 托盘 / 更新确认 / 启动页 / 安装元数据统一AcceptCat；安装和快捷方式改名。appId、package.name、默认Electron数据身份、固定GitHub更新源保留，原生更新识别新旧卸载程序。renderer / Electron类型、8项更新与服务地址检查、内容门禁、真实NSIS构建、exe / blockmap / latest.yml校验通过。隔离实际打包Electron22的窗口 / 登录品牌、app.getName仍research-wechat-openim、原生SDK / Skill桥接和无pageerror通过，截图已查看。

本地安装包 `D:/deepseek-agent/AcceptCat-Windows/0.6.1/AcceptCat_0.6.1.exe`，86388221字节，SHA256 `e71a37d6af4a6d69391cc002edf8ff5f42d02090fbb4e5c18e9c10f6954e1c14`。本批未发布Release、部署服务器、迁移数据库或操作用户已安装软件；公开更新源与API / worker仍为下节0.6.0 / 11cd20a。真实旧安装版覆盖升级与重启未执行，也没有新增科研工具执行。失败的跨项目类型 / 品牌打包路径检查保留，最终已修正；证据在Git外 `.runtime/acceptcat-branding-20261008`。[具体范围与后续](development/acceptcat-branding.md)。

## 当前已发布：Windows0.6.0私人技能，API / worker配套已上线

2026-10-08 **18:01:21北京时间**，[v0.6.0](https://github.com/luoyan96/personal-agent/releases/tag/v0.6.0)正式发布，桌面与API / worker固定源码11cd20a92bd1a295120f7c87eea022da3ff9c411，contract0.22 / chat1.11 / schema21。工作台 → 我的技能支持文件夹、ZIP和GitHub固定提交安装，默认私人；绑定本人Agent、聊天选择技能 / 参考文字，独立公开介绍 / 好友调用 / 源码复制授权、启停、历史修订切换和本人真实调用记录。[PR23](https://github.com/luoyan96/personal-agent/pull/23)为草稿，依赖PR22，未合main。

实际paper-framework-figure-studio-pro v3.2.15f的59120字符说明 / 120参考文字导入与完整模型上下文已验证，执行器目前仅文字流程；不执行包内脚本、不生成图片、不上传二进制素材。此包的完整绘图工作流尚未实现。[实现与使用边界](development/private-skills.md)。

完整CI47文件 / 588项、生产021两项、B0 / Web隔离；原生导入3项、桌面类型 / 构建、真实隔离Electron22安装 / 绑定 / 聊天 / 调用记录与1024窗口通过。模型合成、原生选择器返回模拟为实际解析包。实际打包0.6.0启动 / 技能preload通过。固定源码11cd20a的[GitHub37759957391](https://github.com/luoyan96/personal-agent/actions/runs/37759957391)三平台全部通过；6项真实线上HTTPS安装 / 权限检查通过，合成记录停用 / 解绑 / 撤公开 / logout，未使用用户Key、资料或真实供应商。

API / worker同镜像sha256:580d8333423e8fab0d7fb5f4216a6707fa073b3cbb975794565beb3cf18c6e9b；备份隔离恢复通过，迁移021新增3表，旧83表行摘要保持，integrity / FK通过。Windows安装文件D:/deepseek-agent/PersonalAgent-Windows/0.6.0/ResearchWeChat_0.6.0.exe，86384427字节，SHA25677f448b0f5bd56ac3412076d35265eb25fc8b9b97e0c63e01404cfcd29712908。四远端资产size / digest和实际公开latest.yml字节核对通过；左下角设置 → 版本更新可升级，也可手动运行安装包。未代替用户安装 / 重启，升级前复制未确认发送文字。[部署和回退收据](deployment/personal-agent-private-skills.md)。Git外证据.runtime/private-skills-20261008保留本地检查、实际截图、早期迁移 / 打包失败与发布收据。

## 本批历史：Windows0.6.0本地准备

本批 feature/private-skills 基于 ead4331，新增工作台“我的技能”：文件夹 / ZIP / 固定提交 GitHub 导入、私人保存、本人站内 Agent 绑定、聊天选择、版本切换、独立的公开介绍 / 好友调用 / 源码复制授权与本人实际调用记录。契约0.22 / chat1.11，显式迁移021。完整CI47文件 / 588项、生产021两项、B0与Web隔离通过；桌面类型 / 构建、原生导入3项与隔离Electron22实际组件安装 / 绑定 / 聊天 / 调用记录和1024窗口通过。原生实际GitHub固定提交下载与完整59120字符说明进入合成模型请求通过。没有用户账号 / Key / 实际模型 / 绘图执行验证。详细边界见[私人技能](development/private-skills.md)。

上游 paper-framework-figure-studio-pro v3.2.15f 包依赖脚本和图片生成，当前只支持完整文字步骤，脚本和二进制素材不上传、不执行。执行依赖需在聊天中确认，不能把“安装”或“回复完成”说成完整绘图任务完成。Git外证据在 .runtime/private-skills-20261008。发布/部署收据未完成前，下方0.5.2 / API06262a6b仍是实际线上版本。

## 当前已发布：Windows 0.5.2 消息读取修复

2026-10-08 **16:07:37北京时间**，[v0.5.2](https://github.com/luoyan96/personal-agent/releases/tag/v0.5.2)已正式发布，固定源码 `5740c821c020e9b7d9db4ca5e5a705588fc53ec3`。`fix/desktop-message-loading` 基于 PR21 的文档提交 `9ee9ba6`，[PR22](https://github.com/luoyan96/personal-agent/pull/22)保留草稿、未合main。旧只读 hook 每5秒开启下一次请求并使上次请求失效；响应超过5秒时，即使服务端正常返回也一直显示“正在加载消息”。现在同身份/消息作用域的轮询和手动刷新共享正在执行的读取，30秒总期限后显示明确错误和重试；切换会话或身份取消旧读取，迟到结果不显示。失败后自动读取退避15秒，手动重试可立即执行。普通正文独立读取，仅消息实际包含协作建议编号时请求建议；建议失败不会隐藏正文。

renderer 类型、6项真实 Electron22/Chromium108 组件与 HTTP 检查、10项既有发送/原生代理回归通过；覆盖6.5秒慢响应、错误重试、建议503、会话切换、真实30秒挂起期限和1024×726无横溢出。账号/正文/响应服务均合成，没有读取用户聊天、Key或调用模型。实际0.5.2打包登录页、版本与原生桥启动通过，未登录401保留；没有安装或重启用户软件。无共享代码/迁移/后台部署变化，线上 API/worker 仍 `06262a6b`，contract0.21/chat1.10/schema20。

安装文件 `D:/deepseek-agent/PersonalAgent-Windows/0.5.2/ResearchWeChat_0.5.2.exe`，86293535字节，SHA256 `feeb0cc3f2b67d45cbef327d2f94dd8d32a1289ea7ae45feabe25b509145fce5`；exe/blockmap/latest.yml及固定公开GitHub源门禁通过。4个远端资产size/SHA256与本地一致；**未使用授权头**读取公开latest确认v0.5.2，并下载实际公开latest.yml，字节与本地清单一致。左下角设置→版本更新可检查/下载/确认重启；升级前复制尚未确认发送的文字，待发记录目前不跨重启恢复。GitHub运行源码5740c82的[37744484688](https://github.com/luoyan96/personal-agent/actions/runs/37744484688)Ubuntu22.19/24与Windows24三平台全部通过；后续文档提交不改变该安装包源码。

证据在 Git外 `.runtime/message-loading-20261008`，包含旧版复现、修复后的截图/结果、打包日志、资产摘要、启动401和夹具准备失败，以及draft/uploaded/published-release.json、public-update-proof.json和实际公开latest.yml。GitHub CLI/连接超时与草稿按tag读取404保留；改用有界HTTPS、实际返回的Release编号和仅内存复用现有CLI授权完成发布，TLS校验保留，密钥不写入记录。后续发布收据不能代替实际交互证据。

## 最新后台：对话上下文分层已部署，现有 Windows 0.5.1 兼容

`feature/conversation-context` 在Windows0.5.1配套后台上实现近期原文、早期有出处摘录、同对话历史检索、相关已确认记忆与实际工作任务状态。普通新建本地聊天总上限16000/90，输出仍4096；原队列/重试/创建/协调/定时/外部/文件预算保留。没有新增公开协议、数据库迁移或桌面安装包，现有Windows0.5.1兼容。详见[上下文实现与边界](development/conversation-context.md)。

2026-10-08 **12:25北京时间**，API/worker已成对部署固定源码 `06262a6b7b0167b7434e4536b753ec2526e8d045`，同镜像 `sha256:7b2b77b62a5c37616268bb0190465a469ac38c2e8ea076dea4b25a82510bc663`，均running / unless-stopped。contract0.21/chat1.10/schema20、公网ready200；没有迁移或新的客户端安装要求。83表备份隔离恢复、全部行摘要保持、integrity/FK通过。部署与回退配置见[本批部署记录](deployment/personal-agent-conversation-context.md)。下面5c949980是上一轮后台版本。

定向真实HTTP/SQLite/生产worker的7项新上下文检查和相关聊天、文件、账户/创建边界通过；供应商明确合成。最终完整 `pnpm run ci` **46文件/575项**、生产020 CLI/HTTP两项、B0进程与Web生产隔离全部通过。两次先前完整检查的可空任务结果编号编译错误、3项旧默认预算夹具失败保留，修正后完成完整检查。云端运行模块与受测源码编译结果核对通过；Windows chat.js模板串的5个CRLF统一LF后相同。证据在Git外 `.runtime/conversation-context-20261008`；源码审查[PR21](https://github.com/luoyan96/personal-agent/pull/21)为草稿，依赖PR20，未合main。未使用用户Key或资料做真实模型质量评估，关键词检索和有出处摘录的边界见实现说明。

固定运行源码06262a6b的GitHub [37726801838](https://github.com/luoyan96/personal-agent/actions/runs/37726801838)三平台（Ubuntu22.19/24、Windows24）实际全部通过；后续部署日志文档提交不改变该运行源码或Windows发布标签。

## 上一版发布：Windows 0.5.1，云端工作台与广场

2026-10-08 **10:08:00北京时间**，[v0.5.1](https://github.com/luoyan96/personal-agent/releases/tag/v0.5.1)已正式发布并成为公开latest；标签固定桌面源码 `784de4231918e42301f82a979c238118e0405d04`。该轮API/worker升级为固定源码 `5c9499800ec71f6b6ad444b2e9d89ba06d9a4808`、镜像 `sha256:0c6929175fae18ad603eb25d558daf75cb3bfb66314e46f3fe9cdfc4bc98a555`，已由本页上方06262a6b上下文后台替换；contract0.21/chat1.10/schema20保持。**019/020已部署，工作台/广场接口可用。** [PR20](https://github.com/luoyan96/personal-agent/pull/20)保留草稿、未合main；v0.5.0标签和0.4.0旧草稿保留。

桌面为微信式消息、通讯录、工作台、广场四入口。人与Agent共同名片、创建/导入/兼容外部连接、实际历史搜索/引用/群@、置顶/免打扰和连续输入/流式/恢复接入现有聊天。工作台管理提案、群确认、任务承接、实际结果和指定消息验收；本人主动公开/撤回能力，双方同意后联系。定时管理、本人记忆/模型设置与永久版本更新入口保留。详见[功能交接](development/desktop-social-workspace.md)。0.5.1增加公共ready版本检查，旧服务器给出明确更新说明、本机报告独立，真实权限错误保持。

之前“都是空的”的404来自桌面0.5.0与旧服务器0.19不匹配。用户明确授权维护会话后已备份、迁移并成对升级；研究库隔离恢复读取通过，78旧表的行/hash、旧迁移记录及外键/完整性保持。第一次备份只读WAL查询失败后确认schema18并恢复原服务，修正备份/恢复脚本后完成升级；上传、预检、权限及中断证据均保留。具体备份、镜像、回退约束见[本次部署收据](deployment/personal-agent-social-workspace.md)。

本地共享完整CI45文件/568项、生产020两项、B0/Web隔离与桌面类型通过；GitHub [37714297856](https://github.com/luoyan96/personal-agent/actions/runs/37714297856)Ubuntu22.19/24及Windows24全部通过。桌面实际React/HTTP/SQLite12类管理交互、Electron22连续聊天/群@/worker结果（模型与IM端口合成），0.5.1版本兼容8项和实际打包登录页/native桥通过。受限GPU失败与正常宿主原参数通过证据均保留，没有替用户安装或重启。

云端两个新合成账号的**16项真实HTTPS检查通过**，包括跨空间真人/Agent联系同意、真实OpenIM授权回调/身份/群与私聊同步、提案/群确认、自有Agent加入、任务承接和真人结果精确验收、定时管理及到时后台提醒（一次run、实际im_sent、无模型turn）。测试公开资料已撤回、安排inactive、会话logout；合成账号/审计历史保留。没有使用用户账号/Key/文件；真实模型和SDK媒体收发此批未重测。原工具元数据覆盖汇总15的原报告保留，日志核实后仅修正报告为16/16，没有重复线上测试。

Windows安装文件 `D:/deepseek-agent/PersonalAgent-Windows/0.5.1/ResearchWeChat_0.5.1.exe`，86296322字节，SHA256 `71d1086c9538effb756ab710d8751ec53c21d8f6f6d9596905fa74368fd58117`。四发布资产size/digest与本地一致，实际公共latest.yml为0.5.1。设置→版本更新可检查/下载/确认重启，也可自行退出旧软件后手动安装。升级前复制未确认发送的文字；待发记录尚不跨重启恢复。

证据：Git外 `.runtime/desktop-social-workspace-20261007`（cloud-deployed-proof.png、发布/部署收据、backend/live-20261008020302496_4ff920cd）与 `.runtime/desktop-social-workspace-20261008`（界面与0.5.1包启动）。服务器备份/容器inspect包含私密配置，只留服务器私有目录，不进Git。

范围仍有边界：普通跨空间讨论群与科研资料ACL分开，自己的私人记忆/文件不随入群或公开；开头@一个已加入站内Agent才请求处理。外部Agent支持chat_completions兼容连接与逐条文字同意，不自动转发群资料，不是通用A2A/MCP。完整行为学习、任务匹配质量、条件跟进与策略自我改进仍依路线逐批验证。

下列0.3.3/0.4.0及更早章节是历史记录；其中“未迁移/等待授权”的状态已由本节和本次部署收据更新，不能据旧章节判断当前云端。

## 最新桌面源码：Windows 0.3.3 设置与版本更新

`feature/settings-version-updates`基于已发布0.3.2源码 `6448412cb2401082a3cf86a1077604fb69df44b4`，只改桌面React / SCSS及客户端版本。登录后左下角“设置”一直存在，菜单保留“模型设置”并新增“版本更新”。版本从原生快照读取；打开更新页检查，已有下载中 / 已完成候选不被重新检查清空。页面展示实际版本、检查结果、发布说明、下载百分比及“安装并重启”；状态与左下角提示共用一个原生订阅，迟到快照不能覆盖新事件。自动检查保持15秒 / 6小时 / 唤醒；不自动下载和安装，重启仍由原生保存确认处理。

renderer / Electron类型、5组既有更新控制器检查通过。真实Electron22 / Chromium108生产导航、设置、共享hook、原生IPC / preload方法和控制器完成18项定向交互检查；两个夹具选择器重名失败保留，修正选择器后只补未完成项和迟到快照，不重复已通过流程。1024×726 / 1280×820无横向溢出，设置 / 版本窗无遮挡，pageerror0；截图查看后修正Badge导致的设置图标颜色，再做一次定向截图与颜色检查。Router / 开发CSP / Antd废弃告警如实记录。Browser插件不可用，使用隔离Playwright Electron；发布执行器、安装版资格、OS确认及无关聊天传输明确合成，不使用用户账号 / Key / 文件，不声称真实旧安装版升级已执行。证据在Git外 `.runtime/settings-version-updates-20261007`。

实际NSIS构建与exe / blockmap / latest.yml / 固定公开GitHub更新源一致性门禁通过，安装包86288813字节、SHA256 `0ce45b9a0b3ff04c57d6838949e8b89429a37ca31d468ffd32b878075f0f5284`，另存发布收据；精确源码以 `v0.3.3` 标签和Release为准，本机安装文件在 `D:/deepseek-agent/PersonalAgent-Windows/0.3.3/`。用户正常客户端未安装或重启。旧版需先用系统托盘“检查更新”或手动安装一次0.3.3，之后才有固定设置入口；升级前复制未确认需求。云端仍API / worker94b26d1、contract0.19 / chat1.8 / schema18，本批无服务器部署或迁移。

## 独立待上线：定时任务 Windows 0.4.0

0.3.3发布结果：2026-10-07 **22:21:46北京时间**正式发布 [v0.3.3](https://github.com/luoyan96/personal-agent/releases/tag/v0.3.3)，成为公开latest；标签精确指向 `1fbb238ddc274bb7388d431756cd7d010ad37f13`。4个公开资产大小 / GitHub SHA256 digest全部与本地一致，[PR19](https://github.com/luoyan96/personal-agent/pull/19)已上传并保持审查状态，未合并main。[Foundation checks37635589030](https://github.com/luoyan96/personal-agent/actions/runs/37635589030)本次读取时仍在运行，不能称三平台CI全部通过。`published-release.json` / `uploaded-release.json`保存公开latest、标签SHA及0.4.0仍为草稿的核验收据。后续文档提交不改变该安装包源码。

[PR18](https://github.com/luoyan96/personal-agent/pull/18)的 `feature/recurring-agent-tasks` 已准备0.4.0候选与GitHub草稿，runtime源 `f91b9d552c4f786b61434718dea114187ca9e1d2`，后续测试 / 文档提交 `d015b099ad7a8dacf9d56bad7289743aab731258`。该分支需要contract0.20 / chat1.9 / migration019；阿里云Workbench明确授权问题仍待回复，云端未升级，**0.4.0草稿不能提前公开**。本次0.3.3独立兼容现有后端，不把定时任务称为已上线。其证据在 `.runtime/recurring-agent-tasks-20261007`，安装候选在 `PersonalAgent-Windows/0.4.0`；不要拿本次更新入口验证代替定时任务部署验收。

## 上一版桌面源码：Windows 0.3.2 发送恢复

## 最新开发：重复提醒与定时 Agent 任务（本地，待云端部署）

`feature/recurring-agent-tasks` 基于 Windows0.3.2 发布源码 `6448412cb2401082a3cf86a1077604fb69df44b4`，候选桌面0.4.0。一次 / 每天 / 每周多星期，提醒或指定自己的站内 Agent 执行；聊天明确时间指令可保存，左侧“定时任务”可查看、修改、暂停、恢复、结束及分页运行记录。使用现有模型设置和每次有界预算，结果沿既有权威聊天 / OpenIM 投递；客户端关闭后由持续运行的云 worker 调度。详见[定时任务交接](development/recurring-agent-tasks.md)。

共享 contract0.20 / chat1.9 / 显式019新增运行记录表，旧018数据与checksum保留；发生记录 / 消息 / turn / 下次时间同事务、唯一发生去重。逾期多次合并一次，恢复只取未来时点；修改 / 暂停 / 取消栅栏旧运行，失败 / 不确定用量不自动重复调用。缺模型或聊天忙时记录跳过，不打断已有聊天；无新增通用工具、联网能力、后台本地目录读取或系统推送。

后台8项新增专项通过，完整工程44文件 / 546项通过。首次旧迁移 / 契约 fixture 失败保留，版本期望同步后通过；生产入口019断言修正后2项通过，B0真实进程与Web生产隔离通过。桌面renderer类型、13项实际生产导航 / 表单 / 记录交互、Windows0.4.0 NSIS打包通过。隔离Electron22 / Chromium108验收修改 / 暂停 / 恢复 / 取消、失败保留文字、最小窗口不横溢出，pageErrors0；截图已查看，开发Router / CSP / Antd警告及故意503保留，不称console无输出。证据 `.runtime/recurring-agent-tasks-20261007`，模型 / SDK / 账号均合成，未使用用户 Key 或资料。候选安装文件另存 `D:/deepseek-agent/PersonalAgent-Windows/0.4.0`，尚未安装到用户窗口。

**云端仍按下文既有 API / worker94b26d1、contract0.19 / chat1.8 / schema18 记录理解；019尚未在生产执行。** 这批需要成对升级 API / worker，匹配后端可用后再发布桌面更新，不能把 GitHub 源码或本地安装包当成已上线。先前浏览器维护会话读取被自动审批拒绝，未绕过；生产接入仍需明确授权与有效维护会话。

固定候选源码 `f91b9d552c4f786b61434718dea114187ca9e1d2` 已推送[PR18](https://github.com/luoyan96/personal-agent/pull/18)。Windows0.4.0草稿发布已上传四资产，GitHub实际大小 / SHA256摘要全部与本机一致；安装包86290794字节、SHA256 `3d522eacce1a9242db2b84b6c02db16c858d1bce65277d80497759f63a2e6a2c`。草稿不触发公开自动更新，最新公开仍0.3.2；没有替用户安装 / 重启。

候选[Actions37628593268](https://github.com/luoyan96/personal-agent/actions/runs/37628593268)的Ubuntu22.19 / 24完整CI实际通过，Windows545项通过、唯一旧001→019真实磁盘迁移测试超过框架5秒。只将该项test harness期限设为20秒，所有旧行 / checksum / 重复迁移断言及生产时限不变；窄迁移测试实际通过。失败日志保留，未绕过main门禁；后续同一运行源码的GitHub检查按实际结果读取。此修正只有测试 / 文档，运行代码与f91b9d5候选相同，无需重复桌面打包。

## 最新桌面源码：Windows 0.3.2 发送恢复

`fix/desktop-send-recovery`基于0.3.1发布源码e1d38de。普通API请求完整期限30秒（涵盖CSRF会话准备、连接与响应正文），附件读取保留120秒；SDK文字发送也有有界等待。超时 / 停止等待保留原文、请求体、原幂等键或nativeMessage；“重试原消息”核对原提交结果，后续句子等待前一条确认。切换联系人立即取消等待并暂停原记录，旧请求不能锁住新会话或用迟到结果删除暂停记录。恢复卡独立放在编辑器上方，错误和操作不会被遮住。

原生代理增加120秒完整期限和上游正文中断处理；已开始的正文断开时关闭响应，不拼接错误JSON；无响应头时返回带requestId的有效错误信封。原生日志只含方法、原因、状态、耗时、系统错误码和随机requestId，不记URL / 文字 / Cookie / Header / 凭据；固定HTTPS / 来源约束不变。

renderer / Electron类型、6项生产API合成传输、4项生产代理真实本地HTTP / 合成HTTPS、16项真实Electron22 / Chromium108生产组件交互通过，pageErrors0。1280×820 / minimum1024×726卡片与编辑器无遮挡，截图已查看。Git外`.runtime/desktop-send-recovery-20261007`保存检查、截图及失败准备记录：CJS默认导入设置、fixture注释 / 虚拟模块缓存 / 宽路由误拦源码。真实云端和已运行用户桌面代理无凭据检查ready200 / contract0.19、session401、无效请求400，均快速响应；不证明用户那次失败的云端原因，不替代真实模型回复验收。浏览器维护页面读取被自动审批拒绝，云日志诊断等待明确授权，未绕过拒绝；未用用户Cookie / Key或重启其软件。

仅客户端 / Electron修改，无数据库 / API / worker部署变更。现有sessionStorage仅当前窗口刷新恢复，未新增跨软件重启待发恢复；升级前应复制现有未确认需求。准确发布源码 / 安装文件以v0.3.2标签、Release及Git外发布收据为准。既有共享Windows基础CI存在API文件解析与注册超时，本批不放宽生产期限、不绕过main合并门禁。

实际Windows NSIS打包、更新资产一致性门禁与隔离profile的包启动通过；启动检查在网络受限环境记录EACCES传输元数据，证明界面 / 主进程 / SDK初始化与失败日志，不证明云端连接。安装包86286669字节，SHA256 `c0ecd187b8a5e84f37a8f652a99089c7a55d582a3874b6cf43e41a29fb38d6c2`；本机`D:/deepseek-agent/PersonalAgent-Windows/0.3.2/ResearchWeChat_0.3.2.exe`。exe / blockmap / latest.yml与固定公开GitHub更新源一致；实际安装和用户需求重发由用户自行操作。

## 上一版桌面源码：Windows 0.3.1 左下角更新入口

用户要求类似ChatGPT的窗口左下角更新按钮。`feature/desktop-update-button`在既有原生electron-updater状态机上增加固定动作的主frame桥、订阅与初始快照；发现新版才显示“更新”，点击下载后显示百分比，库确认候选下载完成后显示“重启更新”。安装仍经过原生保存提示，稍后不会退出时安装。自动检测保持启动15秒、每6小时和唤醒，但不再弹出打断聊天的自动提示；托盘手动检查保留。刷新 / 切换页面读取当前原生状态，不重复下载；失败可重试。旧版本需要先通过原托盘入口或手动安装升级一次到0.3.1，之后才有新按钮。

renderer / Electron类型、既有5组更新控制器检查、真实Electron22 / Chromium108下17项定向更新交互、实际NSIS打包与更新资产一致性门禁通过。交互检查使用真实生产React导航 / 主进程 / IPC / preload方法 / 控制器，发布端口、安装版资格与OS确认响应明确合成；验收程序未真实下载或执行安装器，不称已安装旧版本重启升级通过。新桥拒绝另一窗口、未下载完成、过时版本的安装请求，候选来源仍固定公开GitHub，无自定URL / 路径 / Token或TLS放宽。

安装包86287581字节，SHA256 `bd7702604c996910baecef8d68c28f12b29a001486870aec6284637d2c945d89`，本机`D:/deepseek-agent/PersonalAgent-Windows/0.3.1/ResearchWeChat_0.3.1.exe`；发布源码以GitHub `v0.3.1`标签和Release为准。Git外`.runtime/desktop-update-button-20261007`保存类型、交互、截图、构建及发布收据；首次QA esbuild依赖解析、截图准备requests数组遗漏与原生进程清理权限失败均保留记录，最终截图使用有效合成HTTP结构。用户正常客户端和账号未操作；服务端 / 云部署 / 数据库均未变。

## 上一版桌面源码：Windows 0.3.0

用户要求前端采用6.1 sol / high改进Windows桌面聊天界面。分支`feature/desktop-agent-interface`完成微信式三栏布局、会话真实名字筛选、模型设置入口、统一人与Agent通讯录样式、直接媒体工具栏、生成中继续输入、流式消息和可展开的文件任务卡。当前文件 / 字符范围、分析步骤、停止与已保存报告来自既有真实状态；群聊保留发送者署名。最终汇总步骤已纳入completed计数，原生报告错误去除IPC技术前缀。

最终renderer类型检查通过；真实Electron22 / Chromium108生产组件的17项定向交互通过，SDK / API / 报告桥为合成，实际生产desktop runner取消路径有明确HTTP目标；1280×820无横溢出，168px编辑器，pageErrors0。实际长文件 / 合成模型 / 真实报告的完成计数专项通过。原生检查启动阶段的源模块误拦、错误监听时机、窗口发现、缺失桥和取消文字多匹配等失败证据保留；不是用户账号、真实模型质量或安装升级验收。检查与截图见Git外`.runtime/desktop-interface-20261007`，设计 / 类型 / 计数 / 打包 / 发布记录见`.runtime/desktop-ui-refresh-20261007`。准确发布源码及安装文件以GitHub `v0.3.0`标签与Release为准。

本批没有CopilotKit / AG-UI依赖或协议适配，服务端鉴权、OpenIM权威消息和500ms增量快照机制沿用；界面不会增加通用自主工具、跨重启本地任务恢复或行为学习。接入原理、当前真实来源与后续适配边界见[桌面文件工作区](development/desktop-agent-workspace.md#agent交互与copilotkit--ag-ui的关系)。数据库 / 共享API / 云端部署未变。

Windows0.3.0实际打包及更新文件门禁通过，安装包86284271字节、SHA256 `69e561754a6222e620ab274d0f9bfaba71221cd9d2ee6d020726ec7c2292565a`，本机`D:/deepseek-agent/PersonalAgent-Windows/0.3.0/ResearchWeChat_0.3.0.exe`。安装版沿用托盘“检查更新”；用户自行退出旧版后安装。本批未替用户安装或重启。

## 上一版桌面改造：Windows 0.2.0

用户最新要求集中做好Windows桌面端。新版安装包携带本地界面，保留人与Agent同一通讯录及模型设置，改进标题栏、头像、Markdown聊天、直接工具栏和输入区。增加“选择本地文件 → 分段分析 → 分层汇总 → 本机报告”的真实状态流程；可切换聊天继续任务、停止本任务，重开已保存报告。源码与使用/检查范围见[桌面文件工作区](development/desktop-agent-workspace.md)，发布源码以GitHub `v0.2.0`标签为准。

本批限定客户端/Electron源码，没有数据库迁移。API、worker和网页部署继续按下文既有实际部署记录理解。长期自主任务、通用工具/浏览器/Shell以及退出桌面后的本地任务恢复尚未实现。合成模型流程与实际原生桥接分别记录，不能把合成回答作为真实模型质量证据。

## 五分钟阅读顺序

1. 本文、[项目进展日志](project-log.md)、[开发规则](../AGENTS.md)。
2. [新 ECS 部署与验收](deployment/openim-ecs.md)、[完整客户端说明](../clients/openim/RESEARCH-CLIENT.md)。
3. [产品规划v0.7](product-plan.md)与[Personal Agent主线](roadmap.md)，再按任务进入[共享OpenIM桥契约](development/openim-bridge-contract.md)。

## 用户已确认的产品逻辑

- 2026-10-06最终目标：以个人为中心的Personal Agent，微信式交流；人与Agent在同一通讯录共生；按任务类型 / 难度组织协作；形成用户习惯、偏好、工作方式等长期记忆，持续迭代并主动跟进。科研是首个验证场景，个人可以独立使用。
- 个人助理持续存在，简单事情直接处理，专项工作复用 / 必要时创建Agent，复杂工作才组织任务群。记忆及跟进在后台持久保存，反馈影响后续工作；自动组织、行为学习和个人主动跟进是目标，当前未形成完整真实闭环。
- 产品是微信式科研协作：人与 Agent 共用通讯录、档案、私聊和群聊。Agent 有稳定身份、能力、介绍、性格和获准记忆。
- 固定置顶“需求与协作”是需求与能力匹配入口。表达需求后提出分工与建群建议，任务群可包含真人与 AI。
- 群聊成员身份、任务承接和资料授权分别管理。真人自主接受；Agent 同意不替代所属真人同意。
- 普通文字中的 `@` 不隐式执行任务；执行、邀请、验收须经明确动作与权限检查。
- 采用完整 OpenIM React/Electron 客户端，科研 API 保留身份、任务、权限和交付的权威状态。OpenIM 负责真实 IM 消息和媒体。
- 用户最终交付目标包括桌面客户端和手机App；2026-10-07最新要求先集中做好Windows桌面端，网页与手机暂不展开。手机窄屏网页不算原生App完成。
- 用户最新密码要求已上线：最少 8 个字符，无大小写 / 数字 / 符号组合要求，无独立密码最大长度，密码不自动 trim。整体 HTTP / CLI 请求大小限制仍保留。
- 2026-10-05 最新方向：暂缓完善需求编排，先做好人与 Agent 的自然聊天。注册不再强制实验室邀请码；按准确用户名发现人及 Agent，申请同意后私聊。团队邀请码仅作为自愿加入已有实验室的选项。
- 普通个人 / Agent 私聊默认只输入文本并发送；使用本人默认模型，保留真实档案、性格和授权记忆。任务、材料、预算与需求模板收在可选协作中；普通聊天不创建计划、群、任务或执行动作。主标题显示真实 Agent 名称，沿用原协调身份和置顶映射。
- 设置入口改为“模型设置”，每个人管理自己的 DeepSeek / 通义千问 / 豆包配置、加密 Key、启用及默认选择。朋友使用本人 Key 与当前对话记忆，不能读取 Agent 主人的 Key 或私有记忆。既有 IFRC 未选择个人配置时兼容旧模型；明确作个人选择后不静默回退。

## 桌面隔离验收启动报错（源码修复，未重发安装包）

2026-10-07用户截图的 `Unexpected desktop review directory` 来自先前自有Electron验收程序：初次测试目录用了 `openim-query-probe-`，不符合生产启动守卫规定的 `openim-electron-review-` 前缀；目录检查又在异常处理器注册之前执行，因此弹出未捕获异常窗口。先前验收脚本已纠正前缀，本批在分支 `fix/desktop-review-startup-error` 将原有目录检查 / userData设置移入已注册异常处理器之后的try块，保留原目录边界和拒绝条件。

Electron主进程类型检查通过；真实Electron22.3.27运行生产bootstrap / smoke源码，两个非法目录均快速退出1，合法隔离目录进入明确合成的最小main并退出0，均无超时。没有调用真实业务main、模型、网络或用户账号，不当作完整客户端端到端验收。Git外 `.runtime/desktop-startup-error-20261007/report.json`及三组stdout / stderr日志保存证据；初次测试失败仍保留在 `.runtime/desktop-message-query-20261007/probe.log`。进程核对无自有测试残留，用户正常客户端仍在运行，未重启或重装。此前云端b3eb215历史消息修复、API94b26d1和Windows0.1.1安装包均保持；此源码修复留待后续安装包纳入。

## Windows 登录后历史消息误报权限（已上线并实际验收）

用户2026-10-07截图中本人和个人助理的旧消息均显示“当前权限下无法读取”。固定修复 `b3eb21536d696f25fc5535e6a3b2c6e854f03c18`、[PR12](https://github.com/luoyan96/personal-agent/pull/12)：实际打包Electron22 / Chromium108没有 `URLSearchParams.size`，原客户端因此丢失全部GET查询参数，读取默认前30条后找不到后续canonical消息。改用 `query.toString()` 判断非空；未找到消息时显示真实未找到状态，不再误称权限不足。后端鉴权、共享API、contract0.19 / chat1.8 / schema18未改。

renderer类型、Web构建及四个固定SDK资源通过；[源码三平台CI37572397265](https://github.com/luoyan96/personal-agent/actions/runs/37572397265)全部通过。自有隔离的真实Electron22运行生产researchApi / ResearchMessageRender，HTTP事实与SDK明确合成：旧代码复现两条误报，修复后第40 / 41条逐条取回，分页、中文搜索、会话筛选、cursor编码及刷新去重通过，console / pageerror均0。`after-d401dc00/report.json`为最终通过；隐藏窗口截图timeout、截图挂起中断和fixture初始化失败证据保留。

2026-10-07 **13:00:32北京时间**，固定b3eb215静态发布完成，公网index SHA256 `92a23a8d1a9dd2446648da15dbb522e86e624dc471a2ecb11de41bff5cb6c773`。源码归档、两处修复源码、四个SDK资源、八服务运行 / API healthy / HTTPS ready0.19通过；后端94b26d1及八镜像保持，没有迁移。独立公网HTTP核验同一首页及ready通过。静态恢复依据私有部署收据中的Nginx副本，仅恢复上一版8b42d35首页3a43637b，核对健康与原镜像；不恢复数据库。

真实用户已登录的Windows客户端重新加载后，截图中21:15的原提问与个人助理原回复均恢复，三个合成文件末尾标记和全部13页范围真实显示，权限误报消失，编辑器空白。此次没有发送新消息、调用模型、读取凭据或重新上传附件；这是历史消息显示验收，不能当作新的文件夹 / 模型 / IM端到端验收。普通Ctrl+Shift+R未重载Windows无菜单窗口，使用既有开发工具重载页面后成功，临时开发工具已关闭。

Git外 `.runtime/desktop-message-query-20261007/`保存原因证明、前后截图、types / build、CI及`release/{deployment-verified,public-verified}.json`；`live-desktop-verified.json`和`live-desktop-after.png`为实际用户桌面证据，私人会话记录未入Git。Workbench网关两次NoSuchKey上传失败和单连接下载timeout保留，公开上传含运维信息的完整包被自动审批拒绝；改用只含公开前端源码与dist的资源包，运维助手 / manifest留在既有私有SSH会话，分段下载总hash符合候选。资源作为既有v0.1.1的补充附件上传，未建立新版Windows Release，也未替换EXE / latest.yml / blockmap。用户现有桌面重新加载云端UI即可，无需重装。

## Windows 软件更新（0.1.1已发布）

用户要求检测新版本、提示并点击更新。分支 `feature/windows-updates` 基于main `abed83e792d4f4b8af3881d5aae1cc375db09d83`，只接原生 `electron-updater` 5.3.0与本项目公开GitHub Releases；共享API / 云端UI未改。安装版启动15秒、每6小时及唤醒检查，前台提示；后台结果回到窗口再提示。系统托盘有真实版本及“检查更新”。检测不下载，明确下载后库校验，再由本人“安装并重启”；退出不自动安装，不自动降级或选择预发布版。无renderer安装IPC / 自定URL / 嵌入Token，无TLS、webSecurity或签名检查放宽。

Windows0.1.1安装包86257023字节、SHA256 `d3350cdd7405aec2526ac9e917e65970ad901d3a2c96ba4977621795891572a0`；本机入口 `D:/deepseek-agent/PersonalAgent-Windows/0.1.1/ResearchWeChat_0.1.1.exe`。[更新使用与发布步骤](development/windows-updates.md)。0.1.0须首装一次新版本；免安装目录明确引导安装，不做原地替换。

5组状态 / 故障检查、renderer / Electron类型、NSIS最终构建、实际打包启动smoke、安装包 / app-update.yml / latest.yml / blockmap一致性门禁通过。`native-final3/report.json`真实Electron22 0.1.1正常HTTPS登录及原生未安装保护通过；仅OS提示响应替代，未执行安装。首轮重复publish参数造成builder尝试创建发布器、缺GH_TOKEN失败（无上传），去掉新增重复参数后沿原默认单个 `--publish never` 构建通过；两次开发测试require / dynamic import入口失败保留。

2026-10-07 **11:06:33北京时间**，正式[v0.1.1](https://github.com/luoyan96/personal-agent/releases/tag/v0.1.1)发布，安装包源码固定 `e8cffadb38ab5bb3abeb951107491ea39a482c10`，其[三平台CI37564725311](https://github.com/luoyan96/personal-agent/actions/runs/37564725311)全部通过；[PR11](https://github.com/luoyan96/personal-agent/pull/11)记录实现与本次发布文档。三个资产全部上传，其GitHub digest / 大小与本地一致，更新清单与包同时发布。

真实打包Electron22 / electron-updater5.3从公开GitHub发现新版本、HTTPS下载、库SHA512和独立SHA256 / 大小核对通过，15次有效下载进度。`live-final4/report.json`中只有比较版本明确模拟为0.1.0和缓存隔离，实际程序0.1.1；没有执行安装器，不称真实已安装旧版重启升级通过。首轮自有测试传adapter造成库没有网络执行器的失败报告保留，改成正常生产构造后通过，产品包没改。

Git外 `.runtime/windows-updates-20261007/`有发布、上传核验、源码CI、原生和真实下载证据。用户先手动安装一次新版，真正安装重启及旧0.1.0桌面登录后的文件夹 / 模型验收仍独立待办。云端当前8b42d35、API / worker94b26d1 / d56ee747、contract0.19 / chat1.8 / schema18保持。

## Windows 本地文件夹（0.1.0已发布）

用户要求 Windows 电脑版并试用本地目录。分支 `feature/windows-local-folder` 基于 main `eb18b6fb498975f94540ec6771705beacee3c2d3`，客户端版本独立为 `0.1.0`。安装包及免安装程序保存在 Git 外 `D:/deepseek-agent/PersonalAgent-Windows/0.1.0/`；[试用、开发与边界](development/windows-local-folder.md)。本批没有修改共享 API / contract0.19 / chat1.8 / schema18，没有迁移。

固定实现 `8b42d35a9e47b5159bfd19e5ce4155508d53f7e0` 已推送，[PR10](https://github.com/luoyan96/personal-agent/pull/10)已创建；文档HEAD31995a5的[三平台CI37560573547](https://github.com/luoyan96/personal-agent/actions/runs/37560573547)全部通过（Ubuntu22.19 / 24、Windows24）。2026-10-07 **10:24:26北京时间**，用户恢复原阿里云登录后，固定SHA静态包41735965字节、SHA256 `2698a4defe5a89a625f5718119d4f822d2bed6ba29ee07a9f16bc00947477e48`经Workbench上传、校验和守卫助手发布；公网首页精确SHA256 `3a43637be852292eb7152c67e5208cfd029d73a1a40602ea854bd52b953e6cd1`。源码及四SDK资源哈希符合准备包，八服务运行、API healthy、HTTPS ready0.19、八镜像及后端current不变。Git外 `static-release/deployment-verified.json` 为真实终端收据，`github-ci.json`保留检查结果。

- 新增原生目录选择、相对文件列表、真实文字预览、选择与正式任务输入；一次合并 Markdown 附件走现有 SDK / 文件阅读 API。支持文字、代码、文字PDF / DOCX；最多10文件、52000 JSON传输字节，明确范围与超限，不自动裁剪，不写回目录。
- 主进程授权只接受成功连接服务的主 frame；拒绝任意路径、junction与变动文件，取消 / 导航撤销。PDF / DOCX在独立有界utilityProcess解析。最终真实Electron22 / Node16主IPC五项通过，PDF第二页和DOCX真实正文读出；Node专项4组与两类类型检查通过，NSIS安装包和启动smoke生成通过。原生SDK DLL保持原hash，四Web SDK资源检查通过。
- 前端12个必要场景分阶段通过，其bridge / SDK / API / model均合成。最终已打包完整React联调另两项通过：真实preload读取第二页和DOCX、原生临时附件回读与API正文完全一致，仅OSdialog / SDK / API / model为替身；SDK与API各一次。正常网络的真实桌面HTTPS登录入口成功，未登录或提交用户资料。用户免安装程序已启动；Windows操作工具新增应用审批超时，没有控制用户窗口。未称桌面模型/IM全流程通过。
- **已上线**：当前Nginx root为 `/opt/research-openim/client-releases/8b42d35a9e47b5159bfd19e5ce4155508d53f7e0/clients/openim/dist`，API / worker仍94b26d1 / d56ee747。静态回退只恢复 `/opt/research-openim/ops/windows-local-folder-8b42d35a9e47-20261007T022425Z/research-openim-production`、nginx -t / reload并核对622e的旧首页9f2591及健康，不恢复数据库或更换API镜像。没有新增SSH / Key / 端口。本机真实用户客户端尚在登录页，已请用户在桌面登录，真实桌面模型 / IM文件全流程仍待验。

## 最新补发：旧消息停留与阅读全文验收（22:01:49北京时间）

固定客户端 `622e84bff20af8cefdd6d9004286da6ba6ba4a22` 已于2026-10-06 22:01:49静态上线；[PR8](https://github.com/luoyan96/personal-agent/pull/8)已合入main（288b56f），[三平台完整CI](https://github.com/luoyan96/personal-agent/actions/runs/37474793438)全部通过。发布标签 `personal-agent-2026-10-06.4` 指向这份源码；API / worker仍94b26d1、镜像d56ee747、contract0.19 / chat1.8 / schema18，没有迁移。

- 查看历史后明确暂停自动跟随；消息由短加载行变成长正文、模型增量、canonical回执或尺寸变化不能仅因列表几何到底重启。Virtuoso followOutput为真正false；初始会话、同身份本人发送、显式End或真实向下滚到底才恢复。阅读全文成功ACK只向原会话 / 身份 / generation发跟随事件，迟响应不跨账号或页面生效。
- 当前Nginx root `/opt/research-openim/client-releases/622e84bff20af8cefdd6d9004286da6ba6ba4a22/clients/openim/dist`；精确公网index SHA256 `9f2591fb39dcf489669c693202d1006c926c24ac72df824cb142bf092ba99742`，八服务运行、API healthy、HTTPS ready0.19；八镜像与backend current全部保持。静态恢复只将Nginx副本 `/opt/research-openim/ops/history-scroll-622e84bff20a-20261006T140148Z/research-openim-production`复制回现有配置，nginx -t并reload后核对8c5f14c的e4ccf4c首页、健康和八镜像；不恢复数据库或切后端。原21:25补发记录仍保留各自基线。
- types / Web / 四固定SDK资源通过；7个必要production React / HashRouter / QueryChat / Virtuoso场景通过（6+1两次窄运行），API / SDK / model均合成，pageerror0 / unexpectedAPI0。旧源码本地合成场景未复现，不称失败门禁；真实Edge旧跳回观察为原故障证据。两个harness启动失败以及库警告保留。
- 线上确认浏览器加载精确新脚本index-0cce9eaf.js。旧IDE部分回执保持原142字范围；用可见“继续阅读全文”键盘Enter触发真实新请求，精确复用既有解析源而未重传文件。新轮成功使用全部5页 / 29415字符，partial=false，实际9127输入 / 446输出 / 3573ms，outbox sent。刷新后新canonical回复1份、编辑器空白；完整阅读入口和实际模型 / IM路径闭合。
- 先前自动化click几次未形成新turn、位置改变，不能单凭这些操作归因window focus；没有把未提交点击计通过。厂商上传Session过期一次，刷新同权限Workbench后同包上传、hash守卫及激活成功，无新增SSH / Key / 端口。维护连接已按本批收尾关闭，用户聊天保留。
- Git外 `.runtime/document-followup-20261006/history-scroll/summary.json`及两个render报告；`history-release/{bundle-receipt,deployment-online-1,source-review,upload-session-failure,live-button-final}.json`与真实新回复截图。用户论文正文、凭据和运行资料未入Git。扫描OCR / 图像 / 版式及超过20非空页、64000预算的全文仍未实现。

## 本日先前发布：文档全文阅读与旧正文继续（已上线）

2026-10-06 **21:02:07北京时间**，全文上下文修复 `94b26d1d4871c45ace12a86f93d4c19cce377c4d` 已成对部署API / worker及客户端；**21:25:34**静态补发客户端 `8c5f14c91f0248c522a52bb4c5eb31f440500f5b`，增加旧解析正文的“继续阅读全文”入口。[PR5](https://github.com/luoyan96/personal-agent/pull/5)与[PR7](https://github.com/luoyan96/personal-agent/pull/7)已合入main，后者软件合并提交2292360。发布标签 `personal-agent-2026-10-06.3` 指向受测客户端8c5f14c，其API / 契约 / Harness代码与已部署94b26d1完全相同；文档提交不改变运行软件。contract0.19 / chat1.8 / schema18，无迁移。详见[文档阅读交接](development/document-reading.md)。

- 原问题是4000总预算和旧历史优先挤掉正文；此前GitHub修复尚未部署。这次真实既有IDE论文新追问使用全部5页 / 29415字符，partial=false，实际9252输入 / 671输出 / 5066ms，回复涉及正文方法及实验。不是新上传用户论文，也未读取 / 改变Key或密码。
- 既有已登录Edge个人助理实际上传13页 / 49622字符合成PDF，Linux真实解析、既有模型及OpenIM路径通过。新上传实际13596输入 / 149输出 / 1895ms；新追问实际13582输入 / 80输出 / 2193ms，正确返回第4 / 8 / 13页末尾标记。两次预算均63352 / 90，全部13个文字范围及partial=false；这份合成重复文本不代表论文研究质量评估。三个正式回复outbox均sent；13页追问刷新后canonical回复1份，编辑器空白。
- 新请求以所选正文JSON UTF-8字节数 + 8192保守估算，范围4000–64000 / 90秒；正文优先于旧历史。普通无文件仍4000 / 90；旧回复、旧预算、未知用量与原重试不追溯修改。超限至多选20个非空页并明确部分读取；全文仅可提取文字，扫描OCR / 图像 / 版式未实现。
- “继续阅读全文”发新的明确agentChatMessage，精确引用已解析源messageId，沿自然文字continuous=true，不另传budget、不下载、不重发SDK文件。仅部分成功Agent回复或无输出终态的原human请求显示；完整成功 / pending / 无源旧消息 / 外部Agent隐藏。重新验证本人、direct会话、加入成员与发送权限，账号 / 导航变化栅栏；不确定ACK仅手动同键同body重试。旧SDK取回失败与已有解析回执分别显示，未放宽origin、redirect或cookie策略。截图的通用取回错误没有单独证明实际HTTP302。
- 两次固定源码的GitHub三平台完整CI分别通过：94b26d1的37456957982，以及8c5f14c的37469860577（Ubuntu22.19 / 24、Windows24）。上一批根537项 + 2生产入口和后端23 + 3专项保持；客户端本批types / Web / 四固定SDK资源及9组实际production HashRouter / QueryChat / ChatFooter / CKEditor渲染通过，API / SDK / 解析元数据 / 模型在该9组中均合成。原401 fixture初始化失败和既有Router / Antd警告保留，pageerror0，不称console无错误。
- API / worker实际镜像 `sha256:d56ee747229eeaffec170810b846f1265ca5c2afbffa4d32a95e69e66871017d`；backend current为 `/opt/research-openim/releases/94b26d1d4871c45ace12a86f93d4c19cce377c4d`。最终Nginx root `/opt/research-openim/client-releases/8c5f14c91f0248c522a52bb4c5eb31f440500f5b/clients/openim/dist`；公网index `e4ccf4c4069a7ab1cb5771880cd8b480c9aef09b70a0221470dd0381d322a65d`，八服务运行 / API healthy / HTTPS ready0.19。静态补发期间八镜像及后端current未变。
- 主发布停写78表SQL / 全行hash保持一致，备份 `/srv/research-openim-backups/20261006T130148Z` 的12checksum / 9gzip / 隔离SQLite integrity及18迁移检查通过；完整组件恢复 / 异地备份仍未验。静态补发回退只恢复Nginx副本 `/opt/research-openim/ops/continue-reading-8c5f14c91f02-20261006T132533Z/research-openim-production`及94b前端，API / worker / 数据库保持；主发布恢复2e69688需先栅栏未完轮并保留用量，不能覆盖旧快照。
- 沿用现有Workbench免密SSH；前次断开经刷新恢复。静态上传一次厂商Session过期、对应归档不存在守卫失败，刷新同权限连接后同包上传 / 核验 / 激活成功，失败记录保留。没有新增SSH、端口或Key。Git外证据 `.runtime/document-reading-20261006/release/{prepare-online-1,deployment-online-1,public-online-1,live-document-final}.json`、真实IDE及13页截图；补发 `.runtime/document-followup-20261006/{frontend/summary.json,frontend/render-7214ef96/report.json,release/bundle-receipt.json,release/deployment-online-1.json,release/github-ci.json,release/software-merge.json}`。

## 历史发布：连续 Agent 私聊（已上线）

2026-10-06 **18:16:59北京时间**，用户明确授权发布后，固定源码 `2e696881583842eb0e251d222083bccd925524fe` 已部署客户端、API与worker；contract0.19.0 / chat1.8.0 / schema18，**没有数据库迁移**。连续聊天实现源为1eb9f8d，2e69688另修正Linux测试私钥的0600权限，生产凭据守卫未放宽。PR3及其祖先PR2已合并到main（软件合并提交1d94cf5），后续发布文档不改变运行源码。发布标签 `personal-agent-2026-10-06.2` 指向受测及部署源码。

- Windows24、Ubuntu22.19 / 24的[同一源码完整CI](https://github.com/luoyan96/personal-agent/actions/runs/37446680799)均通过；根CI44文件 / 534项及2生产入口通过，客户端类型 / Web / 四固定SDK资源通过。本地模型 / SDK合成检查仍与以下真实线上验收分开。
- API / worker镜像 `sha256:63915f409f27dd18f1ab14fc8cdd3f5e1cf2da4de16bbda80e620a5a90c37d06`；current及前端root同属 `/opt/research-openim/releases/2e696881583842eb0e251d222083bccd925524fe`，公网index `7df13778196d25cfcb8e37e54015c9254a6edaeae1616184270e7fa8318c1be9`。八服务运行、API healthy / HTTPS ready0.19、其余六组件镜像不变。停写前后78表SQL和全部行hash一致；一致备份 `/srv/research-openim-backups/20261006T101640Z` 的12checksum / 9gzip / 隔离SQLite恢复integrity及18迁移checksums通过。完整组件恢复演练与异地备份未做。
- 真实线上验收使用用户既有已登录Edge个人助理、合成测试文字和既有模型配置，**不是新建隔离测试账号**。没有读取、复制或更改Key / 密码 / 记忆设置，没有新增SSH授权或端口。两条快速输入合为一个真实模型批次并回复；生成中补充使旧轮失效，旧outputMessageId为空，未知用量保留，新轮正常回复；编辑器和发送按钮持续可用。
- 实际界面在final前显示“正在回复 · 尚未结束 M”；最终turn `ae051720-1396-4a5a-b5f5-58ef6edd6a2d` revision9，真实用量输入919 / 输出228 / 2273ms，最终OpenIM outbox为sent。刷新后该canonical回复仅1份、临时气泡0、编辑器空白。附件完成回执修复一并上线。四个成功测试轮均由真实OpenIM投递，未把暂存正文当最终成功。
- 800字及250字长文测试仍有 `BUDGET_EXCEEDED`，实际用量及失败原样保留；随后新的短请求可成功，默认4000 / 90秒不变。原流式locator尝试提前中止的failed报告保留，后续实际AX增量和服务revision另证。当前日志捕获为空不代表所有历史SDK console问题均已解决；不宣称完整Muse、并行独立任务、实时语音或原生App完成。
- Git外完整证据 `D:/deepseek-agent/.runtime/continuous-chat-release-20261006`：`deployment-verified.json`、`public-final.json`、`github-ci.json`、`cloud-turns-final.json`、`live-stream-actual.json`、`live-refresh-proof.json`、`live-chat-final.png`。Linux首轮0644测试失败、prepare的目录权限 / 归档已存在 / CRLF源hash三次失败均保留；最终按固定Git blob hash核验后才激活。回退方法见[ECS记录](deployment/openim-ecs.md)。

### 本地实现与受测范围

原实现提交 `1eb9f8d42e39031442a79c663f400c7facf1dda1`，以0bb8562附件回执修复为基线；下列记录描述本地实现验收。实际发布已升至2e69688 / contract0.19，同一schema18，详见上节及[连续私聊说明](development/continuous-chat.md)。

- 站内个人助理 / 单个Agent文字私聊可以连续发送；每条先持久保存，编辑器不等待模型完成。未开始的短时连发1200ms滑动合并、第一条起最多4秒，同批只有一份预算；正在生成时收到新输入会栅栏并取消旧轮，明确新请求开启独立默认4000 / 90秒预算，旧用量包括未知值保留。
- 聊天区逐步展示实际公开文字delta；最终答复仍须完成权限 / 上下文 / 用量 / 格式检查，并由canonical与OpenIM outbox保存投递。临时回复按真实finalMessageId去重，不用定时打字假装进度。创建Agent / 协作的结构化输出只在完整校验后展示。默认语气简短自然，当前详细要求、档案性格及获准偏好优先。
- 草稿与待发记录在当前本人标签页有界保存，刷新恢复为暂停，手动重试沿原幂等键 / 请求，不自动重发。512KiB UTF-8 / 50项 / 24小时上限，退出或换账号清除；损坏或不可保存时明确提示。普通等待进度移至聊天区，真实失败 / 重试仍可访问。
- 完整根CI44文件 / 534项、另2项生产入口 / B0进程 / 生产fixture排除通过；客户端最终类型 / Web / 四固定SDK资源通过。后端最终12专项及此前233回归通过；总控最新dist实际HTTP / SQLite四项通过，stream revision4到final7，旧输出被挡住，其他账号404。前端实际生产HashRouter / QueryChat / CKEditor与真实HTTP / SQLite的连发、焦点、纠正、去重、失败暂停、刷新恢复、原key重试、320px与实际UI换账号分阶段闭合。
- 以下本地实现验收的模型为合成ModelCall / 本地合成SSE，Harness / CLI实际固定版本运行；IM SDK / 映射与投递明确合成。不是云端厂商质量或OpenIM真实投递验收，不宣称完整Muse、并行独立任务、实时语音或原生手机App。外部Agent仍逐条同意 / 当前文字，不批量外传历史、偏好或附件。
- Git外证据 `D:/deepseek-agent/.runtime/continuous-chat-20261006`：`root-ci-final.log`、`backend-review.json`、`http-b302661a/report.json`、`frontend/summary.json`及最终类型 / 构建日志。首轮根CI仅旧接口50数量断言失败，改51后通过；原fixture / hydration / 重复文本 / 菜单选择器及关闭harness失败均保留。自有测试浏览器 / Vite / API helper已关闭，既有Router / Antd日志和预设网络失败保持，不能称console全零。

## 附件输入区临时回执修复（本批一并上线）

2026-10-06，`fix/file-reading-feedback` 修复输入区附件回执在回复完成后仍常驻的问题。上传 / 取回 / 等待回复及读取失败继续显示；服务确认成功后自动移除临时提示并停止其轮询，阅读页码 / 范围仍由聊天消息展示，未发送草稿保持。没有修改解析、模型预算、契约或数据。

客户端类型检查、Web构建及四固定SDK资源通过；实际React QueryChat / ChatFooter的桌面1280与窄屏320四组场景通过：等待→成功、草稿保持 / 成功轮询停止、聊天详情展开、失败重试不重复IM发送、模型不可用和扫描文件失败保留。API / SDK / 提取 / 模型均合成；pageerror0，既有Router警告和预设503 / 422保留。证据在Git外 `.runtime/file-reading-feedback-20261006/{verification.json,component-857ede49/report.json,client-build.log}`。首轮Vite watcher在并行构建改写dist时EBUSY失败保留，排除生成目录监视后复验。该项纯客户端修复当时未重复共享根CI；PR2随连续私聊一起合入并包含在现已部署的2e69688中。

## 历史批次：Personal Agent 的第一批流程

2026-10-06 11:09:21北京时间，固定后端 / 首版客户端 `787ca2314b24320ae0b90da4db4d1401b209f719` 已发布，契约0.18 / 聊天1.7 / 显式迁移018。11:16:43静态补发 `27c3279f7dc6584ebde905fd821e21f7166e5c74`，偏好 / 提醒回执仅在助理输出显示一次、默认简短并可展开。该批当时后端及八镜像保持787版本；最新部署以上节及下表为准。

- 本人助理或站内 Agent 私聊可以说“记住：回复先给结论”“纠正记忆：回复更详细”“明天上午九点提醒我提交材料”。这类明确管理操作不依赖模型配置；偏好有主题、来源、版本，可纠正 / 撤回。候选学习默认关闭，开启后仅识别有限的明确习惯表达，确认后才用于后续聊天，不代表完整性格 / 行为学习。
- 对本人助理的明确工作请求由模型选择直接答复、复用已有专项 Agent 或必要时创建新角色。专项分支实际保存联系人、专属会话和子请求，回执可打开该会话；父子请求共用原始4000 / 90秒预算，模型不可用或失败明确显示。角色仍仅提供文字能力，不赋予联网、工具、额外数据访问或后台科研执行权限。
- 复杂工作可生成既有计划 / 建群建议，用户确认后建群，真人继续独立接受邀请。当前任务群仅支持同一工作空间；跨空间已接受好友可以私聊，不能直接被自动加入科研任务群。涉及跨空间好友的请求明确说明限制且不伪造任务 / 群。
- “关于我”提供本人记忆、待确认候选、跟进列表、默认时区和安静时段。提醒由后台保存和到期写入，关闭网页也不影响；暂停 / 完成 / 取消有实际版本控制。服务端消息写入、IM发送与设备通知分别记录，不能把写入或队列状态称为设备送达。
- 长期记忆只用于本人站内 Agent 的私聊，相关获准内容会传给本人所配置的模型提供商；不自动传给好友、任务群或接入的外部 Agent 服务。纠正 / 撤回会阻止旧上下文继续生效。
- 根CI42文件 / 521项 + 2生产入口及客户端类型 / Web / 四SDK资源、服务2项通过。本地13组实际生产路由 / HTTP / SQLite界面场景分阶段闭合，ModelCall / SDK合成；后端17专项 + 同空间协作1项为真实worker / HTTP / SQLite、合成模型。原测试类型遗漏、旧0.17断言、契约缓存、Antd与fixture选择器 / 本地429等失败保留，不宣称一次全套浏览器通过。
- 云端独立合成账号12门禁通过：真实HTTPS注册 / 登录、实际SDK开聊、无模型Key的聊天记忆保存、UI手动保存、版本纠正、设置、可见提醒；关闭页面后后台写入一次，实际OpenIM outbox为sent，重开SDK聊天可见，完成提醒后退出。最终客户端3项另通过：只在输出有一次简短回执、详情仍可访问、重新登录看见纠正后的偏好。pageerror0，但OpenIM SDK worker的map(null) console错误保留，原因未定；不能称console无错误。本批不计真实厂商匹配 / 群组织质量、手机推送、云多worker / 重启、原生安装包或超过30条UI游标遍历通过。
- 激活前停写备份12checksum / 9gzip / 隔离SQLite17恢复通过；迁移新增4个人表，73张旧表SQL和全部行hash保持一致。schema18兼容旧业务镜像已离线实际HTTP / SQLite smoke通过，保留用量、聊天、记忆与修订，暂停提醒并栅栏旧流程，不回退覆盖017数据库。详见[ECS恢复记录](deployment/openim-ecs.md)。
- Git外完整证据 `.runtime/personal-agent-20261006`：`root-ci-complete.log`、`root-client-*-compact.log`、`frontend-review/summary.json`、`deployment-verified.json`、`compact-deployment-verified.json`、`cloud-1022cfe0/report.json`、`cloud-compact/report.json`；后端 `.runtime/personal-assistant-20261006/backend-review.json`。合成账号退出并单独清理，真实账号 / Key未读取或修改；未新增SSH授权 / 端口，未推GitHub。

## 历史批次：Agent 联系人、添加与外部接入

2026-10-06 09:33 北京时间，软件 `57d059e5201fc54c53bfcaeaa28765ea34397615` 已发布前端、API / worker及显式迁移017。09:57补发客户端 `aa3c0f13e257c8ac463ee5800cccdea255e6a07b`，修复未登录 / 退出后的登录页空白；后端及八镜像保持57d版本。详见[本轮设计与接入范围](development/agent-contact-experience.md)。

- 通讯录优先显示真实联系人，人与Agent保留稳定身份。添加分为准确用户名 / 名片链接发现、四项资料创建、公开人设导入或外部服务接入。本人Agent创建 / 导入后保存到通讯录并打开专属私聊；IM未就绪重试同一身份，不重复创建。
- 外部服务第一版仅支持公开HTTPS443、完整 `/chat/completions` 地址的兼容文字接口。Key加密、默认本人使用，显式探测；每条消息同意后仅传当前文字。公开人设导入不迁移远端工具 / Key / 记忆。不是任意Agent、MCP或A2A自动接入；真实第三方服务尚未提供凭据做线上探测。
- 桌面输入区直接展示表情 / 图片 / 文件 / 语音；手机窄屏保留加号展开。分享名片仅查看，登录回跳保留名片，不自动添加或发送。模型设置与现有授权记忆保留。
- 共享CI41文件 / 491项 + 2生产入口通过；最终客户端类型 / Web / 四固定SDK资源通过。前端15项组件、6项真实loopback HTTP / SQLite和3项实际生产路由树门禁分段闭合；API / SDK或模型合成范围见报告，不宣称单次完整UI套件或真实外部工具验收。
- 线上实际核验通讯录、添加三入口、名片 / 连接表单、既有SDK私聊与桌面工具。切窄屏时出现其他设备登录提示并退出，原因未定；随后发现公共登录被父路由挡住，已修复 / 补发并实际确认登录、注册、返回入口与八字符 / 自愿邀请码提示。没有提交真实凭据、新联系人、消息、探测或真实录音；本批不计生产手机聊天通过。
- 迁移仅新增绑定表：激活前72个旧表SQL及全部行hash一致，原有数据保留。schema17恢复须用下文兼容镜像保留现有数据库，禁止用旧schema16备份覆盖后续聊天。失败CI、路由harness误把login放父门外、上传过期 / 审批超时、空白截图等记录保留。
- Git外证据：`D:/deepseek-agent/.runtime/agent-experience-20261006/{root-verification,deployment-verified,public-login-deployment-verified,live-ui-proof,live-public-login-proof}.json`，`frontend-review/{summary,route-summary}.json`；后端专项与恢复资料在 `.runtime/agent-integration-20261006`。尚未推GitHub，未新建原生桌面 / 手机安装包。

## 历史批次：文件聊天

2026-10-06，Agent 文件聊天最终软件 `3b18c6883428f2f00bfbd61d8cce51195011b842` 已上线。个人 / 专属 Agent 私聊发送含文字 PDF 或 UTF-8 TXT / Markdown / CSV 后，真实 SDK 成功才开始解析和模型阅读；范围、部分读取与失败明确显示。默认总预算仍为 4000 / 90 秒。旧 SDK 对象网关需要重定向时，可使用“从本机选择阅读”，只重读原附件，不重复 IM 投递。详见[文件聊天交接](development/agent-file-chat.md)。

最终共享 CI 473 项 + 2 生产入口、客户端类型 / Web / 四 SDK 资源通过；原首版两页 PDF 的真实模型失败保留。最终线上合成验收结果：0977381版本真实 SDK 上传936字节合成两页PDF后自动回复成功；最终3b18c68版本沿同一合成附件追问第2页，真实模型回复明确该页提取文字完整并指出tiny sample，当前消息范围第2页0–54与服务记录一致。没有读取、复制或改变真实 Key / 密码，没有新增云测试账号或推 GitHub。

## 代码、线上与数据位置

历史批次：2026-10-05 23:20北京时间，加号菜单前端 `e536e759a71f59f244d740d2bfe25f2e5812bf56` 已静态上线：顶部添加朋友 / 创建 Agent / 发起群聊，输入区图片 / 文件 / 语音展开。API / worker仍为0ea0516，契约0.15 / schema16不变；八服务与精确公网首页通过。本地九组实际组件检查、客户端类型 / Web / 四SDK资源与既有Edge八组入口打开 / 取消检查通过。媒体回调与麦克风拒绝仅本地合成，本批没有重测云文件 / 录音投递。

历史批次：2026-10-05 22:25北京时间，[自然语言创建Agent](development/natural-agent-creation-brief.md)最终软件0ea0516已上线。本人助理中的明确创建请求保存真实联系人与专属私聊，随后当前页面自动打开。原IFRC实际创建“链研直言”、最终精确档案复用 / 自动SDK开聊、连续两轮真实模型回复及历史回执重开同一会话通过。首版自动导航失败和长档案预算问题的原证据保留；最终修复共享代码f966完整CI457 + 2、客户端类型 / Web / 四SDK资源通过。17组局部页面、5组真实QueryChat父子路由 / 合成SDK与10组后端连续预算专项属于本地证据。旧0.14普通响应 / 持久文档严格兼容实测。准确线上如下。

| 项目 | 当前事实 |
| --- | --- |
| 总控集成目录 | `D:/deepseek-agent/research-agent-platform-chat-integration`；操作前用 `git status` 确认目录与已有改动 |
| 分支 | GitHub共同主线为main；每个本地副本用 `git branch --show-current` 和 `git log -1` 读取当前分支 / SHA，不使用其他旧克隆代替 |
| 已上线前端 | `622e84bff20af8cefdd6d9004286da6ba6ba4a22`；公网index SHA256 `9f2591fb39dcf489669c693202d1006c926c24ac72df824cb142bf092ba99742`；后续文档提交不改变软件版本 |
| 已上线 API / worker | `94b26d1d4871c45ace12a86f93d4c19cce377c4d`；镜像 `sha256:d56ee747229eeaffec170810b846f1265ca5c2afbffa4d32a95e69e66871017d`；新附件请求独立有界预算，普通聊天仍4000 / 90秒，历史实际 / 未知用量保留 |
| 新站 | `https://chat.acceptcat.com`，文件 `https://files.chat.acceptcat.com` |
| 新 ECS | 广州 Ubuntu 22.04.5，4 vCPU / 8 GiB / 50 GiB；当前到期日 2026-11-04，未改续费设置 |
| 运行与发布 | `/srv/research-openim`；backend current为 `/opt/research-openim/releases/94b26d1d4871c45ace12a86f93d4c19cce377c4d`；Nginx root `/opt/research-openim/client-releases/622e84bff20af8cefdd6d9004286da6ba6ba4a22/clients/openim/dist` |
| 版本 | 契约0.19.0、聊天1.8.0、IM桥1.0.0、SQLite迁移018；本批无迁移，既有个人设置 / 记忆 / 修订 / 跟进保留 |
| 本批安全恢复 | 静态修复只恢复Nginx副本 `/opt/research-openim/ops/history-scroll-622e84bff20a-20261006T140148Z/research-openim-production`，回8c5f14c / e4ccf4c；后端和数据库保持。主发布回退2e69688需先栅栏未完成轮次并保留用量，不覆盖旧库；见部署记录 |
| 旧站 | `research.acceptcat.com` 独立保留；旧账号 / 模型配置不自动迁移，不在本轮升级范围 |
| GitHub | 主仓库 `https://github.com/luoyan96/personal-agent`，main；PR5 / PR7 / PR8已合并，软件合并288b56f；发布标签 `personal-agent-2026-10-06.4` 指向622e84b（API与94b相同），三平台[CI](https://github.com/luoyan96/personal-agent/actions/runs/37474793438)通过；历史标签和legacy远端保留 |

## 已完成、证据与边界

- 历史加号菜单批次：桌面与320px导航新增同样三项入口，朋友直接进入准确用户名查找，Agent创建表单取消 / 刷新不重新打开，群聊沿用ChooseModal。输入区三张卡片沿既有消息构造 / 发送回调，单按钮可键盘操作，语音面板仅显式录制时申请麦克风。文件选择与异步构造捕获会话世代，换走再回来也不发送旧结果。
- 最终客户端类型 / Web / 四固定SDK资源和本地九组检查通过，API / SDK / 媒体明确合成；pageerror0，Antd / Router弃用和故意旧文件拒绝日志保留。本批无共享代码变化，不重复根CI。原分页fixture错误、嵌套Upload按钮、Windows wasm watcher EBUSY及fixture漏公共Antd / 全局样式的 failed 报告均保留，最终修正后再验。
- 23:20静态上线前后后端current、八个镜像不变，API healthy / HTTPS ready0.15、www-data读index与精确公网首页SHA256 `ad9776effd48d619a731994b8e05dee5e4c7fe8315e0a803b711b4384fd8cdaa`通过。Nginx回退配置 `/opt/research-openim/ops/plus-menus-e536e759a71f-20261005T152030Z/research-openim-production`；本批只恢复旧客户端root并核对旧首页7bcd46、健康与镜像，不回退schema16数据库。没有重启容器、迁移、SSH授权或GitHub推送。
- 既有IFRC的正常Edge登录页面八组菜单检查通过：三个入口、创建取消 / 刷新、实际Agent聊天扩展、语音显示 / 关闭。只打开并取消，无新增联系人 / 群 / 消息、模型调用、云媒体或真实麦克风。刷新后第一轮菜单选择中止保留，等页面就绪重新展开后群窗成功。父目录 `.runtime/plus-menus-20261005` 的bundle / outer / deployment回执、root-verification、`run-e79b8d07-2941-46b1-8aca-8964c3fa8d08/report.json`、`live-ui-proof.json`与`live-plus-menus.png`为本批证据；代理云终端标签已关闭，用户原标签保留。

- 历史自然语言创建批次：明确当前命令仅在本人个人助理内有效；生成四项简洁档案、原子保存本人联系人 / direct / 回执，完全相同本人档案复用。当前有效发送页自动开聊，主动离开 / 换账号取消，历史回执手动打开；创建成功但IM未就绪重试仅打开既有聊天。首版21:45 f847真实创建，自动导航失败；最终22:25 0ea修复Single同tick导航与连续聊天历史预算。生成档案限制60 / 80 / 200 / 80字，服务追加固定能力边界；手动资料上限保持。普通聊天按4000预算选取最多20条完整最近消息，完整保留当前输入、档案与所有获准记忆，过长当前或记忆仍明确拒绝。
- 最终共享CI35文件 / 457项 + 2生产入口、客户端类型 / Web / 四SDK资源通过；后端47原针对项与10新连续预算组、客户端17原组与5父子路由组分别记录。模型和SDK的本地合成检查不能替代真实调用。实际22:26本人助理收到完整四项档案请求，服务回执“已找到你已有的联系人”，未手动点击即自动进入链研直言SDK私聊；22:27 / 22:28两轮真实模型回复，第二轮接上第一轮，历史回执重开同SDK URL且消息保留。沿用正常登录，不读Key或密码，不增云测试账号。
- 最终公网首页精确SHA256 `7bcd46a2153093f56e69503a8c5339f66dca6d4e9409e2865dedd9a8521c76af`，源与API / worker三份变更文件逐hash一致；八服务运行 / API healthy / HTTPS ready，其余六镜像未变，schema16无迁移。更新前一致备份 `/srv/research-openim-backups/20261005T142440Z`：12checksums / 9gzip / 隔离SQLite恢复integrity及16迁移校验通过。回退恢复f847代码、镜像、current与Nginx，保留现有schema16，禁止套用更早015数据库回退。证据在父目录`.runtime/agent-creation-20261005`的`continuous-{bundle-receipt,outer-verified,prepared,deployment-verified}.json`、`live-ui-closure.json`、`live-final-agent-chat.png`及构建 / 局部报告。首版失败、上传会话到期与过早UI断言保留，等待实际就绪后无重复动作即成功。独立导航包未上传 / 激活；未推GitHub，未验新原生客户端或工具执行。

- 2026-10-05 20:34北京时间，三种可添加的科研聊天Agent客户端 `a25ee9b` 已实际静态发布；公网index SHA256 `dcc6cc772661fcd8fe957f2935989abcce2e154a5117c2382990264dad390565`精确核验、HTTPS ready / 契约0.14、八容器运行 / 无OOM且镜像全部不变。后端仍为68d / schema16，没有数据迁移或新SSH。回退配置 `/opt/research-openim/ops/agent-starters-a25ee9bdf160-20261005T123403Z/research-openim-production`；本批仅回退客户端root，无数据库或镜像回退。
- 真实本地后端52 HTTP / SQLite、4合成模型上下文检查，实际客户端16组分段闭合、类型 / Web / 四固定SDK资源通过。三档案本人所有、记忆与发送者模型隔离、取消 / 迟响应 / 未连接 / 复用 / 编辑和桌面 / 320px均有证据。Workbench上传文件页需切回终端的选择器中止和Session到期保留；正常恢复已有连接，无权限扩展。发布helper自身5项归档 / 公网hash守卫检查与云实际回执分开。
- 原IFRC登录页正常刷新恢复后，20:35实际从通讯录添加“文献阅读助手”，真实SDK私聊打开，发送一次自编植物摘要后获得真实模型四点梳理，事实 / 推断 / 资料缺口区分可见；20:36再次打开同SDK会话且历史保留。未读取 / 复制 / 修改真实Key或密码，没有新建测试云账号、自动发送或任务执行。另两角色目前为已上线可选档案及本地验证，未分别做真实模型调用。本批只证明文本聊天角色效果，不证明科研结论准确性或工具执行。
- 本批证据在父目录 `.runtime/agent-starters-20261005`：`deployment-verified.json`、`outer-verified.json`、`live-ui-proof.json`、`live-agent-catalog-added.png`、`live-agent-chat.png`、`root-client-verification.json`、`VERIFICATION.md`、`local-http-KiLmLx/report.json`与`runs/417358bc...`。源候选d18 / 整合a9、说明681 / 整合424；部署源码a25固定后只补本地交接文档，不重发软件或推GitHub。

- 2026-10-05 17:33 北京时间，个人注册 / 联系人 / 自然聊天 / 模型管理的固定软件 `68d0592` 已在新 ECS 上线。源码、API / worker 镜像及精确公网首页对齐，首页 SHA256 `896450e229d810aef3ed8c5747efe5482a50118725aaf17deedb019cff3dc090`。八服务实际运行，其余六镜像未变，HTTPS ready / 契约 0.14.0 / 迁移016核验通过。没有新增 SSH 或推 GitHub。
- 共享 CI 34 文件 / 446 项和 2 项生产入口通过；精确完整客户端类型 / Web 构建 / 四个 SDK 资源通过。前端本地 17 组真实 HTTP / SQLite、10 组组件合成传输和两张最终布局截图通过；固定官方多厂商 loopback wire / usage 23 项通过。真实模型证据与合成检查分开。
- 新站两隔离个人账号完成14个 HTTPS / 真实 SDK 门禁：桌面与320px无邀请码八字符注册、个人空间 / 模型隔离、停用合成 Key 管理、准确用户名申请 / 接受、双向101消息。双方 clientMsgID / sendID / recvID 对齐且 status2；两个注册项引用首次真实运行，未重复注册或增加第三人。pageerror0，console诊断保留；Agent只验收草稿，模型调用由下项另证。
- 两QA已UI退出并审计CLI停用，账号version2，活跃RAP会话 / IM lease均0，合成历史保持，无邀请码使用。窄console诊断确认初始 / 退出后预期401和浏览器不能脚本关闭用户窗口的提示；另有已捕获登录 `null.map` 错误，未影响14项流程但准确来源尚未分类，保留待定位，不声称console零错误。没有因此增加第三账号或反复重跑业务。
- 17:40 / 17:41 使用既有 IFRC 已登录页面，经普通文本入口连续收到两轮自然回复；第二轮接着第一轮的自我介绍改为口语短句。正常气泡、编辑器和折叠协作均可用。未读取、复制或更改其密码 / Key，未注销真实账号，旧实验室模型兼容仍可用。
- 一致备份 `/srv/research-openim-backups/20261005T093246Z`：12 checksums / 9 gzip / 隔离SQLite恢复integrity ok / 迁移15；显式016迁移逐旧表行hash与准确键转换通过，70旧表 / 激活前2281行保持。更早准备快照3136行与激活前差855，仅读两保存副本确认唯一变化为临时 `chat_pages` 2168→1313，其他69表计数相同；旧代码分页快照TTL15分钟清理解释该阶段差，不能把两阶段总数差当作016丢数据。
- 原部署失败与恢复均保留：初次prepare路径白名单拒绝；初次activate即时旧首页hash不匹配，恢复015 / 旧镜像后用守卫恢复旧服务；第二次因release根目录700使www-data不可读，自动完整回退通过。修正仅新release为755，并实际以www-data核对精确index后第三次成功；实际成功helper SHA为 `67067eee5b4f7ad711eb9bc9b93027a4c2a03ce4621921e6e9d77f5e79ae1e1b`，后续本地增加权限门禁的helper未再发布。回退须同时恢复015数据库和旧镜像，不允许只回退代码。
- 最新证据在父目录 `.runtime/personal-chat-20261005`：`closure.json`、`cloud-postverify-cleanup.json`、`deployment-verified.json`、`preparation-and-rollback.json`、`saved-snapshot-counts.json`、`live-natural-ui-proof.json`、`live-natural-chat.png`、`live-model-settings.png`、共享 / 客户端构建日志；线上14项报告在 `cloud-review/runs/dce9b912-4378-4ef4-a688-e582f988748b/report.json`。17:54清理后再verify通过；本机两个已停用QA的临时密码文件已删。注册门禁首报告、测试单次IM登录假定 / 图标定位错误、序列化修正前报告保留。

- 历史 2026-10-05 13:58 发布 AI 回复修复。旧“在吗”失败实际为冗长内部协议耗尽预算；旧模型不可用记录产生在模型启用之前。模型输入改用精简协议、明确列名和稳定身份字典，保留既有 20 条授权消息窗口与所有非空档案、性格、记忆和所选材料；不静默截内容、不提高默认 4000 / 90 秒预算。模型输出仍由服务端严格校验，邀请、建群与运行须明确确认。
- 最终根共享检查 32 文件 / 419 项、生产入口 2 项、构建 / 类型 / 契约 / B0 通过（共享源受测 `1c378f4`；最终 `979b7c1` 只追加客户端与说明）。完整客户端整合类型、精确 Web 构建及四个 SDK 资源通过。真实组件合成传输的输入区专项 6 项、延迟消息滚动专项 12 项通过，不能当成真实模型证明。
- 新站已登录 IFRC 的正常浏览器中，连续发送两条自行编写的短测试语句，真实收到“收到一”和“收到二”。最终 runtime 已包含缓存读写：第一条输入 895 / 输出 21 / 584ms，第二条输入 915 / 输出 299 / 1531ms；各请求总预算仍为 4000 / 90 秒。模型回复通过 canonical 服务和真实 SDK 到达，未产生任务或协作草案。两次均自动定位最新回复，无手动滚动，发送后编辑区 85px、仍可继续输入；最终列表底部距离 0。未读取、复制或更改真实密码、邀请码或 Key，未注销或停用真实账号。
- 修复了发送后状态详情挤塌编辑器，以及自发送和权限正文 / 状态卡异步加载使列表跳回历史的问题。状态摘要留在输入区，详情在弹窗；消息气泡保留当前授权与中文原因。主动向上查看历史时不自动抢回位置，旧会话 / 旧账号滚动事件有守卫。旧失败记录保留，不自动重放原需求。
- 本轮证据在父目录 `.runtime/ai-reply-20261005`：`deployment-verified.json`、`diagnostic-final.json`、`live-closure-ui.json`、`live-verified.json`、`live-final-replies.png`、`ci-cache-final.log`、`client-scroll-{typecheck,build}.log`。前端合成回归在 `.runtime/ai-turn-feedback-review`。初版 a7 首条成功后第二条预算预检失败、输入区塌陷以及滚动故障的原证据保留；初版用量尚未计入缓存，不能当成完整总量证据。

- 历史默认需求入口修复于 2026-10-05 09:58 北京时间上线。真实 SDK 登录 / 连接 / 同步及当前账号一致后自动打开置顶协调会话；已有私聊 / 群聊深链接刷新恢复，主动导航不被轮询抢走，旧账号 / 旧会话迟返回不写回。模板只填空草稿，不自动发送。最终前端独立构建 / 四个 SDK 资源核验通过，整合入口类型检查通过；新站独立合成账号的七项 Edge HTTPS / 真实 SDK 验收通过，pageerror 0，未发送消息或调用模型。320px 编辑 / 发送 / 返回列表及标题不裁切通过。证据在父目录 `.runtime/demand-entry-20261005/{after-report,deployment-verified}.json`、`demand-desktop.png`、`demand-mobile.png`。该历史批次未重跑媒体或根共享 CI，API / 契约 / 数据迁移未变；d7 根 CI 仍是对应后端版本的历史证据。
- 历史注册批次根 CI：固定软件 `d7cbe97` 的 400 项测试及 2 项生产入口测试通过；独立完整客户端类型、3 项 auth 测试和 Web 构建 / 四个 SDK 资源检查通过。
- 注册修复：后端真实本地 HTTP 边界、两个前端真实本地 API 的 18 项浏览器分组和桌面 / 320px 稳定错误布局通过；新站真实 HTTPS 的 7 项注册 / 登录 / 退出校验通过。用户名 / 邀请码仅去首尾空白，非法字符显示中文，密码原值 min8。测试账号已停用、邀请码已撤销、活跃会话为 0。证据：父目录 `.runtime/openim-cloud-20261004/registration-closure.json` 和 `registration-public-min8.png`。
- 新 ECS 的真实 API 权限 15 项、profile Ex 门禁 7 项、API / worker / OpenIM 实际重启恢复 4 项、后端平台 3 退出 7 项有证据。
- 双隔离浏览器平台 5 真实 SDK：13 项核心功能得到文字、文件双向 SHA、合成录音录制 / 取消 / 下载 / 解码 / 播放、拒绝权限、320px 和刷新恢复证据。原完整运行另捕获历史读取就绪异常，原报告仍为 failed；修复后 3 项专项线上回归通过，pageerror / unhandledrejection 为 0。
- 历史 IM / 媒体与注册批次使用独立合成实验室。两名 QA 账号已停用、邀请码已撤销，全部对应会话和 IM lease 为 0，保留任务 / 消息历史；未使用真实 IFRC 邀请码、账号、模型 Key 或真人麦克风。
- 当前提供网页版。原生 Electron 安装包和原生云媒体、语义 mention 106、科研材料指针撤权后的 SDK 展示仍待独立验证。实际字面 `@` 为消息类型 101。
- IFRC 已由负责人配置并启用 `deepseek-flash`；本轮证明短问答与连续消息显示可用。真实需求澄清、分组建议、任务执行 / 科学交付及真实小组收益仍需独立验收。长历史和大量材料仍受总预算限制；当前 UTF-8 输入上界偏保守，不能改成不可靠的字符除法或静默截内容。

## DSH 运行事实

科研 worker 位于新 ECS 的 `research-worker` Docker 容器，按受控请求启动 Harness 子进程，使用官方固定 `@deepseek-ai/dsh-llm` 和 API-key provider 0.2.0-rc.1。当前是受限模型调用组合，模型工具为空；完整 agent-loop、shell / 文件工具、MCP 和十项 Skills 的自主执行未启用。官方固定 TokenUsage 的未缓存输入、缓存读取和缓存写入是独立计数，本轮统一计入输入总量；输出已含 reasoning，不重复加。未知、非法或不一致用量拒绝接受回复。旧 runtime 记录缺少缓存分项，不能回算或作为可靠的旧失败重试剩余预算；本轮 IFRC 旧失败均无可用重试余额，未回填历史。旧环境的真实模型证据不能代替本次新 IFRC 的实际短问答，也不能把短问答当成科研执行验收。细节见[受限 Harness runtime](../integrations/deepseek-harness/runtime/README.md)。

## 凭据和运维交接

- 个人账号现在可直接注册，无需实验室邀请码；准确用户名用于添加联系人。旧 IFRC 首次注册说明仅在本机受控 `.runtime/openim-cloud-20261004/IFRC-首次注册.txt`，不把内容粘贴到聊天、日志、截图或 Git。账号自行设密码，左侧头像菜单的“模型设置”管理个人模型；团队邀请码仅用于自愿加入已有实验室。
- 运行记录在总控父目录 `.runtime/openim-cloud-20261004` 和 `.runtime/openim-client-rebuild/sdk-media`。源码仓库不收录密码、邀请码、token、真实资料或录音。
- 最新更新前一致备份：`/srv/research-openim-backups/20261006T101640Z`；12checksum / 9gzip完整流通过，隔离SQLite恢复integrity ok及18迁移checksums通过。完整组件恢复演练与异地备份未做。保留当前schema18；禁止用17或更早备份覆盖更新后的聊天与个人记录，恢复方法见[ECS记录](deployment/openim-ecs.md)。
- 历史默认需求入口静态发布保留原 d7 / b404 前端及 Nginx 回退配置；最终备份 `/opt/research-openim/ops/demand-entry-20261005T015857Z/research-openim-production`。需求验收账号已审计停用、邀请码撤销，活跃 RAP 会话及 IM lease 均为 0，合成历史保留。完整回执 `.runtime/demand-entry-20261005/closure.json`；没有读取或改动真实账号 / 模型 Key。
- 两域证书实际换发至 2027-01-02 UTC，webroot 自动续期 dry-run 和 deploy hook 通过，timer 已启用。
- 上批临时 SSH 公钥已撤销，独立新连接明确拒绝，本地专用密钥已删；不得继续假定该 key 可用。可用用户已有阿里云 Workbench 连接进行已授权维护。
- 每次 Compose 操作包含 `compose.yaml`、`compose.production.yaml` 及服务器私有 `compose.production-images.yaml`；MinIO 使用已核验的官方源码自建镜像。禁止 `down -v` 或清空旧站 / 活跃卷。

## 当前工作与后续优先级

当前客户端622e84b、API及worker94b26d1 / contract0.19 / chat1.8 / schema18已上线，PR5 / PR7 / PR8已合并。真实5页论文与13页合成PDF的全文模型输入及最终IM回复已验证；旧4000轮次失败保留。下一批继续日常聊天可用性、任务组织和长期记忆闭环。

1. 保持自然聊天、创建 / 导入 / 接入和日常可用性。当前普通“想做一件事”仍不自动生成任务群；明确创建Agent时才保存；原文献 / 链研Agent真实聊天和文件阅读证据保留对应软件基线。
2. 按[PA1—PA4路线](roadmap.md)逐批验证个人长期记忆、任务类型 / 难度组织、持久主动跟进和反馈改进。先实现一个跨会话可用的纵向闭环，再扩大能力；用户明确偏好、行为观察和AI推断分别记录，纠正 / 撤回生效。
3. 自动组织复用已有联系人 / 能力，必要时创建或组群；任务 / 承诺 / 交付真实保存，真人实际接受。后台自动推进以已授权范围为依据，具体分级机制待工程设计；模型说已记住 / 已安排不能代替服务回执。
4. 模型设置当前三家固定官方适配器；外部Agent文字服务已另有HTTPS443兼容接口绑定。通义 / 豆包真实Key和第三方Agent真实调用未验收；人设导入不携带工具、Key或私有记忆，当前外部调用只传获准当前文字。
5. 网页先验证业务；Windows复用现有OpenIM Electron工程、接同ECS，独立验原生SDK / 重启恢复 / 消息 / 文件 / 录音 / 托盘通知 / 更新。随后移动SDK及Android / iOS后台 / 推送另验；旧安装包或320网页不能代替新原生客户端完成。
6. 生产手机聊天的其他设备登录中断原因、历史登录 `null.map`诊断、剩余SDK项、异地备份 / 完整恢复和真实小组收益分别处理。aa3只修复已定位的公共login父门空白；不宣称所有登录日志问题均已关闭。

## 后续 AI 更新规则

完成一批后同时更新本文与[追加日志](project-log.md)：写明源码 SHA、实际线上 SHA、做了什么、证据路径、未验证项和下一步。部署失败 / 中止与修复记录保留，不把本地测试、模拟模型或构建成功当成线上验收。共享代码变更执行根 `pnpm run ci`；完整客户端另行 typecheck / build:web 和目标交互浏览器验证。
