# 任务邀请卡片后台部署回执

2026-10-31。负责人明确授权通过已登录阿里云Workbench的原ECS root shell部署科研API/worker。本批只部署后台；客户端安装包、功能分支合并和Release均不在本批执行。

后台已部署，基础设施检查通过，真实邀请卡片体验待负责人验收。2026-10-31 05:22:08 UTC停止worker，05:22:09停止API，05:22:28恢复可用；北京时间13:22:08–13:22:28，API停机约19秒。

## 源码与构建

- 固定分支feat/task-invite-cards，完整提交 `d77ad630f2de6a0dc851b25cd000f5cf6a3b2435`。服务器目录 `/root/personal-agent-d77ad63`，git rev-parse HEAD核对一致且checkout干净。
- 本机备用source.tar.gz SHA256为 `a9919168e22b4b91e5b6d0ad82724d34f453062ced5890f7d3d685cb42304cee`。GitHub clone成功，未使用备用包。
- 原API/worker实际均为 `research-openim-api:group-direct-join-20261031` / `sha256:1fb72c6bdb0eba546423510d1d2907a236d075f96e611967725117d4c7c37ab3`，已记录并创建本批fallback标签。
- 新镜像 `research-openim-api:task-invite-cards-20261031`，完整ID：`sha256:24f3b108b038b98c2c97dc4f0e8c8160fdc5181417fd67cb79c60b09dee0016a`。docker image inspect确认完整ID及产品revision标签，运行API/worker均匹配该ID。
- 相对上批151份后台构建输入，仅apps/api/src/task-invitation.ts变化：邀请消息resources增加task的id/version。新源码还包含对应隔离回归测试。契约0.39.0、锁文件和31份迁移不变，没有新增迁移。
- 本批运维目录 `/opt/research-openim/ops/task-invite-cards-20261031`。Dockerfile与Dockerfile.dockerignore逐字节复制上一批运维副本，保留research-skills构建，以及025迁移LF→既有CRLF字节的转换前后严格SHA断言，不修改指定checkout或schema_migrations。

```sh
docker build --progress=plain \
  --label org.opencontainers.image.revision=d77ad630f2de6a0dc851b25cd000f5cf6a3b2435 \
  -f /opt/research-openim/ops/task-invite-cards-20261031/Dockerfile \
  -t research-openim-api:task-invite-cards-20261031 /root/personal-agent-d77ad63
bash /opt/research-openim/ops/task-invite-cards-20261031/deploy.sh
```

部署入口不带位置参数。脚本保留旧基础文件及所有覆盖文件，在task-handoff-20261029、group-direct-join-20261031/images.yaml之后追加本批images.yaml。切换前严格比较实际容器的完整Compose链和旧镜像ID，只操作research-api/research-worker，启动使用--no-build --no-deps。

151份构建输入核验通过：150份逐字节匹配指定提交，025迁移原始字节严格匹配现网且规范化SQL匹配指定提交；契约0.39.0、迁移文件数量31。镜像内apps/api/dist/task-invitation.js去空白后确实含 `resources:[{kind:'task',ref:{id:task.id,version:task.version}}]`，不是只检查源码。成品文件SHA在两个正式运行容器再次核对一致，证据artifact-check.json / live-artifact-check.json。

从同一提交只读挂载根vitest.config.ts，在--network none、临时隔离数据库中执行task-handoffs.spec.ts与foundation.spec.ts，17/17通过，13.15秒。覆盖邀请持久化与取消后不误发、任务引用、031恢复与幂等、真实HTTP缺库/恢复边界；不等同于真实账号或模型验收。

## 切换与保全

顺序按本批要求：排空→停止worker→停止API→静止基线→科研库/原件与配置备份→实际恢复副本迁移两次并比较→正式库重复迁移→成对启动新镜像。排空或任何保护失败均停止升级，已停服务按成对旧镜像恢复，不执行回退迁移或恢复旧库。

- 静止备份：`/srv/research-openim-backups/task-invite-cards-20261031-20261031T052210Z/research.tar.gz`。
- SHA256：`ba49228e50cd5815b86c6626b7f6a344ff0dd5a92e39a3f507d74d684b98e2e9`，SHA256SUMS校验通过，已实际解包恢复。
- 迁移前031，恢复副本/正式库分别执行migrate两次，均输出 `{"schema":31,"repeated":true}`；重复执行幂等，迁移前后完整快照一致。112表、9份原件、完整性和外键检查通过；33份配置/secret输入已备份并核对未变，未输出内容。
- API healthy、worker running，两者restart=0，均为本批新镜像。其余6个容器的容器ID、镜像ID、运行状态逐行完全一致，原始证据others.before / others.after，cmp退出0；两个证据文件的SHA256均为 `83bddb0a518402f5fbf7ef1d023e0bd8d75493ba30387ffbd4af5332bde50922`。
- API/worker环境、挂载、命令及运行设置保持；既有模型配置、资料范围、集合和飞书连接保全，广场同步仍关闭。无Nginx、证书、端口、安全组、callback校验或卷删除操作，未触发回退。
- 公网ready200；匿名/api/v1/chat/conversations和/api/v1/auth/session均401。05:24:02 UTC从本机公网复查一致，原始ready如下。

```json
{"data":{"status":"ok","contractVersion":"0.39.0","checks":{"database":"ok","storage":"ok","authentication":"ok","harness":"not_verified"}}}
```

harness保持not_verified；本批未调用真实模型。部署成功不等于真实邀请或客户端卡片体验已验收。

## 真实邀请验收

待负责人自行在客户端发起一次真实任务邀请。本批不创建合成生产账号、任务或消息，不代发邀请。已有历史邀请不批量回填；本次改动作用于新生成的邀请消息。

负责人完成后，仅以只读连接执行指定查询，返回resources，不读取或打印私人消息正文：

```sql
SELECT json_extract(document,'$.resources')
FROM chat_messages
WHERE json_extract(document,'$.origin')='service'
  AND json_extract(document,'$.text') LIKE '%邀请你承接任务%'
ORDER BY rowid DESC LIMIT 1;
```

真实SQL返回：待验收；未伪造或把隔离合成测试结果当作生产结果。验收时须确认选中的是本次部署后新发出的邀请，不能用旧消息的空resources推断新逻辑失败。

## 证据与失败记录

以下路径除特别注明均相对于本批服务器运维目录：git-source.log / git-source.exit、rollback-images.txt / rollback-pair.txt、source-head.txt、prepare-ops.py / prepare-ops.log、Dockerfile、manifest.json / source-changes.json、build.log / build.exit、image-inspect.txt / new-image.txt、source-check.json、artifact-check.json / live-artifact-check.json、isolated-tests.log、preparation.log / preparation.exit、deploy.sh / deploy-command.txt、deployment.log / deploy.exit / success.txt、baseline-summary.json、restore-verify.json、copy-migration.json / live-migration.json、copy-migration-preserved.json / live-migration-preserved.json、config-preserved.json、others.before / others.after、receipt-public.json / receipt-public.txt、ready.json、behavior-validation.json / task-invite-verification.sql。

本机准备发生两次非生产阻挡，记录在 `D:/deepseek-agent/.runtime/task-invite-cards-deploy-20261031/local-preparation.log`：原桌面目录Git ownership guard拒绝只读Git命令，未改全局配置；Codex managed worktree拒绝当前聊天根目录之外的sourceRoot，随后用git worktree add在独立目录创建文档分支。两者均未修改原桌面目录或生产环境。

本批服务器clone、构建、准备检查和正式切换均首轮通过，git-source.exit/build.exit/preparation.exit/deploy.exit均0，没有生产失败或回退。构建中npm registry的typescript GET出现error(23)自动重试，最终安装成功，原始重试记录保留在build.log；未因此修改锁文件或Dockerfile。上一批research-skills遗漏与025迁移失败未重复发生。

最终公开HTTP与脱敏截图留本机上述证据目录：public-check.json / deployment-proof.png。数据库、材料、compose.env及私有配置输入只保留服务器root保护目录，不入Git，不输出内容。文档检查与提交另行记录，不把文档PR视为产品分支合并或客户端发布。

## 回退

本批无schema变化。使用deploy.sh中完整fallback数组停止API/worker后成对启动实际记录的1fb72c6镜像，使用当前数据，--no-build --no-deps。回退前不执行任何迁移，不恢复旧备份，不操作其他六服务或卷。
