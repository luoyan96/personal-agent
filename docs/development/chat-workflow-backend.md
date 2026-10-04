# 科研微信业务链条：后端审核修补

2026-10-04。基线 `95c838bf768304bce764701940e51fef204c0330`，独立分支 `feature/chat-workflow-backend`。代码提交 `e171a37686371830b0683bf07223532346484d57`。契约仍为 **0.12.0**、聊天协议 **1.2.0**、数据库迁移 **014**。

## 实际发现与修补

聊天提案原先比对应任务命令少检查业务条件，因此有些必然失败的操作仍会显示可以确认：

- `invite_task` 未检查已有 pending/accepted assignment、邀请自己、明确撤权与邀请次数上限。
- `run_task` 未检查任务执行状态、活跃 execution job、执行次数上限、同任务材料、文本格式/总大小/重复输入、既有 conclusion 绑定与输入所需依赖。

现在 `Collaboration.validateInvitation` 与 `AiService.validateNewRun` 分别供聊天提案和既有命令共用。提案创建、worker 输出发布、ChatAction 可操作投影和确认时均使用实时校验。确认仍在既有事务中重新检查，会话版本、任务版本、成员关系、ACL、capability 和材料版本并未改为缓存授权。

执行预检只读，调用 `runnable(task)`；只有实际执行命令调用 `runnable(task,true)` 绑定依赖 revision。无输入的执行仍按既有命令进入 `waiting_input`，不声称已经执行，不预先绑定依赖。幂等回执继续重查当前权限，未改为重新提交命令或重复创建工作。

## 核实后保留的行为

- 入群只改变群成员关系，不授予任务或材料全文权限；联系人关系、私人 Agent 授权、群成员关系和任务承接各自独立。
- 群读取逐个过滤当前用户不可见的 taskIds，未承接成员可以普通聊天，也可以在空 context 下请求群内已加入的 AI。claim/pending invitation 可读摘要；摘要不足以成为全文 AI 输入。
- 群 AI 的任务或材料输入必须属于该群的权威 taskIds 且当前用户获准读取。跨群任务即使同实验室且本人可读，也不能附到当前群输入。
- 撤销任务权不会撤销群关系。历史资源实时过滤，失去原输入读取权的模型派生消息不返回；普通群聊天继续可用。
- run 的 `succeeded` 表示候选结果。提交候选后任务是 `in_review`；验收须匹配 delivery version、task version 和最新 revision。退回后的修订交付必须再次验收，只有接受该版本才将任务设为 `completed`。

## 验证

使用合成账号、临时 SQLite、合成文本和注入的 `ModelCall`，未使用真实 Key 或科研材料。

- `node node_modules/vitest/vitest.mjs run apps/api/tests/chat.spec.ts apps/api/tests/collaboration.spec.ts apps/api/tests/execution.spec.ts apps/api/tests/reuse.spec.ts`：**4 files / 63 tests 通过**。
- `node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json`：API 构建通过。
- `node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.check.json`：API 与测试类型检查通过。
- `git diff --check`：通过。

新增两项 HTTP/worker 回归场景验证未承接成员聊天、拒绝摘要/私有材料模型输入且不保存失败消息、跨群输入拒绝、任务撤权后的历史资源与派生输出过滤，以及重复邀请、跨任务/重复材料、活跃执行和依赖检查。活跃执行在模型运行期间改变时，既有建议变 stale，确认拒绝，迟到结果不发布且实际 11/12 token usage 保留。扩展既有完整链条测试至退回 revision 1、提交 revision 2、拒绝旧 revision、接受 revision 2 后完成。

开发中新增测试曾因夹具错误失败：空 contactIds 不满足 min1、run HTTP 状态码应为 202、cancel 缺少 reason、变更成功状态应为 accepted。均已修正；最终结果以上述 63 项为准。当前环境的 `pnpm exec vitest` 未找到命令，改用已安装模块的直接 Node 入口，无依赖重装或锁文件修改。

未增加 API、数据库迁移、个人工具执行器、桌面包装或部署。群内任务操作入口由前端使用既有详情页，状态投影由总控整合。本次仅完成后端专项；全 CI 与独立浏览器验收由总控执行，不将合成模型测试表述为真实模型上线验收。
