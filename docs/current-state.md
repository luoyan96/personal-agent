# 新 AI 接手：当前项目状态

更新日期：2026-10-07（北京时间）。这是快速交接入口；历史报告保留各自受测版本，不能直接当成当前线上状态。

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
- 用户进一步指出最终交付应面向桌面客户端和手机App；随后接受先把网页版流程做好，再复用已有Windows / Electron工程并接移动客户端。手机窄屏网页不算原生App完成；当前优先网页版业务体验，后续桌面与手机原生能力分别验收。
- 用户最新密码要求已上线：最少 8 个字符，无大小写 / 数字 / 符号组合要求，无独立密码最大长度，密码不自动 trim。整体 HTTP / CLI 请求大小限制仍保留。
- 2026-10-05 最新方向：暂缓完善需求编排，先做好人与 Agent 的自然聊天。注册不再强制实验室邀请码；按准确用户名发现人及 Agent，申请同意后私聊。团队邀请码仅作为自愿加入已有实验室的选项。
- 普通个人 / Agent 私聊默认只输入文本并发送；使用本人默认模型，保留真实档案、性格和授权记忆。任务、材料、预算与需求模板收在可选协作中；普通聊天不创建计划、群、任务或执行动作。主标题显示真实 Agent 名称，沿用原协调身份和置顶映射。
- 设置入口改为“模型设置”，每个人管理自己的 DeepSeek / 通义千问 / 豆包配置、加密 Key、启用及默认选择。朋友使用本人 Key 与当前对话记忆，不能读取 Agent 主人的 Key 或私有记忆。既有 IFRC 未选择个人配置时兼容旧模型；明确作个人选择后不静默回退。

## Windows 更新候选（0.1.1已打包）

用户要求检测新版本、提示并点击更新。分支 `feature/windows-updates` 基于main `abed83e792d4f4b8af3881d5aae1cc375db09d83`，只接原生 `electron-updater` 5.3.0与本项目公开GitHub Releases；共享API / 云端UI未改。安装版启动15秒、每6小时及唤醒检查，前台提示；后台结果回到窗口再提示。系统托盘有真实版本及“检查更新”。检测不下载，明确下载后库校验，再由本人“安装并重启”；退出不自动安装，不自动降级或选择预发布版。无renderer安装IPC / 自定URL / 嵌入Token，无TLS、webSecurity或签名检查放宽。

Windows0.1.1安装包86257023字节、SHA256 `d3350cdd7405aec2526ac9e917e65970ad901d3a2c96ba4977621795891572a0`；本机入口 `D:/deepseek-agent/PersonalAgent-Windows/0.1.1/ResearchWeChat_0.1.1.exe`。[更新使用与发布步骤](development/windows-updates.md)。0.1.0须首装一次新版本；免安装目录明确引导安装，不做原地替换。

5组状态 / 故障检查、renderer / Electron类型、NSIS最终构建、实际打包启动smoke、安装包 / app-update.yml / latest.yml / blockmap一致性门禁通过。`native-final3/report.json`真实Electron22 0.1.1正常HTTPS登录及原生未安装保护通过；仅OS提示响应替代，未执行安装。首轮重复publish参数造成builder尝试创建发布器、缺GH_TOKEN失败（无上传），去掉新增重复参数后沿原默认单个 `--publish never` 构建通过；两次开发测试require / dynamic import入口失败保留。

Git外 `.runtime/windows-updates-20261007/`。更新候选尚未发布，真实公开源下载校验与实际安装升级未计完成；用户旧0.1.0桌面登录后的文件夹 / 模型验收仍独立待办。云端当前8b42d35、API / worker94b26d1 / d56ee747、contract0.19 / chat1.8 / schema18保持。

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
