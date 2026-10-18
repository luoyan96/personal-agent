# 三项科研来源上线与候选筛查

acceptcat-3 的2026-10-18任务跨北京时间零点完成，实际发布为 **2026-10-19 00:01**。本批接续已审阅三项，不重复创建来源或改写原件。

## 正式收录

| 来源与作者 | 固定修订、版本与许可 | 当前状态与准备要求 |
| --- | --- | --- |
| [K-Dense Inc.：申请书目标、路线与里程碑](https://github.com/K-Dense-AI/claude-scientific-writer/tree/529b9f73ab4b48925027145800d7b49e96ccfd3c/skills/research-grants) | `529b9f73ab4b48925027145800d7b49e96ccfd3c`；Skill1.3 / Writer2.22.0；MIT | 已上线，用户确认后私装文字Skill；提供本次中国申报指南、研究基础、设备人力和工期。按既有模型计费，不套用海外机构预算规则。 |
| [K-Dense Inc.：科研数据体检与泄漏自查](https://github.com/K-Dense-AI/scientific-agent-skills/tree/a1043ef544e3a100c28e70a736b6cf32554d0677/skills/exploratory-data-analysis) | `a1043ef544e3a100c28e70a736b6cf32554d0677`；Skill1.4；MIT | 已上线说明，needs_connector/installable=false；全包超32MiB且执行未接入。核心CLI需Python3.11+标准库，无模型费；其他格式需另验依赖。提供获准数据、变量字典、观察单位和对象/划分角色。 |
| [Boom5426 / 原作者Yuan1z0825：统计报告与图注自查](https://github.com/Boom5426/Nature-Paper-Skills/tree/6f8eaa07b4ea19fecdc73618cad9a65beb49d542/skills/core/stats-reporting-audit) | `6f8eaa07b4ea19fecdc73618cad9a65beb49d542`；Skill未标版本 / 仓库0.2.0；本Skill Apache-2.0，仓库原创部分MIT | 已上线，用户确认私装文字Skill；准备获准方法、结果、图注、独立单位和当次期刊指南。五份可选参考，无脚本/必需服务，按现有模型计费；不重算统计，不能把“No data were excluded”模板当事实。 |

原生导入、原件/许可、合成调用、跨账号拒绝和界面证据沿用[申请书/数据体检](research-data-grant-catalog.md)、[统计报告](statistics-reporting-catalog.md)的固定版本记录，不冒称本批重跑或真实模型科研效果验收。本批独立联网重新下载三份SKILL和四份许可，7份SHA256与原回执相同；没有复制上游正文进Git。

## 实际运营发布

先读根AGENTS、状态、日志、README、路线图并检查其他任务。共享checkout的release/acceptcat-0.10.16有工作台未提交改动；本批从04dd9ba建独立worktree `D:/deepseek-agent/acceptcat-catalog-20261018` / `docs/catalog-publication-20261018`，未切换共享分支或修改客户端/API/内置Skill。已与桌面任务、acceptcat-2协调；后者维护内置Skill及评估，本批负责发现和目录运营。

既有阿里云Workbench正常免密重连同权限实例；API/worker实际仍为research-openim-api:community-47c42ac，镜像 **sha256:b78613b5c6e1f77d07e7af392149744161e25460cb7e4f14b2ec0500e3fda2cc**。沿[运营CLI](community-catalog-sync.md)导出旧八项、SQLite在线一致备份并校验integrity_check=ok/表数保护，再按ID去重、拒绝不同审阅、替换前重读，写入后完整列表相等且原八项逐项保持。私人安装、资料、凭证和权限不变。

2026-10-18T16:01:08.390262Z写入成功：**11项/7仓库/20待审阅候选**。CLI与零点worker租约并发，初读version64/sync=running；最终读回 **version73/sync=ok/discoveryState=ok/元数据错误0**，同步16:01:06.847Z—16:01:41.594Z，下次2026-10-19T16:00:00Z。原审阅SHA保持，两个新仓库GitHub事实已出现。API/worker running、restart0、OOM=false；未部署、重启、迁移或改变Windows包、公开Release、更新源。现有客户端动态读取，无需因目录更新重装。

0700备份 `/srv/research-openim-backups/community-review-20261018T160104Z` 包含一致SQLite和reviewed-before.json，未把私人数据库下载本机。公共材料及初始/最终回执在服务器 `/root/acceptcat-community-review-20261018`。撤回时用运营CLI恢复旧公共列表并先核对后续运营编辑，不能整库回退丢失新业务历史。

前次upload-command内脚本与当前审阅文件哈希不一致：首传仅接收，未运行；保留失败截图后按当前文件重建传输并增加远端哈希断言。最终publish.py **4cddcc5cf3e49e4f1edc8fddce30b9fb15c2f982f1fccd450a9ed9fe5b952731**、三项JSON **7aebaea44706233eb3e4d4f9721da28a94f092e911921cd8432b9ca720cb2285** 与本地相同后才执行。终端逐字输入超时留下半行，观察后清除并完整粘贴；未把未提交输入计作执行。午夜同步中间状态也保留。

## 新候选审阅：暂不晋级

| 候选 | 固定版本、维护、许可与依赖 | 本次决定 |
| --- | --- | --- |
| [Kalaris Labs / Sayan Chowdhury：citation-verification](https://github.com/KalarisLabs/research-agent-skills/tree/df088027ff233dc511fa74cb7f406b4e87fa438c/skills/citation-verification) | df088027ff233dc511fa74cb7f406b4e87fa438c；Skill1.0/仓库1.1.1；未归档，代码推送2026-10-15。实际LICENSE及Skill为MIT，GitHub NOASSERTION不能代替读许可。单脚本Python3.9+标准库，联网Crossref/OpenAlex/arXiv；仓库开发工具另需Python3.11/PyYAML。 | 不提供可安装目录入口。禁网络/注入合成元数据五例中，不同中文题名/作者被ASCII规范化清空，返回verified；只有DOI、年份差1也verified。须改中文比较、缺字段/服务错误状态，完成服务适配与中文/公共记录验证。 |
| [duvuvan：SART Research Graph Workflow](https://github.com/duvuvan/SART-Research-Skills/tree/e106defa0bda5db91479cc61bd110d5460959dfe) | e106defa0bda5db91479cc61bd110d5460959dfe；2.9.0；未归档，代码推送2026-07-17；MIT。根SKILL联动scripts/references/suite，核心图脚本声明标准库；可选Docling/PyYAML未固定版本。外部评审需另配兼容模型服务及费用。 | 仅初审候选，不加入可安装目录。需要验证依赖闭包、Windows路径、任务写入隔离、材料授权和引用定位；没有执行全套脚本/模型/文档解析器，不称安全或效果验证通过。 |

两个新仓库共12份原文件按Git blob及SHA256校验。Kalaris脚本AST及五组合成函数检查未改源码、没有模型或外网查询：正确英文verified、错误英文题名mismatch；错误中文题名/作者、只有DOI、年份相差1均verified。虚构记录不代表真实论文判定，也不能用上游宣传评测替代中国科研使用验证。

读取原仓库/许可/实际脚本及[Crossref官方API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)、[OpenAlex认证](https://help.openalex.org/api/authentication/)/[费用](https://help.openalex.org/access/pricing/)、[arXiv规范](https://info.arxiv.org/help/api/user-manual.html)。Crossref公开API无需注册；OpenAlex基本调用可无Key、账号有日免费额度，更多调用按方案计费，不承诺无限免费。书目核验需要获准公开查询的BibTeX/DOI，主张核验还需实际全文位置和版本；未建账号或取得Key。SART的可选模型按供应商计费，本批没有实际调用。

复读[Scientific Agent Skills #324](https://github.com/K-Dense-AI/scientific-agent-skills/issues/324)扫描文档过期问题，不把扫描标签当安全保证；[Nature-Paper-Skills #15](https://github.com/Boom5426/Nature-Paper-Skills/issues/15)已not planned，维护者未验证第三方Word工具，不能称自动排版接通。

## 验证与下一步

本批目录定向 **11/11通过**。公网ready200/contract0.25，database-storage-authentication ok、harness仍not_verified；匿名目录401。无共享代码/打包Skill变化，按纯文档门槛检查内容和diff，不重复根全套。不使用生产私人账号做客户端验收。

Git外证据 `D:/deepseek-agent/.runtime/catalog-publication-20261018`：published-source-recheck.json、两份候选proof.json/原件、citation-candidate-proof.json、catalog-tests.log、public-probes.json、transfer-proof.json、首败/最终同步截图及published-summary.png。服务器publish-run.log、publication-proof.json为初始状态，publication-final.json为最终成功。

后续用获准指南/稿件评价文字流程；EDA仍需受控子目录获取与执行隔离；中文引用误判先适配再回归，避免重复推荐。PR50正文边界的后台配套、真实师生科研试点及其他任务不随目录发布自动完成。

文档提交9ceaad3已推送并创建/附上[草稿PR66](https://github.com/luoyan96/personal-agent/pull/66)，base release/acceptcat-0.10.15。213份Markdown/10份Skill及diff检查通过；首次远端Foundation两项运行/一项排队，pr-final.json留证，不当作全通过。仓库标签没有codex/codex-automation，未添加不存在标签。只关闭本批远程shell，阿里云会话与其他任务服务保留。
