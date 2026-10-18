# 内置统计 Skill：配对设计审计

日期：2026-10-19。`acceptcat-2` 独立分支 `fix/skill-statistical-design-audit` 基于 `04dd9ba`，Skill/评估源码 **e12690f6676a776ecfc852259bcd13d5475c2021**，工作目录 `D:/deepseek-agent/acceptcat-skill-statistics-20261019`。开工读取根规则、状态、日志、README、路线图、分工及并行任务；主目录正在改工作台，前后端任务另修聊天账号切换，社区任务另管目录运营，本批不修改这些实现。自动化记忆原先缺失，本轮补建。

## 改进与实际执行边界

内置 `statistical-result-analysis` 原要求识别配对/重复设计，但没有明确处理配对键、缺失整对、重复单位和种子伪重复。原评估仅有文字情境，没有可运行的数据审计。现在要求先说明实际独立抽样/分配单位、配对和依赖依据；不按行号或相等行数配对、不把重复种子/折数直接当独立样本数。非参数检验不能修复依赖或选择偏倚。未执行的区间/检验和未保存文件必须明确标出。

单一内容来源仍是 `agents/skills`：Skill 正文和两份本地参考维护输入、流程、交付、依赖、来源及权限边界；新增 `scripts/audit-pairs.mjs`，既有 `copy-skills.mjs` 原样打包，不复制进 API 或客户端。不新增契约、数据库迁移、依赖锁文件或能力权限。公开方法安装不授予私人/团队数据读取权限；报告留在所选材料获准范围，向共同任务提交成果仍需选择共享范围。

脚本仅需 Node.js 22.19+，只读获准的最多 1MiB UTF-8 JSON、向 stdout 输出 JSON，不联网、不写文件、不安装依赖。严格检查输入字段、显式设计声明、重复 JSON 键/单位、null 与缺字段、有限数字及算术溢出。缺失默认停止，明确 `complete-pairs` 才排除整对并记录一基序号；少于两对停止。报告保留输入原始字节 SHA256，不回显单位 ID、原始测量或本机路径。

**AcceptCat 当前聊天端仍只处理文字，不运行该脚本。** 本批没有自动计算、绘图或工具执行接入。聊天可读取方法并提出审计/分析计划，不能冒称已执行脚本、生成文件或检验。脚本的 `descriptive_only` 也不证明用户声明的设计正确：只给 B−A 均值及差值样本 SD，推断始终为 `not_performed`，p 值和置信区间 null，不自动给出显著性、因果或总体推广结论。

方法来源核对了 [NIST 配对观测](https://www.itl.nist.gov/div898/handbook/prc/section3/prc311.htm)的差值与样本 SD 定义、[随机区组设计](https://www.itl.nist.gov/div898/handbook/pri/section3/pri332.htm)的分组原则；本地输入策略属于此窄范围工具约定，不能声称 NIST 验证过本实现。

## 可复现验证

从该 worktree 根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @research-agent-platform/research-skills build
pnpm exec vitest run packages/research-skills/tests/paired-audit.spec.ts packages/research-skills/tests/catalog.spec.ts
node agents/skills/statistical-result-analysis/scripts/audit-pairs.mjs --input evaluations/fixtures/statistical-analysis-paired.json
pnpm run ci
```

全部使用公开方法说明及虚构 specimen 数据，无用户材料、真实模型请求或凭据。真实 CLI 对三对合成数据输出 `pairedN=3`、均值 4、样本 SD 2，无排除，退出 0；打包后的同一脚本在定向测试执行，不只匹配正文。

| 实际检查 | 结果 |
| --- | --- |
| 定向 Skill 检查 | 2 文件 / 28 项通过，其中 CLI 27 项 |
| 默认缺失 | 退出 2、summary null、未声称已经排除，保留未完整对位置 |
| 明确整对排除 | 2 对可用、排除第 1 对、差值均值 5、SD 约 1.4142 |
| 重复/不足单位、数值溢出 | 停止描述汇总，不池化、不伪造 null 数值 |
| 缺设计、同名条件、数值字符串、缺字段、未知字段/版本、重复键、坏 UTF-8、超限文件 | 退出 1，无结果派生 |
| 行重排、条件反转、零离散 | 数值容差内保持/反向；零 SD 仍无显著性结论 |
| 文件与诊断 | 输入逐字节不变、SHA256 一致，不回显 ID 或绝对路径 |
| Skill 格式校验 | `quick_validate.py` 通过 |
| 完整 `pnpm run ci` | 退出0；55文件/703项、生产CLI/HTTP两项、B0及生产隔离全部通过 |
| 最终文档及 diff | 214份Markdown/10技能、`git diff --check`通过 |

首轮定向 28 项中 1 项对重排行均值采用精确相等，因浮点 `3.9999999999999996` 对 `4` 失败；修正数值比较容差后全部通过，没有给产品结果强行四舍五入。初次 Python 格式校验缺 PyYAML，保留错误；仅在 Git 外证据目录用缓存安装 `PyYAML==6.0.3`，通过进程级 PYTHONPATH 后校验通过，不修改项目/系统依赖。依赖安装127包全部缓存复用。

Git 外证据：`D:/deepseek-agent/.runtime/skill-statistical-audit-20261019`，包含真实 `synthetic-audit.json`、定向首败与通过日志、构建、格式校验首败/通过、验证器依赖及完整 CI 日志。`boundary-output-proof.json`及四个场景子目录保留完整/缺失停止/整对排除/重复阻断的实际输出、退出码、未改输入收据，canonical与打包脚本SHA256相同。打包检查覆盖所有十项 canonical Skill 正文与本地参考。

## 发布与后续

仅本地代码、Skill 及评估变更，未制作安装包、部署 API/worker、发布社区目录、Release 或更新源；现装与生产状态沿用原交接，本次没有新线上检查。全套默认 CI 的 Harness 适配构建/类型/缺凭据边界不等同真实模型质量。

接续先审阅/合并本独立分支，协调三条并行分支的状态/日志，勿覆盖工作台改版。后续若实现受控工具执行，需另验脚本调用授权、数据范围与输出回执；真实科研样本的单位/缺失机制、区间和检验方案以及模型建议质量仍需独立评估。此审计不作为完整统计软件或自动推断能力上线。

[草稿 PR68](https://github.com/luoyan96/personal-agent/pull/68) 已推送并附到当前任务，base `release/acceptcat-0.10.15`；首读 `c8289a6` 三项 Foundation 均进行中，证据 `pr-first-read.json`，远端检查不能套用本地通过。后续仅文档提交不改变 Skill 源码 `e12690f`。仓库现有标签无 `codex`/`codex-automation`，未创建新标签。
