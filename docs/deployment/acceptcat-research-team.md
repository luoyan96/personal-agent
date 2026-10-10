# AcceptCat 0.9.0 科研团队后台部署

## 固定版本与范围

2026-10-10 15:48北京时间完成核验。受测 / 打包 / 后台源码为 `f9729a223e0b9ccd0089949e83c10f35c6e4e53d`，来自 GitHub 固定 codeload 归档，SHA256 `18e06af4741869a21b625a5b893ae8fec1485c3410f40add0d1e75477c2ad816`。前后端按用户明确要求由 gpt-6.1-sol / high 并行实施；用户重新登录原阿里云维护会话后沿用既有部署授权。

API / worker 同为 `research-openim-api:team-f9729a22`，镜像 `sha256:c3e47a756279050379eb775884b2a7120b52ecb7b86f35c9c97b2465da5f1254`，OCI revision 标签与源码一致。契约0.23 / chat1.11 / schema021，无新迁移。源目录 `/opt/research-openim/releases/f9729a223e0b9ccd0089949e83c10f35c6e4e53d`；运维目录 `/opt/research-openim/ops/team-f9729a22`。

仅重建科研 API 与 worker。Dockerfile 使用已核对 image ID 的旧本地 tag `research-openim-api:skills-11cd20a9`，复制 contracts 与 API 源码，network none 编译；没有重新安装依赖。OpenIM、MinIO、etcd、Kafka、Mongo、Redis 六项保持原镜像、已运行两天。没有部署网页静态客户端；`/opt/research-openim/current` 仍是历史静态入口，不能用它推断当前后台版本。Windows0.9.0需手工安装本地交付包，公开 Release 仍0.6.0。

## 备份与旧数据验证

成对停止科研 API / worker 后备份：
- `/srv/research-openim-backups/team-f9729a22-20261010T074607Z/research.tar.gz`
- SHA256 `55f405c898d6ee6469ce7b428f7011e41308169018af6647b6f0cfa9783bcae0`
- 同目录保存受保护的 compose.env、旧 images.yaml、基线摘要及独立解压验证副本；不读取或公开配置值。

只读 audit 使用实际 node:sqlite 核对 integrity_check、foreign_key_check、schema_migrations 最高21、86张表的定义 / 行数 / 排序行摘要。原库基线、解压副本和启动前原库全部一致。无删除表 / 改写旧行 / 数据迁移。备份覆盖科研数据库和科研资产，不是全部 OpenIM 数据组件的一致备份。

## 启动与线上证据

Compose 使用固定新源码的 compose.yaml / compose.production.yaml、既有 compose.production-images.yaml 及本批 images.yaml，明确 `up -d --no-build --no-deps research-api research-worker`。API healthy、worker running，二者 restart=unless-stopped、相同新 image ID。

公网 `https://chat.acceptcat.com/api/v1/health/ready` 返回 status=ok / contractVersion=0.23.0；database / storage / authentication 为 ok，harness=not_verified。新增 research-workspace 与 plan tasks 路由的匿名探针均401，鉴权入口真实存在。这不是认证后的云端业务流程或真实模型质量验证。

服务器日志保留 `/root/team-f9729a22-deploy-v2.log`、运维目录 build.log / ready.json / deployed-image.txt / baseline.json。Git 外本机证据 `D:/deepseek-agent/.runtime/research-team-20261010` 的 public-ready.json、public-route-proof.json、deployment-receipt.json。前端 / 真实本地 API / SQLite 的9组师生流程、603项共享检查和包启动证据见[实现记录](../development/research-team-workbench.md)。

## 恢复边界

旧 API / worker 为 `research-openim-api:skills-11cd20a9`，image ID `sha256:580d8333423e8fab0d7fb5f4216a6707fa073b3cbb975794565beb3cf18c6e9b`。旧 compose 源目录 `/opt/research-openim/releases/11cd20a92bd1a295120f7c87eea022da3ff9c411`，既有 images override `/opt/research-openim/ops/skills-11cd20a9/images.yaml`。

回退前成对停止新 API / worker，保留当前数据库和新备份，检查 execution_jobs 内 kind=planning、status 为 queued/running、request_json.modelBinding 为 object 的请求。旧 worker 不认识新私人绑定，存在此类活跃任务时不能直接启动旧 worker；先完成或按当前系统取消这些请求。无此类任务时可以用旧两份 compose、既有生产 override 和旧 images override 成对启动旧服务，保留当前 schema021 和全部新业务数据。本轮没有执行回退或覆盖数据库。恢复旧备份属于独立数据恢复操作，会丢失备份后写入，不能当成普通软件回退。

## 失败与中断

第一轮 FROM 使用 sha256:image ID 被 Docker 当成远程仓库，网络超时；发生在停止服务之前，未影响原服务或数据。日志 build-initial-failed.log 保留。改用摘要已核对的本地 tag 后成功。一次多行维护终端传输因转义不可靠取消；随后改为单行 gzip/base64 并校验 SHA256 / bash -n，最终脚本摘要 `2267010573a8fa958415067a933667fc6c4c114beee8c8a1213283926ec90418`。
