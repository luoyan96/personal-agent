# 2026-10-08：对话上下文后台上线

## 固定版本

| 组件 | 实际值 |
| --- | --- |
| 部署完成 | 2026-10-08 12:25 北京时间 |
| API / worker 运行源码 | `06262a6b7b0167b7434e4536b753ec2526e8d045` |
| 两服务镜像 | `sha256:7b2b77b62a5c37616268bb0190465a469ac38c2e8ea076dea4b25a82510bc663` |
| 契约 / 聊天 / 数据库 | `0.21.0` / `1.10.0` / `20`，无迁移 |
| Windows 客户端 | 已发布0.5.1兼容，不需要新安装包 |
| 公网检查 | `https://chat.acceptcat.com/api/v1/health/ready`，实际200 / status ok |
| 审查 | [PR21](https://github.com/luoyan96/personal-agent/pull/21)，草稿，基于PR20；未合main |

## 更新与证据

用户要求修改软件上下文，并已授权阿里云维护会话部署。本批新增同对话历史关键词检索、带出处早期摘录、近期完整原文、相关已确认记忆和实际工作任务状态；纠正/撤回记忆及任务变化会排除过期上下文。实现、长度与费用边界见[对话上下文](../development/conversation-context.md)。没有改公开API、数据库、桌面界面或安装器。

基于原固定镜像 `research-openim-api:5c949980` 构建 `research-openim-api:context-06262a6b`，四个API源码模块与Git规范化LF源摘要核对，原依赖与其他运行代码继承；Docker build关闭网络。运行模块dialogue-context.js、chat-worker.js、personal-memories.js与本机受测编译产物字节相同；chat.js包含Windows模板串保留的5个CRLF，统一LF后与Linux产物相同。云镜像标签记录完整源码提交。

API与worker短暂同时停止，随后完整runtime归档到 `/srv/research-openim-backups/context-06262a6b-20261008T042418Z/runtime.tar.gz`，SHA256 `646d0b2810ee33842339a39e7a28bc93af544bcea9c72074052e9df41c92a7db`。gzip/tar检查、研究库隔离恢复及schema20全部83表行数/行摘要、integrity/FK通过；启动前原库保持。备份包含密钥、配置及私人数据，留服务器私有目录，不进入Git。此次没有备份/恢复演练其他组件或异地存储。

仅重新创建API/worker，两者同镜像、running、restart unless-stopped；原OpenIM及其依赖组件没有重建或改端口/权限/凭据。启动健康检查和服务器/本机公开TLS ready均通过；ready中的harness not_verified准确保留，本批不调用用户Key进行真实模型质量验收。

完整 `pnpm run ci` 46文件/575项、生产020 CLI/HTTP两项、B0进程与Web生产隔离通过。新7项上下文检查使用真实HTTP、持久SQLite和生产worker，模型结果合成。首次可空任务结果编号编译错误和第二次3项旧4000预算夹具失败保留；修正后完整检查通过。原GitHub源码下载SSL失败、一次PowerShell公开ready请求TLS EOF也保留，均由后续实际完成证据更新状态。

Git外证据在 `D:/deepseek-agent/.runtime/conversation-context-20261008`：ci.log、deployment-receipt.json、cloud-deployed-terminal.txt、cloud-deployed-proof.png及实际部署脚本。原部署日志与数据库摘要在服务器 `/opt/research-openim/ops/context-06262a6b`；不复制含私密内容的完整配置或容器inspect到公开记录。

固定运行源码06262a6b的GitHub [37726801838](https://github.com/luoyan96/personal-agent/actions/runs/37726801838)三平台（Ubuntu22.19/24、Windows24）实际全部通过。后续部署日志提交不改变固定运行源码或客户端发布标签。

## 后续运维

重建这两个服务沿用实际四份配置：

```sh
docker compose --env-file /srv/research-openim/compose.env \
  -f /opt/research-openim/releases/06262a6b7b0167b7434e4536b753ec2526e8d045/deploy/openim/compose.yaml \
  -f /opt/research-openim/releases/06262a6b7b0167b7434e4536b753ec2526e8d045/deploy/openim/compose.production.yaml \
  -f /opt/research-openim/ops/compose.production-images.yaml \
  -f /opt/research-openim/ops/context-06262a6b/images.yaml \
  up -d --no-build --no-deps research-api research-worker
```

原5c949980源码、镜像及social-5c949980/images.yaml保留，同schema20可成对回退这两个服务；不覆盖当前数据库或切换更早schema18镜像。回退后需重新检查ready和两个服务的实际镜像。部署脚本在停止后的错误路径会恢复原成对配置，本次成功路径未触发回退。
