# AcceptCat 0.10.108 与 0.49/039 部署回执

版本 PR #219 四项跨平台检查全部通过，以 5722887009090744be27618e03809c9af1b24f01 合并。安装包构建提交与 tag 目标为 9712ca5475281468f6831bc4408a9e951d75cd22，已核对与合并时 main 的完整 Git 树一致。产品代码包含 #210 与之前 #217 的任务交付、资料、聊天缓存和截图。

本机包 C:/Users/luo/.codex/worktrees/task-file-submit/acceptcat-chat-experience/clients/openim/release/Base/0.10.108/AcceptCat_0.10.108.exe，桌面副本 C:/Users/luo/Desktop/AcceptCat_0.10.108.exe。大小 421255393 字节，SHA256 f6e54b0399a5f63562843c8248c228e8f031a3104041af5ac86e7e385b1dd6c3。冻结 1766 份输入，核对实际 EXE 内 136 份构建资源，新增笔记入口与压缩接口标记、既有科研流程、更新清单、隔离启动、禁网跨进程缓存全部通过。内置科研插件 0.4.0、DSH 0.2.1-rc.3。UTC 2026-11-14T10:19:22Z 已公开为 Latest，[正式 Release](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.108) 的四个附件大小及 GitHub digest 均与本地 SHA256 一致。

## 后台

通过原实例已登录 Workbench root shell 执行。源码固定 4c559d67077946026c54e998dd8118e693fa583a，镜像 research-openim-api:assistant-memory-20261114，ID sha256:7c21021c9c95a502c109261bc47b5e2be5b9373b19a0ed8025bbbbb4024806b2。构建复用上一批 Dockerfile，保留 research-skills 构建与 025 旧 CRLF 双向断言，新迁移使用 LF。

API/worker 原实际镜像已写 rollback.json。worker 排空并停止，停止 API 后采集静止基线、备份、在恢复副本两次迁移核验，随后正式迁移并启动。数据库 036→039、121→124 表，完整性、外键和外键启用均通过。恢复副本和正式库全部旧表逐行摘要与所有原件摘要一致。原个人习惯 3 条、历史 4 条、个人设置 5 条均保留；原私人助理与群内偏好表当前为 0 条。撤回、归属和来源等原字段均在完整表摘要内校验。

备份 /srv/research-openim-backups/assistant-memory-20261114-20261114T101422Z/research.tar.gz，SHA256 99ddf0d071ebbb2f0303421a5dc4c09c7abd4d290518bdeee1ca2147570c3ef8。配置与密钥文件已在服务器受限目录备份并校验摘要，未公开其内容。

公网 ready 原始响应如下。

```json
{"data":{"status":"ok","contractVersion":"0.49.0","checks":{"database":"ok","storage":"ok","authentication":"ok","harness":"not_verified"}}}
```

匿名 /api/v1/me/assistant-memories 与 /api/v1/me/memories 等均为 401，原始响应位于 anonymous-*.log。API healthy，worker running，两个容器重启次数均为 0。其余六容器的 ID、镜像、状态及重启次数前后逐项相等，完整证据为 others.before.json 和 others.after.json。原有配置和模型设置摘要也一致。

新镜像内 5 个测试文件 62 项通过，使用合成模型与隔离数据库。生产真实模型学习和压缩效果留待实际使用验收。039 后旧镜像严格迁移校验会拒绝启动，故障按兼容前滚处理。

远端证据 /opt/research-openim/ops/assistant-memory-20261114，含 build.log、source-check.log、artifact-check.log、isolated-tests.log、baseline-summary.log、copy-migration.log、copy-preserved.log、copy-api-check.log、live-migration.log、live-preserved.log、receipt.json、post-container-proof.json 和 ready.log。本地证据 D:/deepseek-agent/.runtime/memory-release-0.10.108-20261114。

准备阶段的失败记录包括本地 Python 默认编码读取失败、无差异 PR 创建被拒绝、传入错误构建提交后冻结校验拒绝（finish-invalid.log），已修正并完整核验。初次镜像 SHA 人工抄录长度不符时被断言拒绝，随后按服务器每 8 位分组核对完整 64 位并保存。后台构建、恢复演练和正式迁移均成功，未触发回退。

其余六容器快照前后文件的 SHA256 均为 5ef20ea81d41163723a7aa825f6d500d55d12dd58e0e65b246a66b46cbf4dbe4，完整 ID 与镜像在服务器快照中保存。
