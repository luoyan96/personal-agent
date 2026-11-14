# 平台助理反馈学习后台部署回执

北京时间2026-11-14 09:07:42，chat.acceptcat.com 已升级到契约0.46.0、迁移036。源码为PR213合并提交7abfd5a4cc2a400f57097a2146352f645ecbe6a6，与公开客户端0.10.106的后台产品代码一致。通过已登录阿里云Workbench原实例root shell操作。

## 镜像与源码

- 新镜像 `research-openim-api:assistant-feedback-20261114`。
- 完整镜像ID `sha256:abecd2ac097a8f29fb84b1884ab5990963f66c929ac20bec36073216d06b5e11`。
- API/worker旧镜像ID均为 `sha256:e25debab9ebd228ad13917c7de2699494c267ce1aff7d9642b6d89e5eff4fa79`，旧tag为`research-openim-api:group-assistant-20261113`。
- `git rev-parse HEAD`核对成功；533份镜像内源码输入逐字节摘要匹配，反馈worker/queue编译产物与036迁移存在。沿用上一批Dockerfile，保留025旧CRLF字节与断言，036保持LF。
- 原38份Compose文件完整保留，再追加本批images.yaml。只启停API/worker，使用`--no-build --no-deps`。完整参数在服务器`deploy-command.json`。

## 备份与迁移

先在新镜像运行隔离测试，58项通过。排空后停止worker，再停止API，记录静止基线，备份科研库及挂载配置。API停写窗口UTC01:07:25.018821至01:07:42.643581，约18秒。

备份目录 `/srv/research-openim-backups/assistant-feedback-20261114-20261114T010726Z/`，科研库归档`research.tar.gz`，SHA256为`47a427c6899d6d53583c0f50c5f65625ceaef9022b51ce083c635b1394eab059`。配置副本在同目录`config-inputs`，权限保持。归档摘要重复核验，实际解包恢复副本后核对所有原有数据与原件。

恢复副本连续迁移两次，035→036，业务表数119→121，第二次所有行不变，完整性和外键检查通过。恢复副本HTTP验证已有计划和规则可读、ready正常、受保护接口401，没有新建账号或会话，也未调用真实模型。随后正式库同样执行两次迁移并核对幂等，所有119张原表的业务行及9份原件保持，43份现有配置与密钥输入摘要和权限一致。

036新增`assistant_feedback`和`group_dialogue_preferences`，最终只读查询确认迁移记录36条，两张表存在，查询时均0条。部署未向生产写入合成习惯或测试消息。

## 上线检查

API healthy，worker running，二者restart=0且使用同一新镜像。其余六个容器的名称、ID、镜像、状态、重启次数前后JSON逐字一致，证据为服务器`others.before.json`与`others.after.json`，`cmp`通过。原环境、挂载、网络、端口、资源和重启策略摘要保持。

公网ready原始响应如下。

```json
{"data":{"status":"ok","contractVersion":"0.46.0","checks":{"database":"ok","storage":"ok","authentication":"ok","harness":"not_verified"}}}
```

匿名访问auth/session、chat/conversations、群设置/通知、library/repository和lab/work-rules等八个接口均401。auth/session原始响应如下，HTTP状态401。

```json
{"error":{"code":"UNAUTHENTICATED","message":"Request could not be completed.","requestId":"9f5b89ab-bdae-4601-b3af-f218873a970d"}}
```

平台助理日常反馈学习的服务端链路已上线。真实模型归纳、纠正准确性及本人体验仍待负责人验收，ready中的Harness状态为not_verified。

## 证据与恢复

服务器运维目录 `/opt/research-openim/ops/assistant-feedback-20261114/`。保留build.log/build.exit、source-check.log、artifact-check.log、isolated-tests.log、deploy.log、backup-path.txt、restore-verify.log、copy-migration.log、copy-preserved.log、copy-api-check.log、live-migration.log、live-preserved.log、config-preserved.log、ready.log、匿名接口日志、receipt.json和success.txt。

本机准备和观察记录在 `D:/deepseek-agent/.runtime/release-0.10.106-20261114/`，含backend脚本、ready-after-deploy.json和receipt-observed.json。曾因本机锁屏暂停操作，期间生产服务保持035运行；最终服务器构建与迁移流程无失败。运维脚本在正式运行前兼容Python3.10的流式文件摘要，本地合成核验通过。图形界面的窗口位置/焦点重试未执行生产变更。

036后旧035代码严格校验迁移记录，不能仅切回旧镜像。故障优先兼容版本前滚；彻底恢复旧库需停写并单独决定是否接受升级后数据损失。本批未修改Nginx、证书、安全组、端口、认证或callback校验。
