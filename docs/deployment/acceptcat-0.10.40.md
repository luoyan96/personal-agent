# Windows 0.10.40：连续规划结果校验与原消息重试

2026-10-24，北京时间。负责人反馈正常补充已有研究后，规划第二轮只显示笼统失败提示，并要求修复及解释。产品 **b232296fb10e3484959b628aa47c087d5fbf35e6**，[PR99](https://github.com/luoyan96/personal-agent/pull/99)开放，未合并。分支从fetch后的main/89c987c新建，保留已合PR97/96、同事聊天、资料/课题组和构建修复。

## 已知故障与可复现问题

只读核对最近规划状态，16:55一轮草案成功后，16:57出现`INVALID_MODEL_OUTPUT`。旧实现不保存模型正文，也没有校验阶段/路径，因此不能从历史记录还原这次具体错误字段，不能声称已回放原输出。

代码中两处不一致可用合成输入复现：后续上下文传完整Plan，但接收端直接要求strict PlanInput，复制身份、版本或状态字段便被拒绝；提示“Null schedules”，实际校验却要求日程对象。旧失败分支又把多种系统错误写成“继续说明后重新规划”，并以“安排记录”标记，容易让用户以为自己没说清或已建立任务。

## 修改

模型输出schema只包含研究内容，身份、课题组、日程和材料访问字段由服务器处理。兼容旧输入/完整Plan及空日程，不相信复制的owner、confirmed状态、日期或材料ID；原权限、成员/依赖/验收内容、版本和明确确认校验继续执行，不从普通正文猜任务或放过缺失研究字段。已有明确日程保留。

规划写入加入savepoint：后续写入失败时撤回本轮草案变化，用量记录仍保留。新增有界诊断，只保存阶段、返回字符数、错误类别和白名单字段路径；不保存模型正文、JSON/Zod错误里的原值或未知字段名。公共API/contract0.30.0、schema026和依赖锁均未修改，无迁移。

界面使用“系统提示”，区分回复处理失败与保存失败。显式点击“重试这条”才新发请求，使用原消息及前文，保留未发送草稿；不复制当前消息到历史两次、不重放确认创建命令、不自动追加收费调用。兼容旧失败缓存，当前错误不能覆盖后续任务创建回执或其他请求。

## 实际检查

- 完整根CI **769项/60文件**、2项生产CLI/HTTP、B0和生产边界通过；同批API单独13项通过，包括第二轮复制完整Plan、旧日程/权限保留、无任务创建、错误结构与晚期写入失败回滚。
- 客户端 **28项**规划/依赖检查与renderer/Electron双类型通过，包含原话单次上下文、未发草稿、旧缓存、创建命令边界和回执归属。
- 首轮新增HTTP用例把只读conclusionRefs也带入editPlan，夹具被原strict接口拒绝，12通过/1失败；只修正合成夹具的字段投影后13通过。失败记录保留，未放宽公共接口或原断言。
- 根desktop:win完成冻结准备、两共享包先构建再客户端安装、生产Web/4 SDK、55运行包、NSIS/ASAR4入口；更新清单版本、字节数、SHA512/blockmap和公开更新源核对通过。
- 产品head b232296的远端三平台Foundation（40081514626）及Windows package（40081514648）四项均success；部署前文档head a541649的Foundation（40082175060）与Windows package（40082175063）四项也全部success。此后仅同步部署文档，新head自动检查另看回执。内容258 Markdown/11 Skill及diff检查通过。
- 合成评价见[连续规划恢复](../../evaluations/fixtures/planning-reply-recovery.md)。没有追加真实账号/私人材料/模型、产品界面、原生安装/启动或双机体验验收；代码通过不证明真实模型总能返回合法内容或科研质量已验收。

## 本机交付

- 安装器：`C:/Users/luo/Desktop/AcceptCat_0.10.40.exe`
- 大小：**87,408,408字节**
- SHA256：`7bfdc1d4f3b248d379dbdaeea2828851a4ba41b47142929646c869c98ebfc8c7`
- Git外证据：`D:/deepseek-agent/.runtime/planning-reply-validation-20261024`，包含检查、原失败、打包、更新核对和delivery.json；旧安装包保留，未代安装。

## 配套后台实际部署

原Workbench曾因WebSocket失败断开，原ECS控制台标签两次超时；当时没有停止服务，修复包只在本机准备。负责人回复“已连接”后，复核新Workbench、实际旧镜像7fa2e86e和Compose链，上传已准备包并逐字节核对摘要；原中断记录保留，不将当时的准备状态算作已部署。

包 **planning-reply-b232296-20261024.tar.gz**，45,404字节，SHA256 `0cb8aaafaaf7e9ce440772cf3b7a9cb20c1387a01a1ca148c12ae7c9939640d1`。服务器运维目录 **/opt/research-openim/ops/planning-reply-20261024**，以当前生产镜像离线构建，仅叠加execution-worker.ts和新增planning-output.ts，不整树覆盖。127份基线/127份编译、32个Skill文件/11个方法、运营种子及contract/schema守卫通过；候选 **29项/3文件**全部通过（输出解析5、个人规划8、执行16）。没有连接真实模型或使用私人材料作模型验收。

北京时间 **2026-10-24 17:41:50—17:42:10**排空并停止配对API/worker，备份和独立恢复核对后切换成功，deployment.exit=0：

- 产品：`b232296fb10e3484959b628aa47c087d5fbf35e6`。
- 新镜像：`research-openim-api:planning-reply-20261024`，ID `sha256:620bc0254aef1ea1b5339c7826d360d07119a89b4ae053686d4f9a00d1e47aec`。
- 旧镜像：`research-openim-api:agent-conversation-20261024-v2`，ID `sha256:7fa2e86e6f8847e5341b35077b5cc75971af72a53800955af74722b6952ad376`，保留供同schema回退。
- 一致备份：`/srv/research-openim-backups/planning-reply-20261024-20261024T094152Z/research.tar.gz`，SHA256 `48a60650914fc3268ba1c099a431bbb0887b7a189af0ae8c8d93a1a0ff23d802`；私密备份和配置副本只留服务器。
- contract **0.30.0**、schema **026**保持，未运行迁移。103张表全行/结构、7个原件的内容及权限、迁移历史、完整性/外键均通过备份恢复和切换前核对；18个既有配置/密钥输入的哈希/权限不变。
- 独立恢复库HTTP ready200、受保护接口401，未创建账号/会话或连接外部服务；个人Key/默认模型、飞书连接/资料源、集合范围和目录缓存保持，1个飞书库仍owner_private。
- API与worker均running/restart0，API healthy；运行配置/挂载/网络/重启策略保持，其他6服务镜像和状态及静态站点保持。公网ready200/status ok，database/storage/authentication ok；四个受保护路由使用有效合成参数匿名401。
- 两服务GITHUB_CATALOG_SYNC=0，实际目录enabled=false/state=disabled/nextCheckAt=null，11个条目/19个候选保持。DSH0.2.1-rc.2/Cordis4.0.5未变，Harness仍not_verified。

回退使用原Compose链，只移除最后新增的 `planning-reply-20261024/images.yaml` 覆盖，排空/停止API与worker后恢复旧7fa2e86e镜像，保留当前schema026和后续写入；不得用旧备份覆盖上线后的数据，也不得退回025。本次未触发回退。原失败消息/方案保留，未自动重放真实失败请求；新客户端提供“重试这条”。

Git外deployment-summary.json与deployment-proof.png保存实际回执。本次恢复连接批次没有重打包或代安装/启动客户端，没有追加用户体验或真实模型验收。本批未合并main、公开Release或重指标签；重新读取公开Latest仍为[v0.10.37](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.37)（422478602）。飞书本人试点、注册超时未定因和资料在线/10MiB/无TURN等边界保持。
