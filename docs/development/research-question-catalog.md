# 科研选题与假设工作流收录

2026-10-16，`acceptcat-3`；`feature/research-question-catalog` 接续PR48 / d8cd9e9。目标是补齐老师与学生开题、项目转向、从初步观察设计检验的讨论流程。只收录公共来源描述，不复制上游Skill正文或脚本进Git，不扩大私人/团队材料授权。

## 两项来源

| 条目 | 固定来源 | 许可与版本 | 可用范围 |
| --- | --- | --- | --- |
| 选题、项目风险与决策路线 | [Anthropic官方目录](https://github.com/anthropics/knowledge-work-plugins/tree/e6b505348c39c6e751a70d52ff407e7b0a6bf676/bio-research/skills/scientific-problem-selection) | Apache-2.0；独立Skill未标版本，Bio Research1.2.0 | 需确认的私人文字流程；9份方法参考，无脚本 |
| 可证伪假设与检验计划 | [K-Dense Writer](https://github.com/K-Dense-AI/claude-scientific-writer/tree/529b9f73ab4b48925027145800d7b49e96ccfd3c/skills/hypothesis-generation) | MIT；Skill2.2 / Writer2.22.0 | 私人文字流程；离线CLI已单独验证，AcceptCat自动执行未接通 |

两项面向不同阶段：选题框架用于澄清价值、资源约束、风险和继续/转向的判断点；假设流程将观察、候选解释、预测、测量和反证条件分开。使用本人已配置的模型，聊天费用沿原服务计算。需要用户提供本次授权的背景、原始观察、已核对证据、检索范围和约束；安装不自动读取整个资料库，也不自动分派学生任务。

联网读取了固定仓库说明、完整文件树、模块/上层/根许可、依赖和当前元数据。审阅时Writer未归档、最后代码推送2026-10-09，Anthropic未归档、推送2026-10-15；Star2481/29764仅是审阅时间点事实，后续由后台更新。读了上游[插件兼容性讨论](https://github.com/K-Dense-AI/claude-scientific-writer/issues/19)及[allowed-tools权限报告与关闭记录](https://github.com/K-Dense-AI/claude-scientific-writer/issues/12)，不把关闭问题当作AcceptCat工具适配或独立科研效果验证。

### 选题框架的具体限制

13原件包含SKILL、9参考、本级及适用上层许可。上层Bio Research插件还连接多种数据源，但选择此Skill不会安装整个插件或连接MCP。部分阶段提出PubMed检索，AcceptCat尚无该连接，应手动提供已核对资料；没有执行检索就不能声称找到文献或证明新颖。上游给出的时间与长期收益是方法建议，不是经过独立验证的产品效果。

上游将基础文章列为Fischbach与Walsh。实际[出版社记录](https://www.sciencedirect.com/science/article/pii/S0092867424003040)与[PubMed](https://pubmed.ncbi.nlm.nih.gov/38608651/)作者为Michael A. Fischbach；目录明确提示这处错误，保存的上游原件不改写。方法文章存在，不证明这份Skill的建议正确或有市场效果。

### 假设流程的具体限制

28原件：SKILL、10方法参考、8模板、8个Python文件和根MIT许可。Windows0.10.5及以上从明确引用识别18份可选文字；旧客户端可能只有10份参考，旧安装需明确更新，不自动扩展。7个CLI为Python3.11+标准库、本地确定性检查；不需要模型Key、图像服务或外部包，不能由当前AcceptCat自动执行。

工具只核对声明、结构和关联关系，不能证明假设正确、证据真实、对照适当、伦理批准或预注册已完成。英语因果词检查能提示合成夸大表述，但相同中文句子未检出，目录明确记录覆盖缺口；不能声称中文因果审查可靠。

## 验证

证据留在Git外 `D:/deepseek-agent/.runtime/community-curation-20261016`。

- 独立下载46个审阅文件并核对Git blob/大小/SHA256；实际ZIP导入的41原件逐项匹配，私人原件存储与完整原包往返通过。Writer固定ZIP9,893,431字节/SHA25671ac931d618219cc1df8764483d3787925da9887f9f2edbdd6210d3661eb5859；Anthropic3,377,557字节/SHA2566c1191d5c96111d1c3759b91afa7e930adf72297b72efb0d5ef8b54639ec9c54。独立版本“未标注”保持，不借上层插件版本伪造Skill版本。
- 8份Python静态解析、导入和调用审阅，无网络/子进程/凭证读取执行。Python3.12.14实际13次合成CLI：原始结构/测量/预测/对照/证据/草稿，误称假设已证实、重复JSON键、竞争预测相同、英语因果夸大、中文漏检、URL输入和拒绝覆盖。输出草稿仍是草稿；0退出码也不能代表科学有效。
- 真实HTTP/SQLite/ChatWorker：两个私人安装/绑定/当前消息调用，完整说明与仅选定两份风险/决策参考或JSON/CSV模板进入提示，保存成功消息及使用回执；其他合成账号源码/使用记录404，默认不公开。回复是预设合成输出，无实际供应商质量或真实师生材料验收。
- 原CLI夹具把非法status的退出码误期望为1，实际按上游malformed规则为2；许可原件路径漏了祖先层级、聊天参考比较误用原包顺序也都保留失败。按实际原件/契约修正夹具，未改上游源码、放宽权限或隐藏未知错误。
- 本机根 `pnpm run ci` 通过：53文件/669项、生产CLI/HTTP两项、B0进程和生产隔离均通过；没有把本机结果计作远端三平台结果。实际React/HTTP/SQLite与原生导入两组检查通过：动态用途/材料/交付和限制、固定来源预览、原文精确匹配、取消不安装；1536×1024卡片与1024×726预览已查看，无横向越界，关闭与确认可达，pageerror为0。首轮截图未滚到新增卡片，保留并补拍实际卡片；Antd/Router既有警告保留。Browser技能未列出，因此用隔离Edge/Playwright验证本地页面；账号、桌面框架、SDK/IPC及已核对公开下载是夹具，不是线上用户或真实模型验收。

## 实际发布与恢复

源码ba4aa090a0484481a0522eb5e5899340734f8ef5，[草稿PR49](https://github.com/luoyan96/personal-agent/pull/49)基于PR48。沿用用户此前维护授权，经现有Edge阿里云Workbench核对实例主机及API/worker镜像，未访问真实用户科研内容。服务器从本仓库固定提交读取公共种子，仅解析数据，验证源码SHA256及导出的两项JSON与受测数据一致；公开描述的传输没有带私人材料或凭证。

2026-10-15T17:22:46Z用既有运营CLI发布；SQLite在线一致性备份/integrity_check通过，备份 `/srv/research-openim-backups/community-review-20261015T172242Z`，旧六项逐值保持，替换前重读防止并发运营改动。首次回执同步仍running，未将其视为完成；随后确认17:22:44.578Z—17:22:50.446Z成功，公共缓存version38，八项/五仓库/二十候选，所有metadata error=null。Anthropic29765、Writer2481 Star为该次事实；下一次2026-10-16T16:00Z。实际公共摘要保存在服务器保护目录 `publication-proof-final.json` 和Git外本机副本，数据库备份仅留服务器。

API/worker保持47c42ac / research-openim-api:community-47c42ac / sha256:b78613b5c6e1f77d07e7af392149744161e25460cb7e4f14b2ec0500e3fda2cc；没有部署、重启或迁移，contract0.25/chat1.12/schema022保持。独立公网ready200/0.25/ok，harness not_verified。若撤回目录条目，经运营CLI恢复备份的公开审阅描述，勿覆盖已产生新业务写入的整库；既有私人安装版本不被自动删改。

本轮不修改前端或桌面版本，不制作0.10.7。Windows0.10.6在“广场→研究设计”刷新即可读取新目录，已有模板导入能力；旧安装仍需明确更新，后台不能自动替用户安装或调用。根检查、远端CI状态、动态界面与实际发布结果另记[当前状态](../current-state.md)和[项目日志](../project-log.md)。实际科研质量、授权检索与执行沙箱仍为后续工作。
