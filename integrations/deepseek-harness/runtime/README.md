# 受限 Harness 服务端运行组合

固定 `@deepseek-ai/dsh-llm` / `@deepseek-ai/dsh-llm-deepseek-api-key` **0.2.0-rc.1**，Cordis **4.0.4**；锁文件记录完整依赖与 integrity。这里属于根 workspace，构建、真实类型检查和无凭据边界测试默认执行。

使用官方 [LlmRuntime 公开接口](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/llm/llm)：Cordis 挂载模型服务及官方 API-key provider，每个任务执行一次有输出/时间上限的流式调用。团队持久队列、授权、重试和验收由 apps/api 管理。这是 Harness 的受限一次调用组合，不是默认 SDK 编程代理，也不宣称启用了完整 agent-loop、十项 Skills 或任意工具循环。

没有复制上游实现、手写 SDK 类型桩或直接用其他厂商 API 替换 Harness。仅使用已安装包的导出。未挂载 shell、文件工具、session 日志上传、发现用户目录、MCP 或旧 ArtifactStore 六工具。API 协调器经任务权限检查读取指定文本，把限定输入通过 stdin 传给子进程；子进程不接收数据库路径、cookie、共享目录或平台服务凭据，模型可用工具为空。子进程仍运行于同一 OS 用户下，这不是对运维人员的系统级沙箱隔离。

调用会得到类型化 finish/usage；错误只保留稳定 code，原始 provider 错误和 stderr 不对外打印。没有 usage 时为 null，费用仍为 null；应用测量 elapsedMs。运行成功还需 Schema 与原文引文验证，不能用文本中的“完成”改变任务状态。

```powershell
pnpm install --frozen-lockfile
pnpm build
# 密钥通过进程环境或被 Git 忽略的本地 .env 注入，不写命令参数。
node --env-file=.env scripts/check-harness-live.mjs
```

环境：DEEPSEEK_API_KEY；可选 DEEPSEEK_MODEL（默认 deepseek-v4-flash）、DEEPSEEK_BASE_URL（留空应删除此项，不传空 URL）。官方 provider 使用其支持的 Messages 协议，普通兼容 Chat Completions URL 不保证适用，不静默切换其他适配器。对其他端点必须单独验证；本批没有对未知代理发送数据。

2026-10-05 个人聊天批次另通过公共 `LlmAdapter` / `ctx.llm.registerAdapter` 扩展 `qwen` 与 `doubao` 两个路由，保持同一固定 Harness 服务。`ModelInput.provider` 缺省仍为 DeepSeek；千问 / 豆包使用协调器提供的 `MODEL_API_KEY`，只连接已写定的北京官方 Chat Completions 接口。没有任意用户 URL、模型工具或自动 credential fallback；重定向、非法 / 缺失用量和协议错误拒绝成功结果。模型计量从厂商 aggregate prompt 分离 cacheRead，再经现有 normalizeUsage 完整核对，不能加缓存两次。细节及官方参考见[个人聊天说明](../../../docs/development/personal-chat-brief.md)。该增量有真实 Harness + 本地 HTTP / 合成 SSE 检查；尚无千问或豆包真实厂商凭据验收。旧科研任务执行仍使用原实验室 DeepSeek 通路。

本批最小真实调用通过：42 输入 / 29 输出 tokens，费用未报告。服务侧真实规划、公共文本候选、失败、取消/撤权和进程恢复已有专项证据；F3 与共同 G3 已通过独立复核，见 [G3 报告](../../../docs/development/reports/G3-overall-2026-09-30.md)。安装、命令、失败与版本取舍见 [B3 核查](../B3-verification.md)。
