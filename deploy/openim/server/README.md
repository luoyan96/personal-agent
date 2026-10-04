# 科研 OpenIM Server 派生构建

来源：[openimsdk/open-im-server](https://github.com/openimsdk/open-im-server/tree/865bb89517b48493ef9b1b5d9fde87fe0cb05cc7)，固定实际源码提交 `865bb89517b48493ef9b1b5d9fde87fe0cb05cc7`，版本 `v3.8.3-patch.15`。原 [Apache-2.0 许可](OPENIM-SERVER-LICENSE.txt)随目录保留。

## 修改范围

[rap-auth.patch](rap-auth.patch) 修改官方网关和通用回调客户端，并增加 Go 测试：

- 网关绑定消息内部 SendID、MsgFrom 和平台到已认证的服务上下文；拒绝用户伪造系统通知和管理员平台。
- 同步及异步回调携带服务端确认的操作人、平台和策略版本；科研 API 不接受消息正文自报身份。
- 回调错误及日志不输出带密钥的 URL 或消息正文。

科研 API 的真实回调探针通过后才签发可用会话。科研群主固定为系统管理员，所有真人及 Agent 是普通成员；入群和资料授权继续经科研 API 校验。该补丁不实现模型执行，也不把媒体自动加入模型上下文。

## 构建

[Dockerfile](Dockerfile) 拉取并核对固定源码 SHA，严格应用补丁、格式化并测试受影响 package，使用固定 Mage 1.15.0 构建全部服务。运行阶段沿用固定官方镜像布局，用派生构建替换全部二进制，防止某些回调仍使用未修改实现。

启动器也在构建阶段通过 `mage -compile` 编译，容器使用该固定启动器运行原 `start` 任务。启动时无需再次编译 Mage 或访问 Go 模块源；原组件检查和服务启动逻辑继续执行。

默认模块源是 `https://proxy.golang.org`。需要区域代理时可执行 `docker build --build-arg GOPROXY=https://goproxy.cn -t research-openim-server:3.8.3-patch.15-rap1 deploy/openim/server`；Go checksum database 保持启用，下载后执行 `go mod verify`，不使用 `GOSUMDB=off`。代理支持校验数据库的说明见 [Goproxy.cn 官方说明](https://github.com/goproxy/goproxy.cn#is-it-safe-to-use-goproxycn)。

通过 [本地联调 Compose](../README.md) 构建运行。身份补丁的 Go package 测试已经在实际官方源码上运行通过；13 个服务程序与 11 个工具均通过 Linux amd64 编译。容器镜像构建、服务启动、真实 SDK 恶意帧拒绝和媒体互通仍需 Docker 环境验收。测试通过、编译通过与镜像运行分别记录。
