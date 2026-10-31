# 群聊直接入群后台部署回执

2026-10-31。负责人明确授权部署指定分支，本批只更新 `chat.acceptcat.com` 原 ECS 的科研 API/worker，不修改其他六个容器、安全组、端口、Nginx、证书或 callback 校验，不安装或发布客户端。

部署已完成，基础设施验收通过；真实账号的双端建群行为验收尚未执行。正式切换窗口为 2026-10-31 02:01:48–02:02:10 UTC（北京时间10:01:48–10:02:10），约22秒。首次失败切换及回退另见下文。

## 源码与镜像

- 指定分支 `feat/group-direct-join`，提交 `e1b26f90c91ca6d0370cbdcfee2de7938b173634`。本机与服务器 clone 均用 `git rev-parse HEAD` 核对一致，服务器源码目录 `/root/personal-agent-e1b26f9`，无未提交业务源码覆盖。
- 本机备用源码包 SHA256 核对为 `3d3e373528d6d0ee25b0ab2226654f9a6dde6987ab78e1bb8a6ea957ad922ef2`。本次服务器 GitHub clone 成功，未使用备用包。
- 原 API/worker 实际镜像均为 `research-openim-api:task-handoff-20261029` / `sha256:c12e3e423f8492669084600814935c23c4d4e6b8f67985e5bba1aa05a236e2de`。已保存实际镜像记录与本次回退标签，回退只成对切镜像，不恢复数据库或在回退前迁移。
- 新标签 `research-openim-api:group-direct-join-20261031`，实际镜像 ID 为 `sha256:1fb72c6bdb0eba546423510d1d2907a236d075f96e611967725117d4c7c37ab3`，API与worker均核对到此ID。镜像标签含完整产品revision；151份源码/迁移/共享包与锁文件检查通过，其中025迁移采用下述字节兼容，其他文件逐字节比对。contract0.39.0、31份迁移文件不变，镜像默认环境与旧镜像比较无变化。

改动是群创建/加人直接写 joined、不新建群邀请待办；任务承接仍独立。已有 pending 群成员不批量自动变更，负责人可在新客户端重新选择加入。旧邀请表与决策接口保留。没有新增数据库迁移，schema应保持031。

## 运维目录与构建参数

使用已登录 Edge 阿里云 Workbench 的原 root shell，没有新建 SSH 凭据。独立运维目录：

`/opt/research-openim/ops/group-direct-join-20261031`

`deploy.sh` 由上一批脚本生成副本：保留原基础文件和全部覆盖链，在 `task-handoff-20261029/images.yaml` 之后追加本批 `images.yaml`。仅启动/停止 `research-api research-worker`，使用 `--no-build --no-deps`，不执行 down 或卷删除。

调用 `bash /opt/research-openim/ops/group-direct-join-20261031/deploy.sh`，不带位置参数；脚本固定旧实例目录、Compose env文件、新旧镜像与科研数据路径。完整覆盖链和实际参数保留在服务器脚本/容器标签，不输出Compose配置或密钥内容。

首轮按提交中的 `deploy/openim/Dockerfile` 原样构建失败：缺少 research-skills 编译，API报找不到 role-catalog/roles/import 模块。第二轮只在运维目录的Dockerfile副本中，在API编译前增加research-skills构建，并沿用原Dockerfile.dockerignore；业务源码与锁文件仍是指定提交。没有直接修改指定checkout或浮动升级依赖。

第二轮候选镜像 `sha256:30222577ce285f1d3cafb93d2c40b9b1d4bc44f7342138b27c864aa87557956a` 未上线。首次停止后，审计发现 `025-lab-membership.sql` 在现网旧镜像中为2144字节、33个CRLF，在指定提交中为2111字节、LF；规范化换行后SQL完全相同，其他30个迁移文件逐字节相同。数据库记录的是旧CRLF校验和。保护脚本在任何迁移前中止，并成对恢复旧镜像；没有修改schema_migrations或恢复数据库。

最终构建仅为025迁移恢复旧CRLF字节：Dockerfile中同时断言转换前的指定提交SHA和转换后的旧镜像SHA；源码检查另断言原始字节匹配现网、规范化SQL匹配指定提交。迁移校验保持严格，数据库记录未改。第三轮构建生成上述最终镜像；指定源码checkout仍干净。回退后容器标签包含fallback覆盖链，重试先严格核对该链，再以原完整链加本批images.yaml启动，最终链中无fallback覆盖。

构建命令与无位置参数的切换入口如下，原件保存在运维目录：

```sh
docker build --progress=plain \
  --label org.opencontainers.image.revision=e1b26f90c91ca6d0370cbdcfee2de7938b173634 \
  -f /opt/research-openim/ops/group-direct-join-20261031/Dockerfile \
  -t research-openim-api:group-direct-join-20261031 /root/personal-agent-e1b26f9
bash /opt/research-openim/ops/group-direct-join-20261031/deploy.sh
```

## 备份、迁移与保全

实际顺序：停止API入口、等待worker排空、停止worker，记录静止基线，备份科研库/原件及配置输入，恢复副本执行两次迁移并比较，再在正式库重复迁移，成对启动新镜像。

- 静止备份目录：`/srv/research-openim-backups/group-direct-join-20261031-20261031T020151Z/`；科研库和原件归档为其下 `research.tar.gz`。
- research.tar.gz SHA256：`34f7bcac9d5204868ed09f089bab940baa9cf75507251a4bb2e0ee00ba903dc8`；SHA256SUMS校验通过，并已实际解包恢复核验。
- 迁移前031；恢复副本与正式库分别输出 `{"schema":31,"repeated":true}`。重复迁移幂等，迁移前后完整快照相同，112表、9份原件、完整性与外键均通过。
- 33份既有配置/secret输入已备份且哈希未变；环境、挂载、命令、权限范围、资料与模型配置保全。未输出文件内容。
- API healthy、worker running，两个容器均restart=0且指向新ID。其余6容器的容器ID、镜像ID和运行状态与切换前完全相同。
- 恢复副本使用隔离网络和只读HTTP检查，不创建合成生产数据；正式公网ready为200，部署脚本中的受保护接口检查全部为401，额外记录auth/session与chat/conversations匿名401。

02:02:28 UTC从本机再次访问公网，ready原始输出与服务器ready.json一致：

```json
{"data":{"status":"ok","contractVersion":"0.39.0","checks":{"database":"ok","storage":"ok","authentication":"ok","harness":"not_verified"}}}
```

harness保持not_verified，本批没有调用真实模型。它不代表真实群聊或模型效果已验收。服务器可公开汇总为receipt-public.json / receipt-public.txt；完整审计和私有基线仅保存在服务器root目录，不入Git。

隔离测试：首个候选镜像API全量413/414通过，唯一失败为镜像未包含根vitest.config.ts；从同一提交只读挂载该测试配置后，foundation 10/10通过。最终字节兼容镜像重新执行foundation、lab-membership、chat三文件63/63通过。没有把这次定向复查写成全量重新通过。

## 真实行为验收

负责人要求用本人真实账号、新建群选择两位真实成员，不造生产合成账号或数据。已经打开 `https://chat.acceptcat.com`，当前是登录页；已请负责人登录并指定验证成员与群名。在取得该信息前，不代选私人联系人、不伪造登录、不把隔离单测作为真实行为验收。

待验证：创建返回成员全部joined，创建前后chat_invitations无新增；实际被选成员能看到群并发送消息；旧pending成员重新选择后joined。只记录请求/返回与状态摘要，不输出私人消息、Cookie或密钥。截至部署回执，Edge验证页仍在登录页，负责人尚未提供两位验证成员和群名；因此没有生产建群请求/返回可报告，双端行为未声称通过。

回退使用本批deploy.sh中的完整fallback数组，仅停止API/worker并成对切回c12e3e4镜像，up使用--no-build --no-deps。严禁回退前执行迁移或恢复旧备份。本次无schema变更。

## 失败尝试与日志

以下路径均相对于本批运维目录。首轮切换确实短暂停止了API/worker；其他构建/脚本失败没有影响现网，所有失败均发生在正式迁移前：

| 尝试 | 原因与处理 | 日志 |
| --- | --- | --- |
| 原Dockerfile构建 | 缺research-skills构建步骤；运维副本补齐后重建 | `build-first-failed.log`、`build-first.exit`；成功重建在 `build-second.log` |
| 源码检查第一轮 | 生成的迁移文件名正则转义不正确 | `preparation.log`、`source-check-first-failed.mjs` |
| 源码检查第二轮 | 正则仍误用下划线，实际文件以三位数字加连字符命名 | `preparation-second.log`、`source-check-second-failed.mjs` |
| 检查修正 | 按实际文件名使用无额外转义的正则，保留31份检查，不放宽断言 | `preparation-third.log`、`source-check.json`、`isolated-tests.log` |
| 候选镜像全量测试 | 413通过，1项读根CI配置的用例报ENOENT；只读挂载同提交配置后该组10项通过 | `isolated-tests-first.log`、`foundation-recheck.log`、`foundation-recheck.exit` |
| 首轮正式切换 | 025历史迁移仅换行字节不同；snapshot校验中止，未迁移，成对恢复旧镜像健康。01:52:38–01:52:52 UTC约14秒 | `attempt-1/deployment.log`、`attempt-1/failure.txt`、`attempt-1/recovery-stop.log`、`attempt-1/recovery-old.log`、`attempt-1/recovery-state.txt` |
| 重试准备脚本两次语法错误 | 终端去掉literal换行、Python引号未转义；均在执行前失败，无文件/容器/库变更。修正后RETRY_PREPARED | `retry-preparation-failures.log`（根据终端错误记录的摘要） |
| 最终重建和检查 | 保留025旧字节、严格校验原始和规范化SHA；三文件63项通过，正式切换成功 | `migration-025-analysis.json`、`migration-packaging.json`、`build-third.log`、`final-focused-tests.log`、`final-recheck.exit`、`deployment.log`、`deploy.exit`、`success.txt` |

服务器保存操作脚本、Git来源日志、manifest、构建日志、配置哈希和私有数据审计；首轮完整运维记录另存attempt-1。私人库、原件、认证信息未下载到本机。本机只保存公开HTTP检查和脱敏回执截图：`D:/deepseek-agent/.runtime/group-direct-join-deploy-20261031/`。本批不合并功能分支、不发布客户端或Release。
