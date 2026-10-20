# 后台DSH 0.2.1-rc.2升级：2026-10-20

用户明确要求更新后台。基于实际干净`fix/chat-sidebar-resize-0.10.24` / `46b531f`新建`chore/harness-0.2.1-rc.2`，产品固定 **47ec4969ec83c751053f229daac6b20f3271cb39**。本批已配对部署科研API/worker，没有更新客户端安装包、公开Release或飞书应用。

## 固定版本与兼容范围

官方[候选发布dsh-v0.2.1-rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.2)发布于2026-10-17。实际安装的`@deepseek-ai/dsh-llm`和`@deepseek-ai/dsh-llm-deepseek-api-key`均精确固定**0.2.1-rc.2**，按其peer要求将Cordis由4.0.4配套升级至**4.0.5**。根锁文件记录完整性，minimumReleaseAge/strictDepBuilds保持；不使用各子包不一致的latest标签。

继续沿公开LlmRuntime/LlmAdapter接口、空tools、原端点和用户选择的模型。权限、上下文、资料检索、取消、用量核对、业务结果校验与任务确认保持。新/恢复排队的任务在实际派发时记录新版Harness，已完成历史不重写。没有启用新增Search/Fetch、shell、文件工具、MCP或自主工具循环；不更换默认模型或已有Key。

contract **0.26.0** / schema **023**保持，无数据库迁移；Windows **0.10.24**安装包和原哈希保持，已有客户端无需重装。

## 代码与镜像

线上先实际核对原API/worker均为`research-openim-api:feishu-20261020` / **sha256:4ee12e77f80da2e196e6640980dbdb521a1bfa5e168ac1ced6012f387e63ea0d**，运行正常；实际包为DSH0.2.0-rc.1 / Cordis4.0.4。磁盘当时约85% / 7.3GiB可用，不清理旧镜像或备份。

候选基于该生产镜像，只覆盖五个固定文件：根pnpm-lock.yaml、runtime/package.json、runtime/src/index.ts、apps/api/src/ai.ts及execution-worker.ts，再依冻结锁文件安装、构建runtime/API。五源文件逐项SHA256匹配；公共目录种子、个人模型、飞书服务、生产入口及023迁移原件新旧镜像哈希相同，没有用桌面集成分支整体覆盖生产。

新镜像 **research-openim-api:harness-0.2.1-rc.2-20261020** / **sha256:34bba4d03a5d714d731c248302f1484d47382c52e833d004dda68c88e01c5130**。OCI组合修订`47c42acbccf64b1d329babb26a464733b81d51d3+key-preview.4bc8d1f+feishu.2bbcfbc+harness.0.2.1-rc.2`，五源文件对应47ec496，manifest与source-commit.txt留服务器。API/worker最终实际inspect同一新镜像、running、restart0；API healthy。

## 验证

- 根完整`pnpm run ci`：**55文件/694项**、构建、类型、契约、2项生产CLI/真实HTTP、B0进程及生产无夹具检查通过。首轮新增测试错误引用runtime/src越过API rootDir，修为已构建dist入口后重跑通过；原失败日志保留，未放宽类型检查。
- Linux实际候选镜像：**4文件/29项**Harness测试通过，使用实际固定DSH与本地合成Messages/Chat Completions服务，验证增量、取消、截断、reasoning策略、缓存/用量和千问/豆包适配。无生产挂载、外部模型请求或私人材料。
- 同一候选镜像真实HTTP/SQLite合成飞书检查通过：OAuth/PKCE、回调重放400、匿名401、跨账号隔离、令牌加密、wiki/docx预览、私人副本、幂等导入、断开和旧Key预览；没有实际读取私人飞书文档。
- 上线后在worker内复用罗岩本人现有默认配置，真实DeepSeek `deepseek-flash`仅发送合成短句，DSH0.2.1-rc.2返回**OK**、流式2字符，实际**23输入/1输出tokens，1016ms**；failure=null，费用/币种未知。密钥只在服务器进程内使用，不打印、不改写；无历史、私人资料或正式任务输入。这是一条真实连通性检查，不代表科研质量或千问/豆包真实厂商验收。
- 服务器及本机公网ready均**200 / 0.26.0**，DB/storage/authentication ok。health的Harness字段仍按原实现返回not_verified，不因一次人工探针而改成全局认证状态；真实探针单独留证。

## 备份、切换与首轮回退

仅停止科研API接收新请求，等待worker完成；核对execution/chat queued/running均0后停止worker。停写备份、恢复副本与上线前核对确认**94张表**SQL/行哈希、schema历史、**6份原件**哈希/大小/权限/目录结构一致，integrity/foreign-key检查通过，无迁移。配置备份及原数据仅留服务器root专用目录，未下载私人数据库或原件。

首轮审计脚本`deepStrictEqual`误判SQLite结果的null prototype与JSON读回普通对象；未发生数据内容差异。自动回退已恢复旧API/worker，未恢复备份覆盖业务数据。17:38:01开始维护，17:38:12旧服务重启命令完成，后续实际确认healthy。原脚本/错误/备份保留在ops/attempt1。比较前将对象统一为JSON数据后，在原恢复副本重验通过；未修改产品代码或数据库来使检查通过。

第二轮重新做当前停写基线和新备份，**17:40:05—17:40:18北京时间**从停止接收到最终检查恢复，记录为13秒；这不含首轮回退窗口，不称整批仅中断13秒。

最终备份 **/srv/research-openim-backups/harness-20261020-20261020T094007Z/research.tar.gz**，SHA256 **1cb070f6652899670d9dca92dfa302255b45d3efbf37113e26a44c8ab31ad3ad**，压缩包校验及独立恢复副本逐项核对通过。原镜像和两轮备份保持。

配对启动后`personal_model_configurations`、`personal_model_settings`、`lab_ai_settings`整表哈希保持；已有密文、默认配置不变。两服务env整体哈希、全部挂载、命令、重启策略、内存、端口和网络设置一致，飞书secret挂载/仅本人范围保持。其他**6个服务**容器ID/镜像/运行状态逐项相同，未重启。飞书及模型配置匿名接口仍401。

## 回退与证据

没有schema变化，可在先停止接收、排空生成并停止新API/worker后，使用原compose覆盖组合恢复`research-openim-api:feishu-20261020`。保留当前数据库和用户新写入，不用备份盲目覆盖业务；旧镜像/配置/备份均可用。首轮已实际触发并验证恢复旧服务。

完整服务器证据：`/opt/research-openim/ops/harness-0.2.1-rc.2-20261020`。Git外本机：`D:/deepseek-agent/.runtime/harness-upgrade-20261020`，含源码manifest、694项CI/首败、初始依赖peer提示、Linux构建/切换观察、审计首败/修正观察、公开health、实际模型脱敏回执和production-updated.png。没有生产Key明文、私人研究原件或数据库传出。下一步继续真实课题/获准材料质量验证；不将版本升级视为完整自主Agent已完成。
