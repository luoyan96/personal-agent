# 本人模型Key脱敏预览接口部署（2026-10-20）

用户明确选择“部署脱敏预览接口”，随后恢复Edge阿里云Workbench连接。本批独立部署已完成；Windows0.10.19包仍使用4bc8d1f源码和原SHA256，不重新打包、不代安装、不公开Release。

## 实际部署内容

部署前实际inspect确认科研API/worker仍是47c42acbccf64b1d329babb26a464733b81d51d3 / `research-openim-api:community-47c42ac` / `sha256:b78613b5c6e1f77d07e7af392149744161e25460cb7e4f14b2ec0500e3fda2cc`，healthy/running；磁盘可用7,728,222,208字节。

在原镜像上只覆盖4bc8d1f7cde314a1a9a99d3360b49a8647d43497的四个源文件：`apps/api/src/personal-models.ts`、`packages/contracts/package.json`、`packages/contracts/src/models.ts`、`packages/contracts/src/personal-models.ts`。旧文件/新文件SHA256均逐一核对，网络隔离构建contracts与API；没有把整条桌面分支、其他Skill修复、公共目录种子或依赖更新带到线上。

新镜像 `research-openim-api:key-preview-20261020`，实际ID **sha256:8defb3973bfc93a5544df1fe6b715eecf91c152fb4b1544d93f913feec874986**。OCI revision使用明确的组合标记 `47c42acbccf64b1d329babb26a464733b81d51d3+key-preview.4bc8d1f`，overlay.source为完整4bc8d1f SHA；不能把它说成整份4bc8d1f后台源码已部署。

运维目录 `/opt/research-openim/ops/key-preview-20261020-v2`，传输/脚本日志 `/root/acceptcat-key-preview-20261020`。使用原47c42ac两份Compose、原production-images及community-47c42ac覆盖文件，最后追加本批image覆盖，仅 `up -d --no-build --no-deps research-api research-worker`。运行环境哈希、命令、挂载、内存、端口、重启策略相同，其余六个组件的容器ID/镜像/运行状态前后一致。

## 备份与真实检查

停写后备份 `/srv/research-openim-backups/key-preview-20261020-20261020T011803Z/research.tar.gz`，SHA256 **7addef0a868c868be4a1bc2a314835c800c57963b09bfd9a4afa09721cbdf26b**。恢复至独立副本，与停写原库逐表/原件核对：91张表、6份原件、schema022、完整性/外键及22份迁移checksum通过，切换前所有行与原件摘要一致。启动后再核对schema，并只比较哈希确认已有personal_model_configurations和personal_model_settings整表记录仍一致；没有解密生产Key。

新镜像在network none、无生产挂载的隔离容器中，用临时SQLite/两名合成账号/合成Key执行真实HTTP：旧加密记录重启后只返回首尾、中间八遮罩，Key记录不变、no-store；匿名401、跨账号404，旧模型元数据响应兼容。无worker/模型供应商调用。该检查不代表使用了用户真实Key。

独立公网2026-10-20 09:19北京时间检查：ready200、contract0.25.1，database/storage/authentication均ok；新预览路由匿名401，X-Contract-Version0.25.1、Cache-Control no-store。harness仍not_verified，不称真实模型质量或用户现装界面已验收。旧Key无需重填，使用0.10.19后重新进入“我的→模型设置”读取预览。

## 失败与恢复边界

首次镜像与隔离检查已通过，但审计容器把/data挂成只读，SQLite WAL辅助文件打开失败。此时尚未启动新镜像，失败流程重新启动原API/worker；独立公网确认原0.25.0正常，无数据库恢复或迁移。原日志和失败ops目录保留。第二次仅将审计数据挂载改为可写，DatabaseSync readOnly和PRAGMA query_only仍保持，脚本SHA256 **18e5db5536435f3943f4d67111b5f312257a8e3b934180ef1f9176a88834d969**，完整备份/副本/原库检查后切换成功。

首次凭据摘要诊断脚本还有换行转义语法错误，未执行查询；修正后通过，initial.stderr保留。Workbench文件管理仍指旧过期会话导致上传失败，未传文件；改用已连接Shell传输，payload SHA256 **6dfc6a3a2f113f13cb797d1fb4dff1b97bf01a4a342d8711b7edcefa6a6621b1**及源文件哈希均通过。

旧镜像、旧Compose配置和备份保留。本次schema/写入语义未变；如需切回，先核对当前运行状态，再用原Compose成对启动旧API/worker，不能用旧备份覆盖新业务写入。此次没有执行数据库还原，也没有修改OpenIM、Nginx、网络/认证配置、公共目录或更新源。Git外证据 `D:/deepseek-agent/.runtime/key-preview-deploy-20261020`；详细基线和备份只保留在服务器受保护目录，不上传私人数据。
