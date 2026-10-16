# 数据体检与申请书结构来源审阅

2026-10-17，`acceptcat-3`；`feature/research-data-catalog` 接续技能库修复PR50 / 33e3aac。没有覆盖前批解析器修复或复制上游Skill正文，`agents/skills`仍是内置十项唯一来源。本轮选少量明确用途的来源，分别记录文字可用与工具待接入，不以Star或作者扫描标签推定质量。

## 收录范围

| 条目 | 固定来源及作者 | 许可/版本 | 状态 |
| --- | --- | --- | --- |
| 申请书目标、路线与里程碑 | [K-Dense Inc. / Writer](https://github.com/K-Dense-AI/claude-scientific-writer/tree/529b9f73ab4b48925027145800d7b49e96ccfd3c/skills/research-grants) | MIT；Skill1.3 / Writer2.22.0 | 需用户确认的私人文字流程；17原件、15参考/模板、无脚本 |
| 科研数据体检与泄漏自查 | [K-Dense Inc. / Scientific Agent Skills](https://github.com/K-Dense-AI/scientific-agent-skills/tree/a1043ef544e3a100c28e70a736b6cf32554d0677/skills/exploratory-data-analysis) | MIT；Skill1.4 | 待接入，不提供安装/调用入口；13个Python文件与6参考、1模板 |

申请书流程帮助整理目标、可行性缺口、路线、里程碑和预算说明提纲；须提供本次实际指南、研究基础、设备/人力/工期及待讨论草稿。仅按当前配置的聊天模型计费，不自动联网、绘图或提交。原参考以NSF/NIH/DOE/DARPA/NSTC为主，没有国家自然科学基金当年指南。上游正文把NIH模块预算步长误写为$250K；[NIH官方页面](https://grants.nih.gov/grants-process/write-application/advice-on-application-sections/develop-your-budget)明确为$25,000模块且有适用条件，不能直接套金额、页数或期限。目录提示错误，保留上游原件；没有把结构建议当合规核验、资助预测或申报完成。

数据体检适合建模/组会前核对CSV/TSV/严格JSON的结构、缺失码、异常值影响与对象跨数据划分重叠。必须提供获准本地目录、变量字典、观察单位、重复测量、分组/对象/时间/划分角色；核心工具需Python3.11+标准库，无模型、服务或Key要求。NumPy/HDF5/序列/图片元数据需可选依赖与更具体验证，本轮未安装；Excel及许多领域格式仅参考。不能自动删异常、插补或从EDA作因果结论；默认token是化名，不是匿名化，汇总输出仍可能敏感。

## 来源、维护与实际阻碍

联网读取原仓库元数据、固定提交树、原始文件、许可与依赖说明。审阅时Scientific Agent Skills未归档，代码推送2026-10-15，固定HEAD为a1043ef544e3a100c28e70a736b6cf32554d0677；Writer使用前次已核对的529b9f73固定包，再独立联网核对该Skill及许可，不把它称为最新上游HEAD。Star是读取时的动态事实，由后端同步，不写成质量或用户数量证明。

[上游#324](https://github.com/K-Dense-AI/scientific-agent-skills/issues/324)报告安全triage文档与较新扫描不一致；它不是本轮EDA被证明有漏洞，也不证明扫描安全。Writer[兼容性讨论#19](https://github.com/K-Dense-AI/claude-scientific-writer/issues/19)不等于AcceptCat工具已经接通。

Scientific Agent Skills固定整个ZIP实际下载在 **33,554,612字节** 时越过桌面32MiB限制并中止，`archive-failure.json`保留；不能缩小目录后偷偷绕过全包检查，因此该来源标为needs_connector/installable=false。单个EDA目录可经本机原生解析成1.4/21原件/7文字参考，但这不是GitHub安装成功，也不是脚本已接入。另审阅statistical-analysis2.0后保留为候选：同仓库安装阻碍及科学Python环境未验证，不额外加入一个不可用入口。

后续技能/软件任务可做受控子目录获取或明确出处的单技能发行包，仍需原件/许可证、目录/字节/编码校验和用户预览；脚本执行另设任务目录、运行预算和数据授权，不为本次收录放宽现有限额。

## 验证和证据

Git外 `D:/deepseek-agent/.runtime/community-curation-20261017`：

- `source-receipts.json`：50个原始文件经Git blob/字节/SHA256核对，含两个收录来源和统计候选、仓库许可/README/依赖。14个Python文件经AST解析和I/O、可选载入、网络/进程调用静态审阅；不称全面安全审计。
- `eda-cli-proof.json`：Python3.12.14实际18次离线CLI。合成CSV的6行/1缺失/中位数3/均值22及1个对象跨split被正确报告，中文TSV、2行前缀截断、JSON结构、重复键/NaN/非矩形CSV拒绝、Excel仅参考、URL/路径逃逸及覆盖拒绝通过。报告是待补充框架；原始数据和源码SHA保持，标识符/数据金丝雀未输出。无网络或模型请求，不计为AcceptCat工具运行、统计推断或真实数据质量验收。
- `native-proof.json`：申请书17原件与独立原始下载/完整ZIP逐一一致，私人存储往返和异账号拒绝通过。原ZIP9,893,431字节/SHA256 `71ac931d618219cc1df8764483d3787925da9887f9f2edbdd6210d3661eb5859`。实际0.10.6 ASAR中解析器/导入模块在隔离Node夹具下输出与新解析器完全相同，不依赖PR50未发布修复；不是新exe或用户安装验收。首次夹具未给旧模块提供其YAML依赖，保留失败后按包内相同版本依赖恢复。
- `chat-proof.json`：真实HTTP/SQLite/ChatWorker合成私装与本人Agent绑定、完整说明及仅选中的核心结构/目标参考、成功回执和其他账号源码/使用记录404。未选机构规则不在本次参考内容中，正文仍原样存在；合成模型不能证明真实模型不会误套规则，使用前仍须核对本次指南与上游警告。
- `catalog-tests.log`：目录/同步11项，新增10项/6仓库状态与待接入限制；保持GET只读、去重/ETag/失败/并发租约/运营发布权限。
- `root-ci.log`：根CI54文件/676项、生产CLI/HTTP2项、B0及生产隔离通过；没有重复已通过全套。
- `qa-proof.json`：实际React/HTTP/SQLite与原生导入两组流程，1536×1024卡片、1024×726弹窗。申请书固定版本/原文精确预览、17原件/15参考、取消不安装；数据体检明确待接入/32MiB/18例且无安装入口。pageerror0，保留既有Antd/Router/findDOMNode警告。首次截图落在Antd准备动画中，保留原图并按实际opacity=1/动画结束补拍；搜索以Enter提交后核对单项，不把仅填搜索框计作过滤完成。

### 界面检查摘要

Browser插件/技能未列出，沿用已安装Playwright与隔离Edge，未安装新依赖；localhost4786/4787，只含合成账号，桌面框架/SDK/IPC和已核对固定下载为夹具。流程：广场→搜索并提交→卡片详情→私人安装预览/核对原文/取消；数据待接入详情不出现安装按钮。

| 检查 | 结果 |
| --- | --- |
| 页面标题/非空/无Vite overlay | 通过，AcceptCat科研广场 |
| 控制台 | pageerror0，无新增应用错误，已有弃用警告保留 |
| 桌面与窄窗截图/关闭和确认可达 | 通过，1536/1024，无横向越界 |
| 状态和交互 | 通过；待接入无安装入口，预览取消零安装 |

截图Git外 `grants-card-1536.png`、`grants-preview-1024.png`、`eda-card-1536.png`、`eda-detail-1024.png`。未改前端组件或生产数据，未验证真实供应商、真实用户科研效果、其他终端或全量可选依赖。

## 发布状态

当前为已完成本地验证的10项目录候选，源码 **839b13112ae1051718c45e307457066d3fa1de51**，[草稿PR51](https://github.com/luoyan96/personal-agent/pull/51)已附任务。阿里云维护会话实际跳转登录页，已保留并请求用户重新登录；没有生产写入、备份、API/worker重启、迁移或安装包变更。现有线上仍沿用上一批八项的发布记录，不能因本地种子增加就称广场已上线。本批远端38934745489最新两Linux成功、Windows运行，未计全通过。隔离4786/4787自建服务按完整命令行核对后已停止，维护登录页再次核对仍未登录，已保留供继续发布。

发布应从固定源码导出仅这两项公开描述，沿既有运营CLI：核对主机与固定镜像、SQLite在线一致性备份、导出旧列表、保留旧八项、替换前重读防并发编辑、应用并核对完整结果、同步新公共仓库事实并记录实际状态。现有0.10.6动态读取可兼容，无需为单纯目录收录制作新安装包；不升级私人Skill、不部署PR50解析器。若登录未恢复，保留已审阅分支和发布材料，不虚构线上成功。
