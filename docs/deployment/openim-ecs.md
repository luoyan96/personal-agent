# 新 ECS：OpenIM 科研微信（2026-10-05）

## 实际部署范围

用户授权在新 ECS 独立部署，入口为 `https://chat.acceptcat.com`，文件入口为 `https://files.chat.acceptcat.com`。旧 `research.acceptcat.com`、旧 ECS、原账号和模型配置继续保留。新 IFRC 实验室使用独立数据库、凭据和首个负责人邀请码；旧站账号不自动迁移。

- 新主机：阿里云广州，Ubuntu 22.04.5、x86_64、4 vCPU / 8 GiB / 50 GiB、5 Mbps。
- Docker Engine 29.8.2、Compose 5.6.0；科研 API / worker、OpenIM Server、MongoDB、Redis、etcd、Kafka、MinIO 分别运行。
- 业务公网入口为 Nginx HTTP / HTTPS；组件、IM API / WebSocket、科研 API 和 MinIO 均在 Docker 网络或宿主机 loopback 上。
- 科研契约 0.13.0、IM 桥 1.0.0、SQLite 迁移 015。生产入口不运行 seed、不自动创建测试账号、不隐式迁移。
- 测试在独立 `lab_sdk_qa_20261004_46c65a73` 完成，使用用户批准的虚构账号、随机密码、合成文件和合成录音。IFRC 开通码未用于测试。

## 来源和构建

当前固定软件源码为 `c3f58a4a88a3b0c0efdf2c868a556cc9d29f25ac`，源码归档 SHA256 `623eb87693bef1841d6bebe3a77879c2592f3474930ce7a95f17fdd000218ebc`，完整客户端归档 SHA256 `27b53c20386fad272fddf3475d904cdcc62fb64219375703e4dd5cfa6e0df1b0`。云端验证归档后解包至对应完整 SHA 目录，`/opt/research-openim/current` 指向该版本。公网首页与精确构建文件的 SHA256 一致（`8adfd087d42158deed7c470081835cd188596a8811f73025038f9e6c6ed7d636`）。后续本地验收说明提交不改变这份固定软件归档。

完整客户端来自仓库 `clients/openim`，Web 构建包含实际 OpenIM WASM / SQLite WASM、字体和媒体组件。Nginx 明确为 WASM 返回 `application/wasm`，并启用压缩。

派生服务器固定官方 `open-im-server` 提交 `865bb89517b48493ef9b1b5d9fde87fe0cb05cc7`（v3.8.3-patch.15），应用仓库 `rap-auth.patch` 后执行真实 Go 测试并重编全部 24 个程序。补丁传递可信 operator / platform / policy 上下文，并将两个 profile RPC 的 Ex 字段传给策略回调。运行时用预编译 Mage 启动器，避免启动时临时下载编译依赖。

构建主机到默认 Go 代理的连接不可用；本次使用 `GOPROXY=https://goproxy.cn`，保留默认 checksum database，`go mod verify` 实际通过。没有关闭依赖校验或放宽策略回调。

官方固定 MinIO 容器和归档二进制当时无法下载，因此本次 MinIO 从官方未修改源码构建：`RELEASE.2024-01-11T07-46-16Z` / `099e88516dd6450ff210606abb06f38051d3bb6a`，Go 1.22.12、Linux amd64。这属于自行构建镜像，不宣称与官方镜像逐字节相同。保留源码、构建来源、许可证和二进制 SHA256。Compose 的实际镜像 override 位于主机私有 ops 目录。

其他固定镜像通过官方 Linux amd64 内容导入；外层归档、容器 manifest / config 和 RootFS diff IDs 均在导入后核验。不能仅凭镜像标签判断导入正确。

## HTTPS 与证书

两个 A 记录均指向新 ECS。首次使用 DNS challenge 开通，随后切换为 HTTP webroot 自动续期。

- `certbot renew --dry-run --webroot --webroot-path /var/www/research-agent-acme --preferred-challenges http` 实际成功。
- 同方式实际换发正式证书成功，涵盖两个域名，有效期至 2027-01-02 UTC。
- `certbot.timer` 已启用并运行；续期 deploy hook 实际执行 `nginx -t` 和 reload。
- 临时 `_acme-challenge.chat` TXT 已在阿里云控制台暂停。未来无需手动改 TXT。

以上证明配置和本次实际换发成功，尚未到期执行的未来自动续期不作为已发生事件。

## 实际验收记录

根代码 `c3f58a4` 的 CI 实际通过：31 个测试文件 / 398 项，2 项生产 CLI / HTTP 测试、真实生产进程 B0、构建、类型和契约检查。独立完整客户端 typecheck、build:web 和四个固定 SDK 资源 / 全部静态引用检查也通过。

新站真实 IM 会话探针已返回 available，实际策略探针通过，协调会话已同步，返回正确 HTTPS / WSS 地址。该结果不代替双浏览器 SDK 验收。

MinIO 实际签名 PUT / GET 校验通过：服务器 loopback 与公网 HTTPS 均匹配原合成文件 SHA256；同对象未签名访问返回 403，临时对象和 bucket 已移除。

真实 SDK 验收发现并部署以下修复：首次协调会话不存在时采用 SDK 的真实会话对象，并等待记录后重试 native pin；辅助同步失败不导致登出，连接失败停止自动重复换 token。FlexibleSider / Virtuoso 修复 flex 高度链和窄屏隐藏整栏。浏览器媒体创建直接使用同一个官方 WASM singleton 的 ByFile 方法；Electron FullPath 路径保持。好友同步先读取真实完整好友列表，只导入缺失关系，并兼容固定 Go 序列化的零好友 `friendsInfo:null,total:0`；其他缺省计数或截断列表仍拒绝。此修复不清除旧欢迎消息。

首次成功上传的真实 SDK 文件暴露了下载地址为内部 HTTP 的问题。固定上游 `internal/api/third.go` 只通过 `X-Request-Api` 生成对象公开前缀；Nginx 现固定覆盖为 `https://chat.acceptcat.com/im-api`，不透传调用方值。新上传对象经 HTTPS `/im-api/object/` 转向文件域的真实签名地址；客户端不伪造或改写 URL。修复后的文件下载与实际语音收发 / 播放通过，原失败记录保留。

真实 HTTPS 权限阶段通过 15 个检查：Origin / CSRF、内部回调与管理员公网封闭、已知 IFRC 跨实验室拒绝、组群幂等、Agent 接受与真人接受分离、真实 IM 原生加入绕过拒绝、聊天与任务承接分离、资料当前授权、准确交付版本验收和实际 IM 群成员撤销。手工任务流程没有调用模型。

双浏览器 `89879723` 获得 13 项实际核心功能证据：实际 SDK 登录、协调会话与 native pin、真人同意和私聊、双向文字、普通字面 `@`、文件选择、反向拖放、录音取消、实际录音收发与播放、真实权限拒绝提示、刷新历史、刷新后原文件下载、320px 会话及发送布局。文件两端 SHA256 一致；语音实际下载最终进入文件域，解码 2.52 秒 / 120960 帧、RMS 0.039861、播放时间推进至 0.114194。正常刷新协调历史的已加载窗口 8→8，没有新增 1201；不宣称完整历史总量或全部未读变化来源。

该完整运行另外获得双网页平台 5 退出证据，但尾部捕获一次 `Object` 未处理拒绝，原报告保留 failed，未改写为全通过。窄复现 `1055c48a` 确认错误来自正常刷新时 `Getadvancedhistorymessagelist` 先于 SDK 就绪。`c3f58a4` 已补真实登录 / 连接 / 同步状态判断、会话 / 账号 / 请求世代与 mounted 校验，以及历史和已读调用的错误处理；实际当前失败仍提示，旧请求不写回，不全局忽略异常。

修复后线上 `0d540e22` 的专项回归通过 3 项，未捕获拒绝 / pageerror 均为 0：正常刷新恢复此前真实文字、文件与语音；320px 快速切换及发送边界；两端实际网页退出。两端先验证同一 IM token 有效，UI 退出 HTTP 200 后回到登录页，旧 token 变为服务端 `1506`，保留的真实 SDK 登录状态为 LoggedOut（1），再次发送明确拒绝 `10006`。中途挂起的诊断运行保留 aborted，不用超时伪造 SDK 拒绝。媒体功能证据、异常复现和修复回归共同组成最终验收，不把不同运行冒充同一次完整通过。

新的 Ex 转发补丁已部署到实际服务：7 个档案门禁通过。两个真人本人分别使用原始 plain / extended 接口，合法空 Ex 正对照返回成功；非空 Ex 返回策略拒绝 1002，随后实际资料保持一致。不能把坏参数错误代替策略拒绝。OpenIM 实际镜像 ID 为 `sha256:1a96f6bc780d672db845e30a9e7496aecb9083d84ee5bf1acfa0757a3fa33b59`；科研 API / worker 镜像为 `sha256:ae8c040c75992edc60855205616e4db036bee5a3e1ff781269737cc502f6e479`。活动容器源文件与固定归档及派生 IM 补丁一致。

三服务实际重启后，4 个恢复门禁通过：旧会话与 CSRF、已读位置与置顶版本、同一 IM 映射及真实群成员、已完成人类任务的版本和准确验收交付 / 材料。平台 3 后端退出通过 7 个检查；先确认同一 IM token 有效，退出后 RAP 会话与再发 token 返回 401，原 IM token 明确返回 `1506 TokenKicked`。云端真实 SQLite 只读 / query_only 核查两个精确退出会话已撤销、对应 IM lease 已删除。该结论不代替平台 5 浏览器退出或所有旧 QA 会话清理。

已发送真实 SDK 的两端文字及普通字面 `@` 消息，经真实回调镜像到科研消息；云端只读数据库确认回调回执、outbox mirrored、无 durable AI turn / action。字面 `@` 属于 101，不能作为语义 mention 106 验收。SDK 科研材料指针撤权后的显示刷新和真实模型安排 / 执行仍未独立验收。

## 运维和首次使用

运行目录 `/srv/research-openim` 和密钥文件限 root 访问，不提交 Git。首次负责人邀请码和注册说明通过私有本地文件交接，用户自行设置账号及至少 9 个字符的密码。负责人登录后可在客户端“实验室设置”创建成员邀请码并设置自己的模型 Key。

这台试用 ECS 当前到期日为 2026-11-04，续费设置未变更。容量数字只是本次小规模合成验收的主机观测，不代表更多真实成员或大附件的压力测试。

新 IFRC 实验室尚未配置模型；模型理解需求、提出分组、AI 实际执行和科学结果交付不包含在无模型的 IM 验收结论中。手动组群、独立接受邀请和人类任务交付另行验收。

实际一致备份位于新主机 `/srv/research-openim-backups/20261004T184707Z`，目录限 root 访问。备份只停止本项目的八个容器，包含科研运行目录（SQLite、运行数据和私有凭据）、证书目录、固定源码、客户端构建及 MongoDB / Redis / etcd / Kafka / MinIO 五个组件卷，另存 Nginx 配置、实际镜像 override 和版本清单。12 份文件的 SHA256 和 9 个 gzip 归档的完整流 / CRC 均通过；仅将 SQLite / WAL / SHM 提取到私有临时目录做恢复校验，`integrity_check=ok`、迁移 015、两名 QA 已停用、IFRC 邀请码未用，随后删除临时副本。该备份保存在同一 ECS，尚未做异地备份或完整组件恢复演练。

最初备份脚本的恢复步骤因相对 Compose 路径失败，服务已立即恢复；改成绝对路径后重新执行上述完整备份，脚本退出 0，八个容器实际恢复运行、API 健康、无 OOM。最后 OpenIM 的实际 Mage 检查退出 0 并确认全部服务正常。不得使用 `docker compose down -v`；恢复时必须使用本项目实际 override 和同一批数据。完整组件恢复仍需单独验证。

验收结束实际停用两名合成账号、撤销两枚测试邀请码，清理所有该实验室测试会话和 IM lease；最终只读数据库显示活跃会话 / IM lease 均为 0，保留三项任务与 34 条科研消息。两名原测试账号再登录均返回 401。IFRC 负责人邀请码仍可用，新 IFRC 和测试实验室均未配置模型。云端最终数据库、备份和运行回执已保存到本地受控运行目录，不提交 Git。

本次临时 root SSH 公钥已实际撤销，原服务器公钥保留；关闭连接复用后新的 SSH 连接明确返回 `Permission denied (publickey)`。本地专用私钥、公钥和合成浏览器密码文件已删除，IFRC 私有首次注册文件保留。当前未推送 GitHub。
