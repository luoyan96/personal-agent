# 群助理后台 0.46/035 部署回执

2026-11-13，负责人明确要求「后台开始升级」。通过既有 Edge 阿里云 Workbench root 会话升级原 ECS；未新建 SSH 凭据，未改安全组、端口、Nginx、证书或 callback 校验。没有创建生产测试账号、群或通知；实际多账号/模型/IM 体验由负责人验收。

## 固定源码与镜像

- 发布源码/tag `v0.10.105`：`49d55697cf7fad443b006f732b0c3e027239149f`，服务器 `/root/personal-agent-49d5569`，`git rev-parse HEAD` 与干净工作树检查通过。当前 main `51eca28782428c11a695d3c6c75dc7c198fea51a` 只追加发布文档。
- 原 API/worker 镜像：`research-openim-api:constitution-policy-20261111`，两者实际 ID 均 `sha256:f3bdbf9fe016b499318d2c40a1831fbacff384e883fd5a653c59434e46de6d58`，切换前 API healthy、worker running、restart=0。
- 新镜像：`research-openim-api:group-assistant-20261113`，实际 ID `sha256:e25debab9ebd228ad13917c7de2699494c267ce1aff7d9642b6d89e5eff4fa79`。
- 运维目录 `/opt/research-openim/ops/group-assistant-20261113`。从 API/worker 实际容器标签取得一致的 **37 层** Compose 文件链，末项为 `constitution-policy-20261111/images.yaml`；追加本次 `images.yaml`，实际 **38 层**。完整参数保存在 `deploy-command.json`，只对 `research-api research-worker` 使用 `up -d --no-build --no-deps`，不单独调用基础 Compose。
- 沿用上一批运维 Dockerfile，SHA256 `338fb35457d3276b22e84e72d9d0beac57eb38255300a2348716d363e33640f7`；不修改 checkout。保留 research-skills/constitution 构建与 025 的 LF2111→旧生产 CRLF2144 字节兼容断言。
- 530 项 Git 源码输入与镜像逐项核验。035 为 LF/5678 字节，SHA256 `d08d5abcdf6d6b4bd8a835fe2590e5ce0fe264fd00ddffdb8bf4871355e8e8cc`；025 和其余旧迁移校验记录保持。

## 停写、备份与恢复副本

隔离产物核验及 79 项测试通过后，持部署互斥锁，确认 queued/running 聊天轮和执行任务排空，再依次停止 worker、API。备份科研数据目录及实际 Compose/挂载配置输入；配置和密钥只存受限服务器目录，未输出内容。

备份：`/srv/research-openim-backups/group-assistant-20261113-20261113T020844Z/research.tar.gz`。

SHA256：`a7ea38e66911617320f79a931d5116a550d8d99bf2ccfd8b7e372a5116452850`。

静止生产基线：**034 / 116 张非 sqlite 内部表 / 9 个原有文件 / 18 个群**。从该 tar 实际恢复副本，先核对全部原始表记录和文件摘要，再运行迁移两次。副本和正式库均 **034→035、116→119**；第二次所有表行逐项不变，完整性检查 ok、foreign_key_check 零项、外键强制恢复 ON。表数使用 `sqlite_schema` 中 `type='table' AND name NOT LIKE 'sqlite_%'`，不沿用其他报告的空库总数。

迁移对照按实际 SQL 预期验证：新增 18 个固定群助理，15 个旧群智能体成员清退；本次没有待取消的未完成群聊天轮。旧消息 document 字节、任务/承接/执行记录、账号/个人设置/记忆、资料、原有文件及未指定变化的表行保持；旧 IM 标识保持，映射重新标 pending 供现有桥接同步。新三表为 `group_retired_agents/group_governance_events/group_notices`。只允许已明确设计的群归属、成员、邀请、轮状态与 IM 同步状态变化；不能用「所有行不变」掩盖这些变化。

副本还运行生产 server 入口：既有 Plan/WorkRule 解析、ready、匿名权限边界通过；副本检查后再次验证原始内容保全，再迁移正式库。未在生产制造验收数据。

## 切换与公网检查

API healthy、worker running，两者使用新镜像且 restart=0。其余六容器的名称、完整容器 ID、镜像 ID、状态和重启次数前后逐项相同，见 `others.before.json` / `others.after.json`。API/worker 的 env 摘要、挂载、命令、重启策略、内存、端口、网络前后相同，见 `settings.before.json` / `settings.after.json`；配置备份及原件校验通过。

服务器及独立本机公网读取均通过，ready 原始正文：

```json
{"data":{"status":"ok","contractVersion":"0.46.0","checks":{"database":"ok","storage":"ok","authentication":"ok","harness":"not_verified"}}}
```

`harness:not_verified` 明确保留：没有使用真实模型密钥做凭据化模型验收，不把基础健康检查说成真实群助理已验收。

服务器匿名 GET `auth/session`、`chat/conversations`、`chat/group-labs`、群设置、群转达列表、按 ID 读取转达、资料仓库与课题组规则均 **401**。本机独立请求 `/api/v1/chat/group-labs` 原始结果（2026-11-13T02:11:05Z）：

```http
HTTP/1.1 401 Unauthorized
x-contract-version: 0.46.0
cache-control: no-store

{"error":{"code":"UNAUTHENTICATED","message":"Request could not be completed.","requestId":"33113be9-ab54-41d9-b2d2-ac7bd983eaba"}}
```

## 检查、失败记录与待验收

- 新镜像禁网回归 **4 文件 / 79 项全部通过**：group-governance、chat、openim、work-context，130.47 秒。此前固定发布树完整 CI 已通过；本次未改共享源码，不无理由重跑完整 CI。合成模型测试不等于线上真实模型。
- 服务器 `build.log`：首次构建准备缺少运维 `source-migrations.json`，在构建前退出。后从固定 Git blob 生成并核验 35 份校验清单，独立断言 035 摘要；`build2.log` 成功，`build2.exit=0`。没有覆盖产品源码或改数据库迁移记录。依赖下载曾报告 curl23 并重试，最终冻结安装/编译成功。
- 首次 Native typeText 遗漏特殊键导致只读预检命令失效，改用 paste；一次人工修复命令 shell 引号错误未执行。运维脚本初次比较本机 CRLF 与实际传输 LF 摘要失败，改为明确的 LF 内容摘要后通过。这些均发生在停止生产前。
- 本地审计脚本验证曾遇到 LibreOffice Python 子进程权限和未关闭连接；改为进程内 harness 和显式关闭连接后，合成 034→035/119 表保全审计通过。不是生产迁移失败。
- 开始时磁盘95%、剩2.6GiB。未删旧镜像/数据库/备份/源码；仅回收可重建的闲置 Docker build cache。旧 `keep-storage` 参数三次未回收，按当前 `--max-used-space 8GB --reserved-space 1GB --min-free-space 6GB` 回收2.233GB，构建前恢复约4.1GiB、构建后约3.6GiB。日志 `/tmp/acceptcat-build-cache-prune-20261113*.log` 保留。后续应安排容量维护。
- 本机公网匿名复核首个 TLS 握手失败，未降低 TLS 校验，正常重试成功。ready/401 原始文件及本机准备记录在 `D:/deepseek-agent/.runtime/group-assistant-deploy-20261113`。服务器主回执 `receipt.json`，迁移/保全/隔离 HTTP/配置比对日志均在上述运维目录。
- **待负责人实际验收**：0.10.105 登录后的旧群/新群、@群助理、选定课题组规则、实名 notify/ask、收件人引用回应与撤回、多账号 OpenIM 同步。没有代操作账号或声称这些已通过。旧客户端需升级0.10.105；原Windows安装包/Release不因本次部署变化。

## 故障处理

035 已正式提交，**不可只切回034镜像**。旧程序严格拒绝035记录，且空课题组与固定助理语义已变化。采用兼容035的前滚修复；若确需彻底回退，须另行决定停写、恢复上述一致备份并接受升级后数据损失。不要改 `schema_migrations` 绕过校验，不要在排查前恢复旧备份。本批未执行回退。
