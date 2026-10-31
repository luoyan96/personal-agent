# 课题组规范后台 0.40 部署回执

2026-10-31。负责人明确授权部署指定提交；本批只升级chat.acceptcat.com原ECS的科研API/worker，不合并产品代码、不发布或安装客户端。负责人已另行确认：继续部署0.40，新增空来源规范后的故障采用兼容版本前滚修复，不直接退回0.39。

部署完成：北京时间23:29:45停止worker，23:29:46停止API，23:30:06恢复可用，API窗口20秒（UTC15:29:45/15:29:46/15:30:06）。基础设施验收通过，真实账号的规范新增和两处一致性待负责人验收。

## 源码、基线与构建

- 指定分支feat/task-page-entry，完整提交 `3688abb0f4baa7f87accbdea8878334ed489c215`。服务器独立目录 `/root/personal-agent-3688abb`，git rev-parse HEAD核对一致，checkout干净。
- clone时远端分支已经前进到227fa7186ccd114d366009aab6361d1e4e9fba370；未按浮动HEAD构建。随后精确fetch指定SHA、detached checkout并再次核对，记录initial-branch-head.txt / pin-source.log。
- 本机备用source.tar.gz SHA256 `030b82f3aaf8a30826f232af2b592d48e0ba81760a788534b1c7ae09bd851991` 已核对；本次GitHub获取和固定提交成功，未使用备用包。
- 实际旧API/worker均为task-invite-cards-20261031 / `sha256:24f3b108b038b98c2c97dc4f0e8c8160fdc5181417fd67cb79c60b09dee0016a`，而非任务交接中较早的e1b26f9镜像。已将实际ID记录为回退点。指定源码保留了上一批任务邀请resources引用。
- 新镜像：`research-openim-api:lab-standards-20261031` / `sha256:e57ac5913960c4ada9dda704b0be9d1d5092005564a3df27302e82160bcdb3b9`，产品revision标签为上述完整SHA；两个正式运行容器均核对到新ID。
- Dockerfile与Dockerfile.dockerignore逐字节复制group-direct-join-20261031运维副本，保留research-skills构建以及025迁移转换前后严格SHA断言。没有修改指定checkout、锁文件、schema_migrations或数据库校验和。

```sh
docker build --progress=plain \
  --label org.opencontainers.image.revision=3688abb0f4baa7f87accbdea8878334ed489c215 \
  -f /opt/research-openim/ops/lab-standards-20261031/Dockerfile \
  -t research-openim-api:lab-standards-20261031 /root/personal-agent-3688abb
bash /opt/research-openim/ops/lab-standards-20261031/deploy.sh
```

运维目录 `/opt/research-openim/ops/lab-standards-20261031`。deploy.sh没有位置参数，完整调用保存在deploy-command.txt。保留基础文件及全部覆盖链：task-handoff→group-direct-join→task-invite-cards→本批images.yaml。沿用实际线上task-invite这一层，避免绕过已上线配置。只启停research-api/research-worker，启动使用--no-build --no-deps。

## 变更与检查

新增GET/POST /api/v1/lab/work-rules，只接受scope=lab、kind=rule；负责人管理发布/确认，普通成员提交候选，历史修订与任务上下文共用既有记录。契约0.39.0→0.40.0，WorkRule.sourceTaskId可空；没有新增迁移，仍031。

152份构建输入核验通过，包括新导出的openapi/examples；025原始字节匹配现网，规范化SQL匹配指定提交，其余受检输入逐字节匹配指定提交。docker inspect确认镜像身份，隔离容器读取编译产物确认apps/api/dist/work-context.js含labWorkRules/saveLabWorkRule及正确路由；两个正式运行容器的同一编译文件SHA再次核对一致。

指定SHA的GitHub Foundation三组均已success（Ubuntu Node24、Ubuntu22.19.0、Windows24），package亦success；实际步骤包括冻结安装和pnpm run ci。证据：[同SHA Foundation CI](https://github.com/luoyan96/personal-agent/actions/runs/41211424462)，本机github-checks.json保留检查元数据。本批复用已通过的同SHA完整CI，没有冒称在本机重跑。

最终镜像另行执行work-context、task-handoffs、foundation及contracts测试：7文件286/286通过，23.57秒，--network none、1536MiB、maxWorkers=1、临时隔离数据库。从同一提交只读挂载根vitest.config.ts，没有把合成用例写入生产。覆盖规范候选/管理者生效、scope/kind伪造拒绝、任务上下文同条规则、匿名401、邀请引用与迁移幂等等。

## 备份、迁移与运行状态

排空→停worker→停API→静止基线→备份→实际恢复副本→副本迁移两次及只读HTTP核验→正式库重复迁移→成对启动。备份目录：

`/srv/research-openim-backups/lab-standards-20261031-20261031T152947Z/`

- research.tar.gz SHA256：`546c1b653ccf9b02cfe42db9ac9d990024f051b3c93b6911862779c38636d8ab`，SHA256SUMS校验通过，并已解包恢复核验。
- 迁移前031；恢复副本和正式库分别输出 `{"schema":31,"repeated":true}`，均执行migrate两次，完整快照一致。112表、9份原件、完整性和外键检查通过。
- 34份配置/secret输入已备份且哈希未变；环境、挂载、命令、模型配置、资料权限范围、飞书连接和集合保全。未输出内容，广场同步继续关闭。
- API healthy、worker running，两者restart=0。其余6个容器的容器ID/镜像ID/状态完全未变，others.before与others.after通过cmp。两个文件SHA256均为 `83bddb0a518402f5fbf7ef1d023e0bd8d75493ba30387ffbd4af5332bde50922`。
- 正式切换首轮成功，未触发真实回退。没有Nginx/证书/端口/安全组/callback校验或卷删除操作，没有新建SSH凭据。

公网ready200，2026-10-31北京时间23:31:38本机复查的原始输出：

```json
{"data":{"status":"ok","contractVersion":"0.40.0","checks":{"database":"ok","storage":"ok","authentication":"ok","harness":"not_verified"}}}
```

同次匿名GET /api/v1/lab/work-rules为401，原始返回：

```json
{"error":{"code":"UNAUTHENTICATED","message":"Request could not be completed.","requestId":"08c1db0d-6b0d-4f06-9871-b517a9e2909b"}}
```

harness保持not_verified，没有做真实模型调用。ready和隔离检查均不代表负责人账号的实际规范流程已验收。

## 真实验收与回退边界

负责人自行在配套0.40客户端「资料→课题组规范」新增一条规则，再到一个课题组任务的「规则与记忆」核对同一条记录与状态。本批没有代发负责人POST、没有创建生产合成规则、没有读取或输出私人规范正文，因此没有生产行为请求/返回摘要可报告，标记待验收。两个页面的实际一致性不以合成测试代替。

旧0.39的sourceTaskId校验拒绝null，新0.40接受null，隔离解析结果分别记录legacy-rule-check.json / artifact-check.json。即使schema没变，新增这种规范后旧版规则读取仍会失败；撤回规范也可能保留空来源的历史版本。因此负责人明确选择：新增后采用兼容版本前滚。

切换前只读检测当前work_context_records/revisions中的空来源数均为0。deploy.sh的异常恢复增加只读兼容守卫：若空来源当前记录/历史存在，或无法建立兼容性，不会自动切回0.39；保留失败证据并要求前滚。只有在确认不存在该数据格式后，才允许按实际旧ID成对回退。任何恢复均不执行迁移、不改校验和、不回灌旧库。真实回退与前滚均未执行，不能把前置检测当成回退演练。

## 失败、阻挡与日志

以下服务器路径相对于本批运维目录：

| 尝试或阻挡 | 结果/处理 | 记录 |
| --- | --- | --- |
| 浏览器旧绑定与Workbench断连 | 初次绑定不可用、旧WebSocket已断；刷新后沿用已经启用的免密root配置连接原实例，没有新凭据或配置变化 | 本机preparation-notes.log（UI观察摘要） |
| 远端分支前进 | 初始HEAD为227fa718，固定到负责人指定3688abb后才构建 | initial-branch-head.txt、git-source.log、pin-source.log |
| 长辅助脚本输入超时 | 在提交执行前超时，弃用该输入，改用同实例新终端与短脚本；生产未停，独立构建不受影响 | terminal-upload-failure.log（UI失败摘要） |
| 匿名探针插入第一次断言失败 | 运维生成器漏匹配shell循环中的in；未写deploy.sh，修正精确匹配后保留401断言 | route-probe-patch-first-failed.log（终端错误摘要） |
| 构建、定向检查与正式切换 | 均首轮通过，没有025或research-skills失败，没有真实回退 | build.log / build.exit、preparation.log / preparation.exit、isolated-tests.log、deployment.log / deploy.exit / success.txt |

其他证据：source-head.txt、rollback-images.txt、manifest.json/source-changes.json、source-check.json、image-inspect.txt/new-image.txt、artifact-check.json、legacy-rule-check.json、owner-decision.txt、rollback-check.mjs、pre-switch-rollback-compatibility.json、deploy.sh、copy-migration.json/live-migration.json、restore-verify.json、live-migration-preserved.json、config-preserved.json、others.before/others.after、receipt-public.json/txt、ready.json、behavior-validation.json。私有基线和配置备份仅保留服务器root保护目录，不下载到Git。

本机证据目录 `D:/deepseek-agent/.runtime/lab-standards-deploy-20261031/` 保存公开HTTP、CI元数据、UI阻挡摘要和脱敏deployment-proof.png。文档源码使用独立worktree `D:/deepseek-agent/acceptcat-lab-standards-deploy`，原桌面开发目录和其他AI修改均未动。
