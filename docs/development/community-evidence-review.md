# 研究设计自查与报告流程：来源审阅和发布

2026-10-15，`feature/community-evidence-review` 基于 PR45 / 67a9749。接续社区收录任务，并处理同线程前后端、技能质量任务。内置 `agents/skills`、技能正文单一来源、账号和材料权限不变；只向运营目录添加公共中文描述。没有把上游指令、参考、脚本或示例复制进 Git。

## 本轮选用

| 条目 | 固定来源 | 版本 / 许可 | 当前实际范围 |
| --- | --- | --- | --- |
| 研究设计与证据自查 | [K-Dense Writer 子目录](https://github.com/K-Dense-AI/claude-scientific-writer/tree/529b9f73ab4b48925027145800d7b49e96ccfd3c/skills/scientific-critical-thinking) | Skill1.3 / Writer2.22.0 / MIT | 经确认安装为私人文字流程；提供设计、混杂、统计解释与证据缺口的讨论方法 |
| 研究报告流程与来源对齐 | [Research Toolkit](https://github.com/rrrrrredy/research-toolkit/tree/09e9a8c6e74e8a7075d96fc0a2dbdabb6a43925c/plugins/research-toolkit) | 1.1.0 / MIT | 待工具连接；没有安装和调用入口 |

两仓库均未归档，原始 GitHub 元数据、完整树与源码固定到上述 SHA。Writer 更新至10月9日、Toolkit更新至10月14日（审阅时间点事实）；后续热度和日期由既有 worker 独立更新，不能代表质量或自动升级审阅版本。Toolkit 是既有每日发现候选的审阅晋级，未按 Star 排名批量安装。原始说明、维护/问题列表与公开案例被分别阅读，未找到足以证明普遍科研提效的独立使用证据。

### 研究设计与证据自查

面向开题、实验前讨论和组会：提供获准研究问题、对照/分组、变量与测量、分析计划、结果和来源位置；交付优点、关键设计问题、证据缺口及修改建议，区分事实、条件判断与待补资料。不是正式编辑决定，也不执行实验或统计计算。

原件8份（SKILL.md及7份参考）加根MIT许可共9份。对照GitHub树逐一验证Git blob SHA和字节数，缓存固定ZIP SHA256 `71ac931d618219cc1df8764483d3787925da9887f9f2edbdd6210d3661eb5859`；9份独立文件与ZIP一致。真实Electron importer识别版本1.3、7份参考、零脚本/素材；私人原件存储及完整ZIP往返一致。保留8,000文件/100MiB整包限制，未改用超过限制的主 Scientific Agent Skills 仓库。

真实HTTP/SQLite/ChatWorker用虚构课程观察研究走通安装、绑定和调用，完整说明和仅两份所选参考进入提示；预设合成回复落为成功记录。其他账号的源码/使用记录404，默认未公开。此检查验证调用链和隔离，**不是供应商模型的科学分析质量验收**。用户聊天沿用自己的模型与费用；不要求额外Key。可选绘图引用另一个未装Skill和OpenRouter，尚未接入，不发送绘图请求。GRADE/偏倚内容仅为方法参考，不能当作自动评级或临床决策。

### Research Toolkit

从问题/已有报告维护任务范围、来源、研究主张、版本和修订。CLI需Python3.10+标准库；MCP另需固定 `mcp==2.2.0` 和本地进程客户端。检索、写作由宿主Agent承担，外部模型评审另需所选账号/服务与费用。

嵌套 Skill 包装页依赖 `../../SKILL.md`、脚本、参考和文档，当前选择单个子目录的导入不能自动补齐所有依赖，因此禁用安装，而非让用户装一个空壳。静态检查源码的导入、进程、网络、目录写入和评审配置；未运行外部模型/CLI或安装MCP。根脚本和方法参考等90个原件经过Git blob验证，Python静态解析通过。

实际标准库CLI用上游公开的**虚构出货记录**重放Lite：start/save/status、缺失检查提示、未通过检查拒绝完成、完整作者检查交付和路径穿越拒绝共7次调用通过，记录明确 `independent_review=false`、`review_strength=unreviewed`。这是样例记录/回执验证，不是新生成报告或独立评审。Full也不自动等于独立评审；尚未适配AcceptCat任务、材料授权、执行隔离或中文科研报告质量。

## 桌面体验修复

后台新增能力采用真实输入和交付字段生成两块预览：“准备什么”与“文字流程交付/接入后可交付”。详情补齐原来漏掉的输入要求；移除对所有可装Skill一概声称“脚本待接入”的文案，依赖以实际来源为准。待接入保持无安装按钮，私人安装仍须检查固定SHA、预览并确认。

小窗口实际检查发现第二块预览被固定封面高度裁掉，改为自适应高度；单项分类被铺满窗口，改为auto-fill保留正常卡片列宽。没有增加请求、复制来源事实或用预览声称生成成功。Windows版本提高至0.10.4，实际安装包与源提交见current-state；仅源码版本号不代表已打包。

## 验证与证据

Git外证据：`D:/deepseek-agent/.runtime/community-curation-20261015`。

- 根 `pnpm run ci`：53文件/669项、生产CLI/HTTP两项、B0、隔离全部通过；共享契约0.25/chat1.12/schema022保持。全检查通过后仅追加桌面布局/文案/版本和文档，不重复根全套。
- 客户端目录/能力12项和类型检查通过，固定子目录9原件真实导入/取消零安装；两个动态条目详情、依赖状态/按钮、分类筛选、1536×1024和1024×726无水平溢出/预览裁切，pageerror0，框架错误覆盖层0。
- Browser插件/skill未提供；界面使用随环境提供的Playwright与隔离Edge、生产React、真实HTTP/SQLite、原生handler；账号、窗口/IPC及下载ZIP为公开固定原包夹具。没有读取真实用户科研数据或以此冒充现装账号验收。最终截图已查看。
- 保留首次GBK读取失败、公开源码下载超时、旧关键字数量断言失败、错误分类定位、预览裁切失败及机器重启导致进程异常。按实际编码/缓存重试/语义定位/布局修复，未降低门槛；初次构建不当作最后布局的包。

## 线上公共目录

沿用既有运营者CLI发布，不升级或重启API/worker、不迁移数据库。镜像仍 `research-openim-api:community-47c42ac` / `sha256:b78613b5c6e1f77d07e7af392149744161e25460cb7e4f14b2ec0500e3fda2cc`。通过现有阿里云维护会话，核对实际生产实例和镜像后，先SQLite一致性备份并验证integrity_check，再导出原目录、重读检查并追加两项，原四项逐项保持。

备份在服务器 `/srv/research-openim-backups/community-review-20261015T012748Z`，含 `platform.sqlite` 和 `reviewed-before.json`，0700目录；无私人数据库/凭证下载到本机。公共传输校验：publish.py SHA256 `4b3706eaaca6c764e8436b574a1f311c35245db6cae43d69a8538a7fb3d41ffc`，new-reviewed.json `4f684f5a7a1b40f79c5861ac68e9933625cd512d37e818e76f5fbfa901148eaf`，服务器一致。脚本与公共回执保留在 `/root/acceptcat-community-review-20261015`。

实际发布01:27:51Z，后台同步01:27:50.071Z—01:27:55.314Z最终成功：缓存version22、**六项/四仓库/十八候选**，metadata error全null；Writer2475、Toolkit230 Star（只表示该时刻事实），下一次2026-10-15T16:00Z。API healthy/worker running。0.10.3现有客户端已能读取新增目录；0.10.4增加输入/交付预览。已安装私人Skill不被更新、扩大权限或改绑资料。恢复时用运营CLI应用备份的公共目录，不能整库回滚而丢失发布后新产生的用户数据。

后续：Toolkit需要独立受控执行适配及授权知识来源；研究设计自查需用获准师生真实案例评价中文建议的准确性。保留公共、团队、私人范围，未改模型凭证、依赖、内置Skill正文、公开Release或更新源。
