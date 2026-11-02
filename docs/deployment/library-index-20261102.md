# 资料索引后台 0.41 部署回执

2026-11-02。按负责人指令升级 chat.acceptcat.com 原 ECS 的科研 API/worker，指定源码未改动；没有合并产品分支、制作或发布客户端。负责人已明确确认：032 上线后故障采用兼容版本前滚修复，不直接退旧 0.40 镜像。

北京时间 **08:42:10**（UTC 00:42:10）部署完成。worker 于 08:41:49 停止，API 于 08:41:50 停止；API 不可用窗口 20 秒。基础设施检查通过，真实账号的资料索引操作待负责人验收。

## 源码和镜像

- 分支 `feat/task-page-entry`，固定提交 `6c93fdc63297fb38db5c0c6bcb3ee3309bf96626`；服务器独立目录 `/root/personal-agent-6c93fdc`。git rev-parse HEAD 精确匹配，checkout 干净。服务器从 GitHub 获取指定提交，未使用备用 source.tar.gz。
- 实际旧 API/worker 均为 `research-openim-api:lab-standards-20261031` / `sha256:e57ac5913960c4ada9dda704b0be9d1d5092005564a3df27302e82160bcdb3b9`，已分别记录到 rollback-images.txt。
- 新镜像 `research-openim-api:library-index-20261101`，docker image inspect 返回完整 ID：

```text
sha256:b60dc27e68fa54b96a29f1df4a58dfa3cb7e52929843632c264f1bb58e4524ef
```

镜像 revision 标签为固定提交。沿用 `/opt/research-openim/ops/group-direct-join-20261031/Dockerfile` 及 Dockerfile.dockerignore 副本，保留 research-skills 构建、025 的原始 LF 与现网 CRLF 双向字节断言。未修改指定 checkout 或 schema_migrations。

032 文件确认 LF、652 字节、0 个 CRLF，SHA256 为 `f39508f80f995489abb07a5b2b6666c6692f84522ad412129f249e5fdc2d8799`，不需要 sed 转换。其余迁移保留原字节，025 按上述已验证副本恢复现网字节。

```sh
docker build --progress=plain \
  --label org.opencontainers.image.revision=6c93fdc63297fb38db5c0c6bcb3ee3309bf96626 \
  -f /opt/research-openim/ops/library-index-20261101/Dockerfile \
  -t research-openim-api:library-index-20261101 /root/personal-agent-6c93fdc
bash /opt/research-openim/ops/library-index-20261101/deploy.sh
```

运维目录 `/opt/research-openim/ops/library-index-20261101`，构建日志 build.log、build.exit=0；完整调用留 deploy-command.txt。deploy.sh 无位置参数，添加同实例部署锁，只启停 research-api/research-worker；启动使用 --no-build --no-deps。

保留基础 Compose 与所有实际覆盖层，末尾为 task-handoff → group-direct-join → task-invite-cards → lab-standards → 本批 images.yaml。切换前按两个容器的实际 Compose config_files 标签逐字核对原链，新覆盖文件只指定两个科研服务的镜像。

## 构建、检查与限制

镜像内 489 份受检输入与固定提交匹配（025 使用经过双向断言的现网字节）；apps/api/.env.example 按原 Dockerignore 明确排除。镜像身份由 docker inspect 核对；隔离容器读取 apps/api/dist/library-index.js、server.js 与 migrations/032-library-index.sql，确认命令注册和迁移文件。正式 API/worker 内编译文件 SHA256 均再次匹配 `6fe0e54452d874fac5c1aa2a0ce61a397276bfd3dbb08220e9396b8e233b5b89`。

最终镜像使用 --network none、1536MiB、maxWorkers=1，在临时隔离库执行 library-index、work-context、foundation、task-handoffs 与 contracts：**5 文件 283/283 通过，27.19 秒**。根 vitest.config.ts 从同一提交只读挂载。覆盖维护者/管理者修改、同组其他成员只读、相对路径、重复索引、推荐项、版本/撤回/幂等及匿名访问；没有生产合成条目。

指定 SHA 的 Foundation CI 仍为失败，不能报告全绿：[运行 41300517058](https://github.com/luoyan96/personal-agent/actions/runs/41300517058)。读取的 Ubuntu Node24 日志显示构建、类型和 70 文件 867 项测试通过，随后 deploy/openim/tests/production.test.mjs:78 对迁移数保留旧断言，报 32 !== 31，生产入口测试 2/3。没有为绕过它修改指定源码或伪造成功。此批实际恢复副本、正式迁移、运行入口及公网检查另外完成；不声称整套 pnpm run ci 在本批通过。

[客户端 package CI](https://github.com/luoyan96/personal-agent/actions/runs/41300517067) 在 task-material-bridge 测试中因 esbuild 未配置 koffi .node loader 失败，37/38。此项不作为后台部署通过证据，也未在本批修改或发布客户端。上述原始失败日志保留本机 Git 外。

## 备份与 031→032 迁移

按排空 → 停 worker → 停 API → 静止快照 → 备份 → 实际解包恢复 → 副本迁移两次 → 副本 HTTP/旧版兼容性检查 → 正式迁移两次 → 成对启动的顺序完成。

备份原件：

```text
/srv/research-openim-backups/library-index-20261101-20261102T004151Z/research.tar.gz
SHA256 d318dacf4af954c1044420e35681fc86d482afa8495c4e5625cb5efbd9ff523f
```

SHA256SUMS 校验通过，并实际解包恢复核验。没有恢复覆盖正式库。

| 检查点 | 迁移记录 | 表数 | 结果 |
| --- | --- | --- | --- |
| 正式库静止基线 | 31 | 112 | 完整性/外键检查通过，执行与聊天队列为 0 |
| 恢复副本迁移两次 | 32 | 113 | repeated=true；原有对象、表数据和文件一致 |
| 正式库迁移两次 | 32 | 113 | repeated=true；原有对象、表数据和文件一致 |
| 启动后只读查询 | 32 | 113 | library_index_entries 存在，STRICT=1 |

新增空 library_index_entries 表和对应索引/迁移记录；全部原有业务表逐表数据摘要、31 条历史迁移、9 份原件与其他文件保全。35 份配置/secret 输入哈希未变，社区同步继续关闭；飞书与原资料范围未扩大，未输出配置或私人正文。

## 服务与公网原始返回

API healthy，worker running，两个容器 restartCount 均为 0、实际镜像均为上述新 ID。其他 6 个容器的 ID、镜像 ID、状态逐字一致，others.before/others.after 通过 cmp；两份文件 SHA256 均为：

```text
83bddb0a518402f5fbf7ef1d023e0bd8d75493ba30387ffbd4af5332bde50922
```

6 个服务为 openim-server、minio、etcd、kafka、mongo、redis。原始逐容器证据保留服务器 ops 目录，没有用仅比较标签代替 ID 比较。配置、挂载、命令等 settings.before.json/settings.after.json 同样通过 cmp。

2026-11-02 08:44:19 本机独立公网复查，GET /api/v1/health/ready 为 200，原始 body：

```json
{"data":{"status":"ok","contractVersion":"0.41.0","checks":{"database":"ok","storage":"ok","authentication":"ok","harness":"not_verified"}}}
```

同次匿名 GET /api/v1/library/index 为 401，原始 body：

```json
{"error":{"code":"UNAUTHENTICATED","message":"Request could not be completed.","requestId":"fd485c96-68df-405f-b58f-ae343c6c674e"}}
```

服务器独立公网复查也为 200/401，原始 body/headers 留 ready-public.json、anonymous-library-index-public.json 及对应 headers；401 requestId 为 `2aef539f-929e-48d6-a95d-065286c7f0d9`。harness 保持 not_verified，没有真实模型调用。

## 真实验收和故障恢复

**待负责人验收**：配套客户端「资料 → 资料索引」先选本地资料文件夹、挑文件新增，确认列表「本地有」；执行「校验本地版本」应显示「本地一致」；另一个同组普通账号应能看到而不能修改。后台允许条目维护者及课题组管理者修改，因此第二账号应选普通成员，不能用管理者账号验证只读限制。

本批未代操作用户客户端、未创建生产合成数据、未登录或代发负责人新增请求。没有真实行为请求/返回摘要可报告，不能用隔离测试代替真实验收。服务器 behavior-validation.json 明确 pending_owner。

旧 0.40 的 checkMigrationHistory 严格要求 31 条，032 数据库会被拒绝。已在迁移后的真实恢复副本上，用旧镜像只读调用校验，确认 `{"schema":32,"old040Rejected":true,"readOnly":true}`。所以“旧代码不读新表就可直接回退”不适用于当前实现。

负责人明确同意 0.41 继续部署，032 后采用兼容版本前滚。deploy.sh 的恢复守卫在 schema=32 或兼容性无法确认时禁止自动启动旧 0.40；只有正式迁移尚未发生、仍为 031 时才允许旧镜像恢复。032 后如确需恢复旧备份，须另行确认并接受升级后写入丢失，本批未执行。旧镜像保留为可追踪基线，没有声称做过真实回退或前滚演练。

## 失败尝试与证据

以下服务器文件均相对本批运维目录：

| 尝试 | 结果与证据 |
| --- | --- |
| 旧 Workbench tab 绑定失效 | 重新找到原实例已连接 root tab；本机 preparation-notes.log 记录 UI 摘要，无新凭据 |
| npm canvas 下载警告 | 原构建自动重试后成功，build.log / build.exit=0 |
| 第一版镜像输入清单包含 Docker 排除的 .env.example | ENOENT 在停服务前发生；source-check-first.stderr、manifest-initial.json 保留，manifest-exclusions.json 记录唯一明确排除项；最终 489 份核对通过 |
| 小准备补丁字符串换行错误 | Python SyntaxError，未写文件；改为压缩脚本后成功，preparation-ui-failures.log 和本机 preparation-notes.log 为事后 UI 摘要，不冒称原始逐字日志 |
| 首轮 deploy 防覆盖守卫 | 准备阶段提前生成 images.yaml，与旧脚本的“尚不存在”断言冲突，停服务前退出 1；deployment-first-preflight.log（空）、deploy-first-preflight.exit、deployment-first-preflight-summary.log、images.prepared.yaml 保留；确认原容器仍运行、无基线/停写记录后调整文件准备顺序 |
| 第二轮实际切换和最终复查 | deployment.log、deploy.exit=0、success.txt、post-check.log、post-check.exit=0；没有生产迁移失败或恢复旧镜像 |
| 指定提交 CI 失败 | 本机 foundation-failed.log、package-failed.log、github-checks.json；具体失败与验证边界见上文 |

其他证据：source.log/source-head.txt、rollback-images.txt、Dockerfile、deploy.sh/deploy-command.txt、manifest.json、source-check.json、artifact-check.json、new-image.txt/image-inspect.txt、owner-decision.txt、baseline-summary.json（私有完整基线不公开）、copy-migration.json/live-migration.json、copy-migration-preserved.json/live-migration-preserved.json、restore-verify.json、legacy-schema-check.json、database-final.json、config-preserved.json、others.before/others.after、receipt.json、behavior-validation.json。

本机 Git 外证据目录 `D:/deepseek-agent/.runtime/library-index-deploy-20261102/`；包含公网原始输出、CI 失败日志、脱敏 deployment-proof.png、运维辅助脚本和 UI 阻挡摘要。独立文档 worktree `D:/deepseek-agent/acceptcat-library-index-deploy`。没有改 Nginx/证书/端口/安全组、关闭 callback 校验、清空卷、覆盖其他 6 个容器或修改数据库迁移记录。
