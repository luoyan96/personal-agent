# OpenIM 服务配置来源

本目录 Compose 根据 [openimsdk/openim-docker](https://github.com/openimsdk/openim-docker/tree/55a2d29a813388bf6ad9ae7c2715636724c1400d) 固定提交 `55a2d29a813388bf6ad9ae7c2715636724c1400d` 改编。上游许可保存在 [OPENIM-DOCKER-LICENSE.txt](OPENIM-DOCKER-LICENSE.txt)。

采用其服务组件组合、镜像版本及 `IMENV_*` 覆盖方式；删去 Demo 账号服务、Demo Web/Admin 客户端与监控，新增科研 API/worker。数据库端口限制在 Compose 网络，媒体/API 端口绑定本机，公开演示密码改为运行目录随机密码，不输出凭据。上游源码和运行数据仍留在独立参考目录。

| 镜像 | 固定版本 |
| --- | --- |
| OpenIM Server 派生镜像 | `research-openim-server:3.8.3-patch.15-rap1`，由本目录源码构建 |
| OpenIM Server 基础运行镜像 | `openim/openim-server:v3.8.3-patch.15` |
| Go 构建基础 | `golang:1.22.12-alpine` |
| MongoDB | `mongo:7.0.28` |
| Redis | `redis:7.0.0` |
| Kafka | `bitnamilegacy/kafka:3.5.1` |
| etcd | `bitnamilegacy/etcd:3.5.13` |
| MinIO | `minio/minio:RELEASE.2024-01-11T07-46-16Z` |
| 科研 API 基础 | `node:24-bookworm-slim` |

镜像尚未拉取，表中为 tag pin，未声称验证 image digest。首次真实启动应保存实际版本与 digest 到 Git 外验收记录。

派生服务固定源码提交 `865bb89517b48493ef9b1b5d9fde87fe0cb05cc7`（上述 tag 的实际 commit），应用 [身份补丁](server/rap-auth.patch)。构建方式和修改范围见 [server/README.md](server/README.md)；服务源码原 Apache-2.0 许可见 [OPENIM-SERVER-LICENSE.txt](server/OPENIM-SERVER-LICENSE.txt)。

生成配置字段核实来源为 [OpenIM Server Dockerfile](https://github.com/openimsdk/open-im-server/blob/v3.8.3-patch.15/Dockerfile)、[MongoDB 配置](https://github.com/openimsdk/open-im-server/blob/v3.8.3-patch.15/config/mongodb.yml)、[回调配置](https://github.com/openimsdk/open-im-server/blob/v3.8.3-patch.15/config/webhooks.yml)和[进程配置](https://github.com/openimsdk/open-im-server/blob/v3.8.3-patch.15/start-config.yml)。源码部署与对应组件分别适用其自身许可；配置采用记录不改变客户端原许可。
