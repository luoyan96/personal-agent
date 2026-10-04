# OpenIM 本地联调服务

全新 ECS 的真实 IFRC 开通与 HTTPS 试运行使用 [生产部署说明](PRODUCTION.md)、独立 production override 和生产入口；以下 synthetic 入口不用于真实成员。

新 ECS 的实际软件版本、镜像来源、线上验收和运维结果见[部署与验收记录](../../docs/deployment/openim-ecs.md)。以下说明的是独立本地联调配置，其历史静态检查不替代线上实测记录。

用于完整 `clients/openim` 客户端的独立合成验收。保留科研 API / worker，替换 OpenIM Demo 自带的账号服务；没有 OpenIM Chat Server。客户端说明见 [完整科研客户端](../../clients/openim/RESEARCH-CLIENT.md)。当前配置文件已生成与静态解析，容器运行、SDK 双账号消息及媒体上传仍需实际 Docker 环境验收。

## 环境与端口

需要 Linux Docker Engine + Compose，或已完成安装的 Windows Docker Desktop / WSL2。整套服务包含 MongoDB、Redis、etcd、Kafka、MinIO、OpenIM Server、科研 API 与 worker；本机或独立测试主机应留出运行内存。该配置使用单个 push / transfer 进程与测试资源上限，不作为生产容量方案。

| 入口 | 地址 |
| --- | --- |
| 新 React 客户端 | `http://127.0.0.1:4317` |
| 科研 API | `http://127.0.0.1:3217` |
| OpenIM API | `http://127.0.0.1:15002` |
| OpenIM WebSocket | `ws://127.0.0.1:15001` |
| MinIO 文件 | `http://127.0.0.1:15005` |
| MinIO 本地维护 | `http://127.0.0.1:15004` |

数据库、消息队列与服务发现不发布宿主机端口。发布的五个端口均只绑定 `127.0.0.1`。远程主机使用此配置时需让这些地址可从开发电脑访问（例如同端口 SSH 转发）；不能只修改 API 地址而保留不可访问的文件和 WebSocket 地址。

## 准备与启动

在仓库根目录运行：

```sh
node deploy/openim/prepare-local.mjs
docker compose --env-file .runtime/openim-local/compose.env -f deploy/openim/compose.yaml config --quiet
docker compose --env-file .runtime/openim-local/compose.env -f deploy/openim/compose.yaml up -d --build
docker compose --env-file .runtime/openim-local/compose.env -f deploy/openim/compose.yaml ps
```

准备脚本产生独立随机密钥及组件密码，只写入被 Git 忽略的 `.runtime/openim-local`。重复运行复用密钥，不更换数据库凭据。也可传入单个绝对路径指定运行目录，并在后续命令中使用该目录的 `compose.env`。不要打印完整 Compose 配置或提交运行目录。

服务镜像的配置目录与字段依据固定 `open-im-server v3.8.3-patch.15` 核实。生成的 `webhooks.yml` 和 `start-config.yml` 必须实际存在；Compose 拒绝自动创建缺失挂载文件。修改 callback key 后须重新准备配置并重启两侧服务。完整回调列表见 [桥接接口](../../docs/development/openim-bridge-contract.md)，不得在回调不可用时把 `failedContinue` 改成 `true`。

Compose 构建 [派生 OpenIM Server](server/README.md)：固定官方源码、应用发送人/平台校验和可信回调上下文补丁、运行 Go 测试，再替换官方镜像的全部服务二进制。原版镜像不满足本产品的身份校验条件。科研 API 通过真实服务回调探针确认策略生效，单独设置环境标记不会返回就绪。

API 容器仅允许 `NODE_ENV=test`，创建三个真实密码会话支持的合成账号，账户文件为运行目录 `research/accounts.json`；重复启动保留账号、聊天与科研数据库。负责人为 member_A，其他成员为 member_B / member_C。该入口拒绝生产模式，不能用于 IFRC 真实成员注册。文件权限适配入口把 Windows 挂载密钥复制到容器私有目录，保持科研服务已有密钥格式与权限检查。

AI 调用仍需负责人配置实验室模型；此配置不读取已有实验室 Key，也不内置假模型。浏览器以 `/api` 同源代理调用科研 API，桌面端使用可信开发/部署网页 Origin 和真实 SDK，不能绕过 Origin 校验。

## 停止与保留数据

```sh
docker compose --env-file .runtime/openim-local/compose.env -f deploy/openim/compose.yaml down
```

该命令保留数据库和对象存储卷。不要加 `-v`，除非已决定清空整个合成验收环境。开发客户端启动、独立 pnpm 10 依赖与 Electron 构建请见完整客户端自身说明。

## 验收事实

静态配置通过不能证明真实服务启动。交付前须记录服务启动及健康、两个账号经 SDK 互发消息、真实文件上传/下载及校验、录音发送/播放、待接受成员无法进群、跨实验室访问拒绝、科研消息指针重新授权、退出后会话失效和进程重启持久化。真实模型调用与合成科研流程验证分别记录。

版本、来源和许可见 [UPSTREAM.md](UPSTREAM.md)。
