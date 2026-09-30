# Research Agent Platform · 任务与能力匹配平台

我们希望创建一个 AI 原生组织：用户提出要完成的事情，平台把合适的人和 AI 能力组织成可确认的协作方案，持续推进交付，并让获准留存的经验帮助下一次工作。

**长期方向是任务与能力匹配；当前从自己的科研小组入手，先把真实工作管起来。** 论文、项目、知识产权、材料和学生协作是任务场景，不是六套独立应用。初期验证组内有用，再验证相似课题组能否复用及谁愿意付费；跨行业市场和能力生态不预先当作成立。

成员通过统一浏览器入口协作。公共能力共同建设和使用，个人可以保留自己的工具与方法，只按约定交付结果。拟定技术路线仍为 **DeepSeek Harness 运行底座＋科研插件＋团队服务**，真实接入状态单独记录。

## 当前状态（2026-09-30）

**G3 已共同通过，产品第一阶段尚未完成。** 已能找回草案、查看本人待办及授权总览、记录成员承诺和可用时间，并在任务中处理依赖阻塞、安排变更、退出转交、取消撤权、附件与交付版本。

G3 最终受测代码为 `65c6a70c43feca8a04c83b15c7823c8fb4e25839`（含 F3-01 修复），契约 **0.5.0**，回复契约 **1.0.0**。根 CI **206 项**；真实模型浏览器 7 组、失败与恢复 8 组、确定性 UI 3 组及历史协作 50 组通过。详见 [G3 共同复核](docs/development/reports/G3-overall-2026-09-30.md)。尚未合入 main、部署或通过真实小组试用。

| 内容 | 当前能力与边界 |
| --- | --- |
| 网页与团队 API | F3 真实规划/同草案修改、授权查询、公共文本候选及后台运行已接通；保留人类协作 |
| 任务持久化 | 身份/会话、方案与承诺版本、附件引用、交付和验收由服务端保存 |
| 实验室全貌 | 授权全量计数、分页任务、草案历史与人员安排已接通；快照检查后手动刷新变化 |
| 协调与附件 | 已验收交付依赖、阻塞恢复、协商变更、转交、取消撤权及授权附件已验证；其余依赖类型和附件运维边界见 G2 报告 |
| [科研核心](packages/research-core/README.md) | 本地 Project/Artifact 与来源存取；不是多人平台的权威数据库 |
| [十项 Skills](agents/README.md)及[加载包](packages/research-skills/README.md) | 方法资源可构建和加载，不代表十项能力都能实际执行 |
| [Harness 适配](integrations/deepseek-harness/README.md) | 官方固定 0.2.0-rc.1 受限运行组合已安装并真实调用；旧六工具不用于团队 worker |
| 记忆与能力进化 | 任务历史不等于完整长期记忆；权限内结论复用、能力维护仍需交付和验证 |

B3 的启动、迁移、合成账号、接口与恢复规则见 [前端联调包](docs/development/b3-handoff.md)；逐项真实证据及用量见 [B3 阶段报告](docs/development/reports/B3-backend-2026-09-30.md)。根 CI 已覆盖新的 Harness runtime，真实模型专项仍须显式凭据。

## 第一阶段要完成什么

用户说“我有一项工作要安排”，平台帮助明确交付要求、匹配本人/成员/公共能力，确认后产生真实安排。成员接受后用自己的方式工作；系统记录卡点、交付和验收；下次任务只复用有权使用的资料与结论。

入口采用用户已选择的[对话中展开协作单](docs/design/adaptive-responses.md)：创建任务、查看进度、寻找可承接工作按需展示不同组件。实验室总览和任务详情保留，用户无需先搭流程或维护多套看板。

```mermaid
flowchart LR
    A[表达需求] --> B[理解交付与匹配能力]
    B --> C[确认分工与承接]
    C --> D[人和公共智能体执行]
    D --> E[交付与验收]
    E --> F[保留获准的经验]
    F --> B
```

完整目标见[产品规划 v0.4](docs/product-plan.md)。**当前优先读[第一阶段范围](docs/phase-one.md)**，它区分产品 P1、工程 G1 和暂缓功能。任务语义见[分配规则](docs/task-allocation.md)，实际收益见[试点计划](docs/validation-plan.md)，顺序见[路线图](docs/roadmap.md)。完整私人能力托管、公开市场、跨学校调度和学校行政系统不要求在 P1 一次完成。

## 下一批怎样开发

下一批 **B4a/F4a：最小授权结论复用与公共能力人工维护**。用户明确留存结论与来源，在下一项任务中主动选用；私人方法可以继续留在成员自己手里。同时补上本人生成请求找回，减少记链接的负担。范围与验收见 [G4a 计划](docs/development/g4a-scope.md)。

[开发索引](docs/development/README.md)提供分工；[下一批可复制 prompt](docs/development/prompts.md#当前下一批-b4a--f4a)提供停止点。双方从包含 F3-01、G3 报告及本次规划的同一完整交接提交开始，先契约/服务，后前端联调与共同 G4a。

## 本地开始

建议 Node.js 24；要求 Node.js ≥ 22.19，pnpm 11.21.0。先检出交接指定的集成提交；单独 clone main 不保证包含本轮功能。

```sh
pnpm install --frozen-lockfile
pnpm run ci
```

真实 API、迁移、测试账号配置见[B3 联调包](docs/development/b3-handoff.md)，网页启动和环境变量见[前端说明](apps/web/README.md)。测试账号只用于合成验证；真实成员试用需要独立账号、访问边界、备份与运行支持。

```sh
# API 按联调包启动于 3100，APP_ORIGIN 与前端 origin 一致后
pnpm --filter @research-agent/web dev --port 4175
```

根 CI 检查文档、六个 workspace 子包（含 Harness runtime）的构建/类型、共享契约、单测、后端真实进程和前端生产隔离。浏览器回归和需要凭据的真实模型调用单独运行。基础存储演示仍可用 `pnpm demo`，F0 视觉演示为独立 `dev:demo` 模式，两者都不能证明真实 AI 可用。

## 仓库结构与协作

```text
apps/web/                      F2b 网页与浏览器回归
apps/api/                      真实身份、权限、事务与任务 API
packages/contracts/            共享 Schema、路由与合成样例
packages/research-core/        本地科研对象与成果存储基础
packages/research-skills/      Skills 加载与打包
agents/skills/                 十项方法的唯一源文件
integrations/deepseek-harness/ 待联调的运行适配
evaluations/                   方法与效果验证材料
docs/                          规划、设计、开发指令与报告
```

每项工作用独立分支和可审查 PR，采用同一共同基线，不覆盖其他成员的工作目录。代码、方法和公开评测进入 Git；真实研究资料、私人方法、账号凭据和运行记录留在受控环境。提交代码不自动部署。

第一阶段成功取决于成员能独立承接、成果可用、协调与返工负担下降，以及下一次自然需求中的复用；不以任务数量、Agent 数量或 CI 通过代替。付费与跨组需求另行验证。

详见[贡献指南](CONTRIBUTING.md)、[AI 开发约定](AGENTS.md)、[迁移记录](docs/migration.md)和[来源说明](NOTICE.md)。我们使用并扩展 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，这是独立平台项目。
