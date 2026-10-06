# 共同开发

主仓库：[luoyan96/personal-agent](https://github.com/luoyan96/personal-agent)。产品目标是微信式 Personal Agent，人与 Agent 共用通讯录，科研是第一个验证场景。贡献可以是代码、方法、真实使用反馈或可公开的失败案例。

## 第一次参与

每个人及其 AI 使用独立克隆或 worktree，不共用正在修改的目录。公开仓库可直接读取；仓库负责人在 GitHub 的 Settings → Collaborators 添加具体协作者后，对方接受邀请即可推送自己的分支。没有写权限时可以 fork 后提交 PR。

```sh
git clone https://github.com/luoyan96/personal-agent.git
cd personal-agent
git switch -c feature/your-task
```

开始前阅读 [AGENTS.md](AGENTS.md)、[当前状态](docs/current-state.md)、[产品规划](docs/product-plan.md)和[路线图](docs/roadmap.md)。当前状态区分本地代码与线上版本，旧日志只证明对应历史批次。把这几个文件和具体任务交给新的 AI 即可接手。

## 一个任务的流程

1. 在任务中写明问题、使用者、负责人和验收方法。
2. 更新本地 `main`，建立短期分支。每人及其 AI 助手使用自己的工作副本。
3. 完成一项可检查的改动，补充必要验证和说明。
4. 提交 Pull Request，描述新行为、验证结果和剩余限制；相关同伴检查后合并。

分支命名使用 `feature/<task>`、`fix/<task>` 或 `docs/<task>`。前后端约定先更新 `packages/contracts`，分别说明谁修改哪些文件。合并前同步 `main`，在自己的分支解决冲突，再复验受影响流程。

```sh
git fetch origin
git merge origin/main
git add <changed-files>
git commit -m "fix: describe the change"
git push -u origin feature/your-task
```

在 GitHub 创建目标为 `main` 的 PR。合并时保留可追踪的提交记录，不强推共享主线。需要撤销已合并改动时用 `git revert` 提交回退；数据库迁移与线上回退另外核对恢复说明，不能只换旧代码。

每天同步任务状态与阻碍，按完整的小改动提交，无需为了每日提交数量制造改动。运行环境部署单独安排。

## 检查

根工程使用 Node.js ≥22.19.0 和 `pnpm@11.21.0`。共享代码 / Skills 改动先执行 `pnpm install --frozen-lockfile`，再执行 `pnpm run ci`。现有 GitHub Actions 在 `main` 推送和 PR 时执行根检查，覆盖构建、类型、契约、合成模型测试和生产入口；真实模型、真实 IM 和线上部署要单独验收。纯文档执行 `pnpm run check:content` 和 `git diff --check` 即可。

正式 OpenIM 客户端在 `clients/openim`，有独立锁文件，使用 `pnpm@10.28.0`。先在根目录构建契约，再进入客户端；不要用根 pnpm 版本重写客户端锁文件。

```sh
# 根目录，pnpm 11.21.0
pnpm --filter @research-agent-platform/contracts build
# clients/openim，pnpm 10.28.0
pnpm install --ignore-workspace --frozen-lockfile
pnpm run typecheck
pnpm run test:service
pnpm run test:auth
pnpm run build:web
```

客户端改动还需验证实际交互和桌面 / 窄屏布局。现有根 Actions 不覆盖完整客户端构建，在 PR 中附上上述客户端检查的真实结果。构建成功不等于原生安装包、真实 SDK 或模型效果通过。

修改单个科研方法时，编辑 `agents/skills/<name>/SKILL.md` 及其参考文件，并在 `evaluations/` 补充对应情境。运行数据只提供可公开、可复现的最小示例。涉及文献、统计或实验的结论必须能够核对来源。

## 变更边界

产品范围与近期任务见[路线图](docs/roadmap.md)。新网页、账号、记忆和调度必须以实际行为验收。需要真实模型或外部服务的测试另行配置，普通代码检查不依赖个人 API key。

每批完成同步 [当前状态](docs/current-state.md)与[项目日志](docs/project-log.md)，写明受测源码、线上源码、证据和剩余事项。生产部署单独安排，GitHub 合并不会自动更新阿里云。首次协作基线标签为 `personal-agent-2026-10-06`；部署使用固定 SHA / 标签，并依据[ECS记录](docs/deployment/openim-ecs.md)保留兼容数据库的回退路径。

仓库不收录真实 API Key、密码、邀请码、聊天 / 记忆数据库、用户材料、录音、运行证据或构建目录。`.env.example` 只放占位示例。沿用上游源码的归属和许可见 [NOTICE.md](NOTICE.md)，不要删去 OpenIM 的来源与许可文件。
