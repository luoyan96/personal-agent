# 新服务器正式试运行

适用于全新的 Ubuntu 22.04 x86_64 ECS，4 vCPU / 8 GiB / 50 GiB。沿用固定派生 OpenIM Server、内部组件网络和科研 API/worker，不启动 OpenIM Demo 账号服务。单进程各角色和当前内存上限供小实验室试运行；实际镜像构建、内存、磁盘及媒体增长须在新服务器记录。

本包不连接服务器、不安装系统软件、不读取旧机数据库/Key、不修改 DNS 或证书。服务器维护者负责 Docker/Compose、源码/客户端构建、HTTPS 证书、反代、备份和真实 SDK 验收。不得把 [本地合成入口](README.md) 当成生产入口。

## 地址与独立数据

| 配置 | 这次新入口 |
| --- | --- |
| `APP_ORIGIN` | `https://chat.acceptcat.com` |
| `OPENIM_PUBLIC_API_URL` | `https://chat.acceptcat.com/im-api` |
| `OPENIM_PUBLIC_WS_URL` | `wss://chat.acceptcat.com/im-ws` |
| `OPENIM_PUBLIC_FILE_URL` | `https://files.chat.acceptcat.com` |
| 服务侧 OpenIM | `http://openim-server:10002`，仅 Compose 内部 |
| 服务侧 callbacks | `http://research-api:3217/api/v1/im/callback/<private-key>`，仅 Compose 内部 |

文件域名使用独立域名根，避免签名 URL 的路径或 Host 被反代修改。其证书、DNS、浏览器上传 CORS/OPTIONS、真实 SDK 文件下载和录音播放都要实测。MinIO `publicRead=false`；不要为排障改成公开桶。普通 IM 文件是发送者主动分享，不能自动变成科研任务材料。

在 **新建、空的、root 管理的** 目录准备，例如 `/srv/research-openim`。脚本拒绝未标记的非空目录、合成账号文件、已完成运行目录缺失密钥、地址变更以及宽松的文件权限。重复使用相同参数保留原随机密钥；不会生成数据库、实验室、密码或 Token。运行目录不能提交 Git。

```sh
node deploy/openim/prepare-production.mjs \
  --runtime /srv/research-openim \
  --origin https://chat.acceptcat.com \
  --im-api https://chat.acceptcat.com/im-api \
  --im-ws wss://chat.acceptcat.com/im-ws \
  --files https://files.chat.acceptcat.com
```

宿主没有 Node 24 时，可用 `node:24-bookworm-slim` 一次性容器执行同一命令。源码只读挂载到 `/app`，工作目录 `/app`，运行目录按**相同绝对路径**读写挂载到 `/srv/research-openim`；在 root 下执行并先确认宿主目录为空。不要输出完整 Compose 配置、`compose.env`、`webhooks.yml` 或密钥文件。

## 构建、迁移和首次 IFRC 开通

以下命令都在已审核源码根执行，两个 Compose 文件必须同时使用。生产 override 使用独立项目名 `research-openim-production`，与本地合成项目的组件卷分离。新实例首次启动前检查同名旧项目/卷不存在。科研数据绑定新运行目录，Mongo/Redis/Kafka/etcd/MinIO 使用独立持久卷。

```sh
docker compose --env-file /srv/research-openim/compose.env \
  -f deploy/openim/compose.yaml -f deploy/openim/compose.production.yaml config --quiet
docker compose --env-file /srv/research-openim/compose.env \
  -f deploy/openim/compose.yaml -f deploy/openim/compose.production.yaml build research-api openim-server
docker compose --env-file /srv/research-openim/compose.env \
  -f deploy/openim/compose.yaml -f deploy/openim/compose.production.yaml \
  run --rm --no-deps research-api node deploy/openim/run-production.mjs migrate
docker compose --env-file /srv/research-openim/compose.env \
  -f deploy/openim/compose.yaml -f deploy/openim/compose.production.yaml \
  run --rm --no-deps -e OPERATOR_ID=ecs_operator research-api \
  node deploy/openim/run-production.mjs bootstrap
docker compose --env-file /srv/research-openim/compose.env \
  -f deploy/openim/compose.yaml -f deploy/openim/compose.production.yaml up -d
```

生产 API/worker 启动不自动迁移、不 seed、不创建合成账号。显式 `migrate` 应重复执行检查幂等，最终为 **015 / contracts 0.13.0 / bridge 1.0.0**。已有合法旧库升级继续使用已应用迁移 checksum 校验；此新实例不接旧机数据。015 不回填旧私人消息 outbox。以后升级前先停止本项目 API/worker、备份并检查迁移；不要在仍有写入者时跑迁移。

`bootstrap` 默认创建 `lab_ifrc` / `IFRC 实验室`，七天、单次负责人开通码。原码只留在宿主 `/srv/research-openim/research/bootstrap/lab_ifrc.json`，目录 0700、文件 0600；数据库和维护审计只保存摘要。把该原码经已经获准的私密交接方式交给负责人，**不得用公开日志输出或写入 shell 参数/历史**。负责人在新网页选择邀请码注册，自设用户名、显示名和超过八位的密码，然后登录。邀请码消费和负责人授权在同一事务中完成。之后由负责人在实验室设置中创建成员邀请码和配置自己的模型 Key。

固定私有交接文件及 request IDs 保证任何一步中断后重试不签发第二个码；注册后再执行只输出 `used` 状态。已有同名实验室但交接文件缺失时拒绝接管；到期/撤销不会自动更新原码。需要重开时走既有审计维护命令，不删除数据库或改写历史计数。

`OPERATOR_ID` 必填、保留首次值。可用非秘密环境参数 `BOOTSTRAP_LAB_ID`、`BOOTSTRAP_LAB_NAME`、`BOOTSTRAP_INVITE_DAYS`（1–29）为其他真实或合成验收实验室单独开通；邀请码交接文件默认按实验室分开。可指定 `BOOTSTRAP_INVITE_FILE`，但必须位于同一 `/data/bootstrap/` 私有目录内。AI 平台开关启用不代表实验室模型可用：新实验室无模型 Key、默认关闭，不读取旧 Key。

## HTTPS 与可信来源

使用 [Nginx 模板](nginx.production.conf.template)，渲染明确的域名、证书和客户端构建绝对路径后执行 `nginx -t`。模板服务完整 `clients/openim` 页面，`/api/` 保持原路径、Origin 和 cookie；`/im-api/` 去掉前缀，`/im-ws` 代理真实 WebSocket。API、WS、MinIO 和管理台宿主端口仍只绑定 loopback，云安全组仅开放所需 HTTPS/HTTP 及维护通道；数据库/队列不发布宿主端口。不能将任意 `file://` 或任意浏览器 Origin 加入可信来源。

公网 `/api/v1/im/callback/` 返回 404，反代清空可信回调 headers；OpenIM 从内部 Docker 网络直连 callback。只有含秘密 key、真实派生上下文 headers 和当前有效 RAP 权限的请求被接受。不要经公网反代 callback，不要关闭 before 回调，也不要把 `failedContinue` 改为 true。管理 Token 签发入口不发布给浏览器，本人登录 Token 只由 RAP 当前会话换发。

若保留辅助旧网页，模板 `/research/` 指向另一个 `apps/web` 构建目录，构建时使用 `vite build --base=/research/`。新版 OpenIM 客户端已自带任务、邀请和实验室设置；不需要辅助网页时删除该 location 与 `__WEB_DIST__` 占位符，不把未渲染模板上线。

## 探针和真实验收

`run-production.mjs check` 只检查生产配置、迁移历史、数据库写读和科研 blob 存储；输出 `imTransport=not_verified`、`harness=not_verified`。`/api/v1/health/ready` 同样只代表科研 API 的数据库/存储就绪。真实 OpenIM 就绪必须由登录用户请求 `imSession`/`imSyncConversation`，后台通过实际 updateUserInfo callback 探针重新检查身份策略，才能返回 `available` / `ready`。未配置、不可达、未启用可信补丁明确 `unavailable`。普通官方镜像加环境变量不能通过策略探针。

```sh
docker compose --env-file /srv/research-openim/compose.env \
  -f deploy/openim/compose.yaml -f deploy/openim/compose.production.yaml \
  run --rm --no-deps research-api node deploy/openim/run-production.mjs check
```

负责人注册前使用另一合成验收实验室和两个自设合成账号完成真实 SDK 验收，不能消费 IFRC 开通码或使用负责人私人材料/Key。验收至少记录：HTTPS 登录及 Secure cookie、Origin/CSRF 拒绝、联系人请求/同意、待接受人无法进群、加入群不等于任务承接、跨实验室拒绝、普通文字/@ 不调用模型、真实文件双向字节校验、录音发送/播放、协调 Agent 唯一置顶、科研指针重新授权、退出/停用后 IM 发送拒绝和 Token 撤销、API/worker/IM 重启持久化。真实 AI 调用仅在实验室负责人另外配置可用 Key 后验收；执行成功不能计作指定 revision 的人工验收。

合成验收结束用 `run-production.mjs operate` stdin JSON 的既有维护通道撤销邀请码/停用账号，保留审计。不要删除真实实验室或把合成测试库覆盖到正式库。离线脚本/单测通过不计作 Docker、HTTPS、SDK 或真实模型验收。

## 数据保留与回退

`docker compose ... down` 保留卷；不用 `down -v`。备份须同时考虑科研 SQLite+blobs、`lab-credentials.key`、IM身份/群映射、Mongo、对象存储及组件状态，保护私密交接文件和全部服务秘密。科研原恢复工具只覆盖科研库/附件，不能恢复整套 IM 数据。新旧代码和 schema 不匹配时不能直接回退启动；恢复到隔离新目录并重新核实映射/权限/Token。内存或磁盘不足时停下来保留数据，不能靠关闭 callback 权限校验换取可用。

源码版本、Apache-2.0 归属与派生补丁见 [UPSTREAM.md](UPSTREAM.md) 和 [server/README.md](server/README.md)。
