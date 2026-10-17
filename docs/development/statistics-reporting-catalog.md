# 统计报告与图注自查：社区来源收录

2026-10-18（北京时间），`acceptcat-3`。`feature/statistics-reporting-catalog` 接续 Windows0.10.8 / PR56，目录源码 **03e4d6fa035e651afe8f257283f6cd45deaea0b9**，[草稿PR57](https://github.com/luoyan96/personal-agent/pull/57)已附当前任务。本批只增加一项公开来源说明及目录检查，不改内置十项 Skill、联系人、前端组件或安装器。当前本地目录11项/7仓库，线上仍沿用上批8项/5仓库的发布记录。

## 选用的流程

来源：[Boom5426/Nature-Paper-Skills](https://github.com/Boom5426/Nature-Paper-Skills)，固定提交 **6f8eaa07b4ea19fecdc73618cad9a65beb49d542**，目录 [skills/core/stats-reporting-audit](https://github.com/Boom5426/Nature-Paper-Skills/tree/6f8eaa07b4ea19fecdc73618cad9a65beb49d542/skills/core/stats-reporting-audit)。仓库版本0.2.0，独立Skill没有自报版本，导入器保持 `-`，不把仓库版本伪装成技能版本。实际公开API读取Star591、代码更新2026-10-13、未归档；这是本次读取的事实，显示层以后仍读后台同步缓存，不把Star硬编码进条目或用于证明科研效果。

作者为Boom5426，统计技能注明来自Yuan1z0825/nature-skills的nature-statistics。**本Skill为Apache-2.0，不能因为根LICENSE为MIT就整体标MIT**；已核对SKILL.md、NOTICE、ATTRIBUTION.md和LICENSE-APACHE。原件未改写或复制到本仓库。完整ZIP中保留Apache许可全文与归属说明；现有导入器另外提取根LICENSE/NOTICE，但不单独提取连字符名称LICENSE-APACHE。没有冒称该文件是模型参考或单独列在8个选中原件中，完整原ZIP仍可从私人原件中取回。

### 科研场景与交付

- 投稿或回复审稿前，提供获准的方法/统计分析、结果、图注、独立实验单位与重复说明，以及目标期刊本次指南。
- 输出带原文位置的问题、可替换的统计段落或图注草稿、作者需要补充的事实。重点是样本数、独立/技术重复、误差线、多重比较、方法与研究主张是否一致。
- 五份参考按本次任务选择，不读取整个课题组资料库。无脚本或必需外部服务，只需现有聊天模型，按用户模型计费。
- 不重算p值、功效、样本量或区间，不承诺发现全部错误，也不授予原始数据分析、Word修订排版或绘图工具。上游提到其他技能不是本次自动安装的依赖。

已阅读[Nature Portfolio官方报告规范](https://www.nature.com/nature-portfolio/editorial-policies/reporting-standards)，用于核对上游来源范围；通用参考不能替代目标期刊或学科规则。已阅读[上游Word交付讨论#15](https://github.com/Boom5426/Nature-Paper-Skills/issues/15)，没有据此声称外部DOCX工具已接通。仓库README的合成例子也不作为真实模型评测。

### 明确保留的限制

上游统计段落骨架含 `No data were excluded`。虽然附近要求按事实填写，缺少排除记录时仍容易误用，因此卡片详情特别提示不得直接粘贴；正文和参考保持原件。独立单位、随机化、盲法、排除规则和精确数值缺失时应向作者提问，不用模板填成事实。Nature命名不是期刊背书，更不能作为临床、监管或投稿通过保证。

## 实际检查

证据在Git外 `D:/deepseek-agent/.runtime/community-stats-20261018`。

| 检查 | 实际结果 |
| --- | --- |
| 原始来源 | 15份下载文件经固定Git tree/blob、字节与SHA256核对，包含6份技能文字、许可/归属/版本/README与上游统计示例测试；未执行上游安装器或将其他技能测试冒称本技能质量评估 |
| GitHub完整原包 | 1,796,957字节，SHA256 `85ca396dde40cc4b5b5a6efd04c252b76e56e5de79acccedd6ed727a7fcd2621`，未放宽32MiB/100MiB限制 |
| 原生导入和存储 | 8个选中原件、5份参考、0脚本/0素材逐一比对，私人存储往返、原ZIP取回、跨账号拒绝通过；0.10.8实际ASAR解析器输出与当前解析器完全一致 |
| 实际API/worker | 真实HTTP/SQLite/ChatWorker完成3组合成场景，完整说明与仅选参考进入上下文；私人默认、跨账号源码/使用记录404、跨账号调用403、停用调用403通过 |
| 项目门槛 | 目录定向11项；根CI54文件/676项、构建/类型/契约/内容、生产CLI与HTTP2项、B0和生产隔离通过 |
| 实际界面 | 3组流程：卡片及详情；固定版本原生预览/逐项原文/取消零安装；确认后真实创建1份私人Skill并提交本机原件。1536×1024、1024×726截图已看，操作可达、无横向溢出、pageerror0/无覆盖层 |

API调用场景为涂层研究的嵌套视野、独立装置的图注缺项、仅报告均值差与方向的描述性模型实验。模型供应商用明确合成夹具，只核对真实调用链路和权限，**没有验证真实模型统计审查质量或实际科研结果**。未使用用户私人材料、真实Key或外发联系人消息。

使用已有frontend-testing-debugging流程；Browser插件/技能未提供，采用已安装Playwright与隔离Edge，未新增依赖。路径：科研广场→搜索并提交“统计报告”→详情→准备安装→检查固定版本→选择子目录→核对参考→取消/确认私人安装。桌面框架/SDK/IPC和下载端点是明确夹具，实际React/API/SQLite、原生处理器及已核对原ZIP不替换。控制台保留原有Antd bodyStyle/findDOMNode及Router future警告，没有未解释应用错误。

保留失败：首次API夹具误把跨账号调用拒绝写成404，现有实现实际为403；源码/记录读取仍是404，没有放宽产品权限。首次UI在React异步登录尚未挂载前判断非空，改为等待实际搜索控件可见再断言，没有修改产品或重跑已过全套。证据分别为chat-proof-first.log、qa-first.log和带时间失败记录。

## 发布与安装状态

现有阿里云维护页重新导航到Workbench后**实际跳回登录页**，旧重新登录请求仍待用户完成；未重复询问或尝试绕过登录。无生产写入、数据库备份、容器inspect/重启、迁移、公共Release或自动更新源变动，不能称这项已在用户广场显示。

已把前批待发的申请书结构、数据体检与本项合并为仅三项公共描述的运营发布材料。上传与脚本尚未执行；文件哈希及待上传状态见publication-prepared.json。脚本沿原流程核对主机与固定镜像、SQLite在线一致性备份、保留旧8项、已有相同条目去重/不同审阅拒绝、替换前重读防并发，最后CLI发布/同步/读回。登录恢复后先按实际生产状态核对保护条件；若镜像变化或条目不同，停止检查，不能绕过保护。

这项只需后台运营目录发布，**现有0.10.8已验证可兼容，无需为目录条目重做安装包**。本批未改变桌面版或替用户安装；PR50解析边界配套部署仍为独立待办。上一批PR56源码47060af的三个Foundation平台本轮读回均SUCCESS，不把前批成功当本批远端CI结果。

PR57文档头75ba51a首次读回为两平台运行、一平台排队，尚未计全部通过（pr-final.json）；不为等待CI反复重跑本地全套。4836/4837自建服务按完整Node命令行核对后关闭，PID42304/35864及cleanup.json留证；没有停止其他预览或用户软件。原维护登录页按handoff保留。
