# Windows 0.10.41：科研同伴与私人交流偏好

2026-10-24，北京时间。负责人要求实际改进Agent的同事感。产品 **5293eba94d2133f8624628084351ad1f06cd7bfe**，[PR100](https://github.com/luoyan96/personal-agent/pull/100)开放，未合并；分支feature/research-colleague从fetch后的main/89c987c新建，普通merge PR99/05ebf3a，保留0.10.40连续规划解析/重试与此前同事聊天、资料和课题组功能。

## 已实现

七个助手分别写明场景判断、相处方式和实际接话示例；任务规划/拆解方法与共用后台规则要求先作有依据的判断并帮下一步，不赞同时给理由/替代办法，不虚构阅读、共同经历或进展。旧0.10.38和0.10.39/40默认档案可复用，用户自改档案不自动覆盖。

本人在自己本地Agent的私聊中明确说“以后和我聊天，先给判断，别总列清单”或“调整你的交流方式：……”才保存该助手的private_agent偏好，不调用模型。沿原版本/幂等/修订/撤回与上下文失效机制，保留旧条目和实际用量；容量不足明确未保存。引用、问题、当次抱怨、群聊/好友Agent和外部服务不获得持久修改权限。公开档案/导出不含偏好，也不跨助手或进入独立任务规划。[完整设计/来源与限制](../development/research-colleague.md)。

公共API字段、contract0.30.0/schema026和依赖锁不变，无迁移；明确指令是原agentChatMessage的新服务行为，复用既有私人记忆管理入口。未引入Distilly运行时、上游模板、采集器或人物素材。

## 实际验证与交付

- 完整根CI **772项/60文件**、2项生产CLI/HTTP、B0及生产边界通过；HTTP/SQLite/worker新增3项集成检查覆盖明确保存/重启/修订/撤回/重复Key/容量，导出/账号/角色隔离与晚到结果。
- 客户端模板/规划/依赖 **32项**与renderer/Electron双类型通过。首轮长输入边界及旧4k/重试预算两项失败；压缩重复规则后保留完整用户输入、方法和原上限通过，未删断言、裁剪内容或提高预算。原失败保留。全量后仅收尾撤回回执措辞与真人名片占位提示，业务逻辑不变。
- 根desktop:win冻结准备、两共享包先构建、客户端安装、生产Web/4SDK、55运行包、NSIS/ASAR4入口与更新清单版本/字节/SHA512/blockmap及更新源检查通过。既有Ant Design指令警告保留，不声称零警告。
- 安装器 **C:/Users/luo/Desktop/AcceptCat_0.10.41.exe**，**87,410,682字节**，SHA256 **ae8f3bc1a60a4dac27b439e25de5ee71202f9b8f19b59b579e304093db618b1e**。桌面副本摘要相同，旧包保留，未代安装/启动。
- Git外证据 **D:/deepseek-agent/.runtime/research-colleague-20261024**保存安装/全量CI、原失败及后续检查、类型、打包、更新清单和delivery.json；[14个语言评价情境](../../evaluations/fixtures/research-colleague.md)尚未实跑真实模型，不能将代码检查称为科研判断/同事感已验收。

## 配套后台实际部署与生效范围

负责人明确回复“现在部署”后，核对线上仍是620bc025、API/worker健康、备份空间充足，再准备完整运维包。**共用后台系统规则及明确交流偏好保存已上线**；桌面规划与新建助手模板随0.10.41使用，已安装的私人Skill版本和用户自定义档案未自动覆盖。本批未重打/代安装客户端，也未重放用户请求或调用真实模型验收交流质量。

Git外原审阅包backend-source-5293eba.tar.gz（39,114字节、d77661ad…）保留。实际上传的 **research-colleague-5293eba-20261024.tar.gz**含守卫、离线检查和备份/回退脚本，**90,412字节**，SHA256 **7afa2e7c9a6b15251bd4c73f75f882a445d7f9760f9e46e6671125c206082b2e**；服务器摘要一致，安全路径及两个bash脚本语法检查通过。以生产620bc025离线构建，4个API源文件及1个canonical拆解方法（源/打包副本两份，共6份叠加），180份基线源/方法、129份编译与32个方法文件/11个方法核对通过，不整树覆盖。候选 **73项/4文件**通过：规划输出5、个人规划8、聊天32、个人助理28，包含本批私人偏好和原邀请/执行权限用例。

北京时间 **2026-10-24 21:02:48—21:03:08**完成排空、停写备份、独立恢复核对与配对切换，deployment.exit=0：

- 产品：`5293eba94d2133f8624628084351ad1f06cd7bfe`。
- 新镜像：`research-openim-api:research-colleague-20261024` / `sha256:367367eab2c7990b38b0453bf07d51a6f1cdc22b890732519573146218a99a4c`。
- 旧镜像：`research-openim-api:planning-reply-20261024` / `sha256:620bc0254aef1ea1b5339c7826d360d07119a89b4ae053686d4f9a00d1e47aec`，保留作同schema回退。
- 运维目录：`/opt/research-openim/ops/research-colleague-20261024`；原Compose链只在末尾增加本批images.yaml。
- 一致备份：`/srv/research-openim-backups/research-colleague-20261024-20261024T130251Z/research.tar.gz`，SHA256 `7715e5dca2f2fef44e60e355a83907c54ff687cec0bf5985261db04d07bf6df4`。私密备份/配置副本只留服务器。
- contract **0.30.0**、schema **026**保持，未运行迁移。103表全行/结构、7原件内容与权限、迁移历史、integrity/外键在恢复副本与启动前核对相同；19个既有配置/密钥输入的内容摘要与权限保持。
- 个人模型/默认值、飞书连接/资料源、集合与目录缓存保持，1个飞书库仍owner_private。独立恢复库ready200/受保护接口401，未创建账号/会话或连接外部服务。
- API/worker均running/restart0，API healthy，运行配置/挂载/网络保持，其他6服务未变。公网ready200/status ok、database/storage/authentication ok，四个受保护接口有效合成参数匿名401。运营种子源文件与编译文件的新旧镜像SHA256另外核对一致。
- GITHUB_CATALOG_SYNC=0，目录enabled=false/state=disabled/nextCheckAt=null，11条目/19候选保持。DSH0.2.1-rc.2/Cordis4.0.5未变，Harness仍not_verified。

回退只撤原Compose链末尾本批images.yaml，排空/停止API与worker后恢复旧620bc025镜像，保留当前schema026和上线后的写入；不得回灌旧数据库快照或退回025。本次未触发回退。deployment-summary.json与deployment-proof.png保留Git外实际回执。

部署前读取head **5b414a76328c097931fd360d0530a5942519bcf1**：Foundation40095005045两个Linux及Windows package40095005063成功；Windows Foundation首轮771通过/1失败，是既有邀请/执行权限用例超过原15000ms。原用例本机按原时限单独复核1通过/31跳过，只重跑原失败job，21:04:00成功。没有改代码/断言/时限，也不认定唯一超时根因；原失败日志保留。该head四项最终均success，此后纯部署文档的新head检查单独看回执。

本批未合并main、公开Release或重指标签；重新读取公开Latest仍[v0.10.37](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.37)（422478602）。PR远端自动检查按实际head回执记录，进行中不算通过。实际安装/界面/真实账号材料模型及双机体验按负责人要求由本人检查；注册超时未定因、飞书本人试点、广场同步关闭与原件在线/10MiB/无TURN边界保持。
