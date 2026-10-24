# AcceptCat 新聊天交接 prompt

2026-10-24（北京时间）。协作流程以根目录[CONTRIBUTING.md](../../CONTRIBUTING.md)为准，当前事实以[项目状态](../current-state.md)为准。下方内容可复制到负责人新聊天；外部合作者将本机目录替换为自己的克隆目录，明确本人负责的任务，并按Fork的origin/upstream关系操作。

```text
请接手 AcceptCat 项目，接着处理我随后给出的需求。

工作目录：D:\deepseek-agent\research-agent-platform-chat-integration
主仓库：https://github.com/luoyan96/personal-agent
共同开发基线：主仓库最新 main，已包含聊天、资料/课题组、同组本机资料互传、任务拆解/依赖图、构建修复及PR97/96科研助手交流调整；公开Latest为v0.10.37。

先读取根目录 AGENTS.md，然后读取 CONTRIBUTING.md、docs/current-state.md、docs/project-log.md 最新记录、README.md、docs/roadmap.md 和 docs/development/collaboration-handoff.md。

先核对实际 Git 状态、当前分支、提交和远端；保留已有修改，不执行 hard reset、强推或整文件覆盖。main 已在2026-10-21完成一次性同步，不要重新回到0.10.13或旧协作基线。后续如有其他人提交，以实际远端和交接记录为准，不把本文当成固定最新提交。

产品方向：服务中国教师、科研工作者和实验室团队，优先 Windows 桌面，围绕真实科研任务、师生协作、资料使用和成果审阅持续完善。任务规划和资料 Agent 沿用聊天交互，不随意改回复杂表单向导。

多人合作约定：
1. 我也会继续开发，同事以及以后新增的合作者会同时开发其他功能；每个人使用独立工作目录。
2. 所有新功能从主仓库最新 main 建独立功能分支。合作者优先 Fork：origin 是自己的仓库，upstream 是 luoyan96/personal-agent；先核对远端，不假设 origin 一定是主仓库。
3. 一个分支/PR聚焦一个功能，说明负责人、范围、接口/数据库变化和实际验证情况。共享模块冲突需结合双方意图处理，不能覆盖别人的功能。
4. 完成后推送自己的功能分支，向 luoyan96/personal-agent 的 main 提 PR，由我审阅并决定是否合并。只要求审阅时不要自行合并；我明确要求合并时再整合最新双方改动。
5. 每次新任务获取最新 main 再另开分支，不沿旧功能分支继续堆新需求。
6. 代码合并、安装包制作、公开 Release、后台部署分别记录，不能把其中一项完成说成全部完成。此前同步 main/发布0.10.29的授权已履行，不是以后自动合并或发布的长期授权；按我当前指令推进，不重复询问已明确授权的同一操作。

当前交付事实：
- 最新本机候选0.10.40与PR99（未合并/公开）：从main/89c987c另开fix/planning-reply-validation，产品b232296fb10e3484959b628aa47c087d5fbf35e6，修复完整Plan/精简输入混用及空日程边界，保留权限/明确日期/版本校验；规划失败原子回滚、无正文诊断，界面显式原话重试，兼容旧失败缓存。769项根CI/2生产入口、13 API定向、28客户端、双类型和NSIS通过。桌面C:\Users\luo\Desktop\AcceptCat_0.10.40.exe，87,408,408字节，SHA256 7bfdc1d4f3b248d379dbdaeea2828851a4ba41b47142929646c869c98ebfc8c7，旧包保留，未代安装或真实模型验收。Workbench重新连接后，29项服务器隔离、备份/独立恢复及健康检查通过，配套后台已于2026-10-24 17:42:10上线620bc025（详见下方后台项）；没有自动重放失败请求，不声称原真实返回的具体错误字段已还原。见docs/deployment/acceptcat-0.10.40.md，证据D:/deepseek-agent/.runtime/planning-reply-validation-20261024。
- 本机0.10.39候选与PR97（含PR96）已按本人明确指令合入main：2026-10-24 16:48:58 merge commit a08a63a87ea3cf2e561c20197259bf2a60cafa08，PR96随之自动标记MERGED；受审head6d4df11四项GitHub检查成功，合并树相同，双方作者/历史保持。产品e48852eda15e8512ef59ce3c9ddae1f8c2e1a6a6，七个内置助手、十一个canonical方法和任务全流程统一低负担交流，角色化跟进、旧模板复用/用户编辑保持。桌面C:\Users\luo\Desktop\AcceptCat_0.10.39.exe，87,409,143字节，SHA256 70340836adade67025d5572411389b7c17ef54e23cf256e0bfc016b81f19fa24。762项根CI/2生产入口、71客户端、双类型和NSIS/更新清单通过；保留初稿预算失败并在原上限内压缩规则。日常聊天等后台系统规则已按本人单独授权于16:23:50上线7fa2e86e；桌面界面/规划与模板仍需使用0.10.39候选，尚未公开Release。无接口/数据库/锁变化，未代安装/界面/真实模型验收。见docs/deployment/acceptcat-0.10.39.md、docs/deployment/agent-conversation-20261024.md及docs/development/agent-conversation-flow.md。
- main已按本人指令以merge commit合入PR89、PR91、整合PR94及PR97；PR94提交8dba29fb6715269ff3ef0bee5f26867f5ae3d050包含FANLI-w的PR92与PR93，PR97/a08a63a包含PR96，原PR均自动MERGED，保留同事PR86及双方原作者。公开Latest为v0.10.37，标签固定8dba29f；main后续可有文档提交，开始前仍需fetch实际最新状态。
- 上次公开安装包（桌面仍保留）：C:\Users\luo\Desktop\AcceptCat_0.10.37.exe；公开页：https://github.com/luoyan96/personal-agent/releases/tag/v0.10.37 。87,410,751字节，SHA256 ecc17405bb3bf5e12ee7a28e934668dbce039b05ffbcc6482f3a2ae8d9529225；四附件与未登录更新清单已核对。后续是否仍是最新版须按实际状态确认。
- 同组原件互传：PR91已合main，产品09ffb44的目录授权、聊天索取、WebRTC直传和本机原件打开现已随0.10.37公开；配套contract0.30/schema026保持，本次后台交流规则升级没有迁移或扩大资料权限。双方须在线且切同组，每份10MiB，无TURN/云原件兜底；实际双机与安装体验由本人检查。
- 构建与任务拆解：公开0.10.37产品4c6ea18统一两共享包先构建、link依赖及工具链/成品守卫，并接入任务拆解Skill/依赖图；根desktop:win命令见CONTRIBUTING。762项根CI、36客户端定向、双类型与受审head d4eb38e四项GitHub检查通过。桌面prompt加载新方法；后续11个canonical方法已随2026-10-24后台交流规则升级上线，不覆盖已安装私人版本。未代安装或真实模型验收，NSIS关闭循环未复现。详情见docs/deployment/acceptcat-0.10.37.md及docs/deployment/agent-conversation-20261024.md。
- 原有聊天交互、独立资料页、飞书库打开/明确共享、自助课题组创建/已有账号邀请接受均保持，任务规划和资料Agent继续聊天交互。负责人确认旧附件0.10.35为同事干净构建成功样本，勿列为已确认坏包。
- 已部署后台为contract0.30/schema026、DSH0.2.1-rc.2/Cordis4.0.5，产品b232296，镜像620bc0254aef1ea1b5339c7826d360d07119a89b4ae053686d4f9a00d1e47aec（原7fa2e86e保留作同schema回退）。2026-10-24 17:41:50—17:42:10完成连续规划修复的停写备份/独立恢复及切换，29项Linux隔离检查、103表/7原件及18配置/密钥输入保全、API/worker/公网健康通过，无迁移，其他6服务保持。见docs/deployment/acceptcat-0.10.40.md；上次交流规则/11个方法的114项隔离及原中断记录见docs/deployment/agent-conversation-20261024.md。广场每日同步仍关闭，后续维护保持GITHUB_CATALOG_SYNC=0；回退镜像保留当前数据，不能回灌旧025快照。未用私人资料或真实模型验收交流质量。

尚未完成及边界：
- 他人注册新账号超时根因尚未确认，仍待对方设备的具体错误、安装版本和同机连接信息；不能宣布已修复。
- 课题组已支持同账号创建、已有账号邀请接受、邀请码确认加入、成员查看/普通成员移除退出与多组切换；每人最多负责一组，负责人交接/解散仍需维护者处理，未完成任务发起/审阅职责须先完成或取消。好友/群聊不自动授予课题组权限。
- 飞书应用仍仅罗岩本人试点，安装新版或加入课题组不会自动开放飞书应用、共享私人论文库或其他资料权限。
- 我此前要求功能体验和安装后检查由我自己进行，不要主动展开额外的界面、安装包载荷、原生启动或真实账号验收；后续按我的新指令调整。已执行与未执行的验证必须如实区分，不能用构建成功代替功能验收。
- API Key、App Secret、用户材料、运行数据库、构建产物与验收证据保留Git外，不复制入仓库或交接prompt。

每批完成更新docs/current-state.md并追加docs/project-log.md，记录提交、PR、打包/部署/发布状态与剩余事项。先简要汇报当前基线、已完成、未完成和风险，然后根据我接下来给出的具体需求继续开发，不自行选择其他功能或扩大任务范围。
```
