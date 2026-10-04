# 科研协作 API

## 当前本地版本：联系人与持续记忆

2026-10-04，本地共享契约 **0.12.0**、聊天协议 **1.2.0**、迁移 **014**。统一公开档案、创建专属 Agent、真人/私人 Agent 添加与同意、独立私聊及版本化私有/会话记忆已实现。ChatWorker 按当前授权实际读取档案和记忆，版本改变或撤权后取消过期输出；任务、材料、群成员资格与承接保持各自权限。接线及验证见[联系人接口](../../docs/development/agent-contacts-contract.md)、[后端实施](../../docs/development/agent-contacts-backend.md)和[总控整合](../../docs/development/agent-contacts-brief.md)。

既有规划、执行、结论复用、正式账号、实验室模型设置及科研聊天已经接通。当前新功能的模型检查使用合成 ModelCall，真实网络调用另行验收；本地版本不自动部署，线上版本见[部署记录](../../docs/deployment/ecs.md)。按[运行联调包](../../docs/development/b5a-handoff.md)配置数据库、精确 APP_ORIGIN、API 与 worker；不得用旧 B1 的不可用状态描述当前服务。以下保留 B1 的历史启动和受测记录。

## B1 collaboration API（历史）

从仓库根运行 `pnpm build`、`pnpm db:migrate`、`pnpm db:seed`、`pnpm db:credentials`、`pnpm api:start`。APP_ORIGIN 设置为前端精确来源；完整步骤、合成任务 seed、凭据准备和 API 示例见 [B1 联调包](../../docs/development/b1-handoff.md)。共享契约见 [contracts 0.2.0](../../packages/contracts/README.md)，[B0 架构](../../docs/development/b0-architecture.md)保留设计背景。

已实现健康、身份/会话、手工方案、任务/邀请/认领、开始、文本交付和验收。种子账号必须通过真实密码认证；readiness 503 表示依赖不可用，不回退演示数据。B2–B4 端点仍501，规划请求明确503 MODEL_UNAVAILABLE。

`pnpm check:b1` 使用两个独立服务进程、真实 HTTP 与同一文件 SQLite 验证 A1–A5；`pnpm check:b0` 保留基础检查；根 `pnpm run ci` 同时覆盖前端生产隔离和后端真实进程检查。未接入模型或 Harness，未部署。
