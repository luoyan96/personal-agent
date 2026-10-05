# 新 ECS：OpenIM 科研微信（2026-10-05）

## 最新更新：个人注册、自然聊天与模型设置

2026-10-05 17:33 北京时间发布固定软件 `68d0592de941fa0f47907ba9df6e86fddd83f250`，前端 / API / worker 同一源。当前指针 `/opt/research-openim/releases/68d0592de941fa0f47907ba9df6e86fddd83f250`，Nginx root为其 `clients/openim/dist`；API / worker镜像 `sha256:b9ecbbe826f4fa37126c98241b082cf780c370bb828596583226e60979c216fc`。契约0.14.0、聊天1.3.0、IM桥1.0.0、显式迁移016。

- 个人注册只要求显示名、唯一用户名、原值最少8字符密码，邀请码自愿加入团队；个人空间与IFRC隔离。准确用户名发现 / 申请 / 同意后跨空间私聊，群、科研任务与材料仍按原权限。普通Agent输入直接发文本，档案 / 性格 / 获准记忆持续，科研协作折叠，不自动创建任务或群。
- “模型设置”按本人管理DeepSeek / 通义千问 / 豆包多配置、启停 / 默认 / 加密Key，固定官方地址且不回显明文；明确个人选择后不静默回退团队Key。未选择个人配置的原IFRC保持原模型兼容。自定义地址与通义 / 豆包真实Key调用未验收。
- 外层包SHA256 `fedc0bb093696493c25b47e13b808983247e6e4f01319b7072c3c3d587fc0a90`，源码归档 `9e73082537862c203db649610d4518a9ea170ef2890b46d80331c7e861ef76c1`，Web归档 `043b5bc48c66d2e9a83f485a64c2ff4e0fd8c8ea25e7d44a10c3d7cb9479543d`。云端离线从旧依赖镜像编译contracts / runtime / API，22份变更后端文件在镜像与归档逐hash一致；最终公网首页SHA256 `896450e229d810aef3ed8c5747efe5482a50118725aaf17deedb019cff3dc090`实际精确核验。
- prepare只迁移线上只读一致快照，016重复两次和旧行哈希保持通过。最终激活停本项目API / worker / OpenIM，完整一致备份 `/srv/research-openim-backups/20261005T093246Z` 的12checksums / 9gzip / 隔离SQLite恢复integrity ok / 迁移15；正式显式016逐旧表行hash和准确键转换核对，70旧表 / 激活前2281行保持。更早prepare3136行与激活前差855，仅两保存v15副本的临时 `chat_pages` 2168→1313变化，其他69表计数不变，与旧代码15分钟快照过期清理一致；两阶段差不能混作016迁移丢数据。
- 初始prepare白名单未允许contracts/package.json，拒绝后保留失败release / 日志并修正。首次activate即时读旧首页hash不匹配，原脚本恢复015 / 镜像 / current后最后health读取失败，按守卫核验数据库与旧backup一致后恢复旧八服务。第二次30秒公网门禁因新release根目录700、www-data不能读index而失败，自动完整回退成功。修正仅新release权限为755，真实以www-data读精确index成功后第三次activate成功。
- 实际prepare helper SHA为 `c211a8` 前缀版本，实际成功activate / verify helper SHA256为 `67067eee5b4f7ad711eb9bc9b93027a4c2a03ce4621921e6e9d77f5e79ae1e1b`；本地后来增加mkdir后chmod与www-data提前门禁的 `3f136c4` helper未上传 / 未执行，不能混作线上成功源码。原失败v16数据库及WAL / SHM、一致副本均私有保留。回退必须同时恢复015数据库、旧镜像、current与Nginx，再核验ready及精确旧首页；禁止只回退镜像、down -v或删卷。
- 根CI 34文件 / 446项与2项生产入口通过，精确完整客户端类型 / Web / 四SDK资源通过。线上两隔离个人账号14门禁闭合：桌面 / 320px八字符注册、SDK个人空间、普通Agent草稿 / 折叠、三家停用合成Key管理、本人配置隔离、准确用户名好友申请 / 接受、真实SDK101双向消息、UI退出和原RAP session401。首两注册门禁引用原通过运行，未新增第三人；双方clientMsgID / sendID / recvID一致、status2。pageerror0，console诊断保留，不声称全零。
- 17:40 / 17:41 既有IFRC正常登录页面普通文本入口连续得到两轮真实自然回复：先自我介绍，再接上文改成口语短句；成功回复是普通气泡，编辑区可继续输入，协作折叠。没有读取 / 复制真实Key、密码或改变负责人配置与登录状态；普通输入不重放旧需求。该证据仅证明日常短对话，不代替科研编排 / 执行 / 交付、通义 / 豆包真实调用、媒体或原生Electron新验收。
- 当前8服务实际运行，其他6镜像未变，HTTPS ready / contract0.14 / schema16 / 源码与首页verify通过。本轮沿用已有Workbench，仅正常会话刷新，未加新SSH或云权限，未推GitHub。备份仍在同ECS；没有异地 / 完整组件恢复演练。
- 两名合成个人账号均已正常UI退出 / 原RAP session401，并通过既有审计CLI准确停用（version2），活跃RAP sessions及IM leases均0，历史保留；无邀请码使用或真实账号改动。窄console诊断分类为预期401、浏览器关闭窗口提示，以及已捕获但来源未分类的登录 `null.map`。后者未阻止14项实际流程，记录为后续定位限制，未据pageerror0冒称console零错误；未因日志扩展账号 / 模型测试。
- 云回执 `/opt/research-openim/ops/personal-chat-68d0592de941/deployment-verified.json`；本机仓库外 `.runtime/personal-chat-20261005/{deployment-verified,preparation-and-rollback,saved-snapshot-counts,live-natural-ui-proof}.json`、`live-natural-chat.png`、`live-model-settings.png`，双浏览器报告 `cloud-review/runs/dce9b912-4378-4ef4-a688-e582f988748b/report.json`。原沙盒联网、IM登录次数假定、按钮图标选择器与报告状态序列化问题保留，按明确范围续跑，只修测试脚本。

## 历史更新：真实 AI 连续回复与显示修复

2026-10-05 13:58 北京时间，固定软件 `979b7c10afb0b75b2a72572431cc08fb5195cf47` 同时发布前端、API 和 worker；`/opt/research-openim/current` 指向该 release，Nginx root 为 `/opt/research-openim/releases/979b7c10afb0b75b2a72572431cc08fb5195cf47/clients/openim/dist`。API / worker 镜像 `sha256:e2402ee40c51e050e40e1ab0597dbd756f2e675e629e034c0b93c9cd77da0caa`。契约 0.13.1、IM 桥 1.0.0、迁移 015 不变。

- 原失败来自生成式内部 schema 过长和输入未预留预算；采用精简按权限提供的协议、明确列名与稳定 ID 字典，完整保留非空资料和既有 20 条授权消息窗口。默认仍为输入与输出合计 4000 Token / 90 秒；实际用量超过总量仍拒绝。固定官方适配器的缓存读 / 写与未缓存输入独立相加；不重复加 reasoning，未知或矛盾计量拒绝接受回复。
- 输入区使用状态摘要和详情弹窗，编辑区保留可用高度。真实 canonical 保存成功后才发当前会话的跟随滚动事件；权限正文、模型回复和状态卡异步增高时保持最新，主动向上读历史停止跟随，旧会话 / 账号事件不能写回。没有伪造 SDK 消息或模型结果。
- 根共享 CI 32 文件 / 419 项、生产入口 2 项、B0 / 构建 / 类型 / 契约通过；最终客户端整合类型、Web 构建及四个 SDK 资源通过。实际组件的明确合成传输输入区 6 项、滚动 12 项通过，覆盖 >100ms 权限正文、5 秒状态增高、历史阅读、路由与 320px；这些不代替真实云验收。
- 13:58 / 13:59 在用户已有 IFRC 登录页面中发送自行编写的短测试，真实依次收到“收到一”“收到二”。最终缓存正规化后的输入 / 输出为 895 / 21 和 915 / 299，耗时 584 / 1531ms；各总预算仍为 4000 / 90 秒。两条模型消息均经 canonical / 真 SDK 展示，无手动滚动，底部距离 0，发送后编辑区 85px。最新请求模型消息 1、动作 / 草案均 0。总控没有提取、复制或改动真实密码、邀请码和 Key；worker 正常使用实验室已有配置调用模型，没有修改负责人配置或注销其会话。
- 激活前一致备份 `/srv/research-openim-backups/20261005T055755Z`：12 个 checksum / 9 个 gzip 完整流通过，隔离 SQLite integrity ok / 迁移 15。额外备份当时当前前端及 hash；此前 `20261005T053044Z`、`20261005T045827Z` 和初次备份保留。备份仍在同 ECS，未验收异地或完整组件恢复。
- 外层 / 源码 / Web 归档核验，四份变更后端源文件在 API、worker 容器内与源归档一致；公网 HTML 精确 hash `c0e0c8bd5c753e4b0b2a8c7c179860934075ec7e3c33ead4d8535f8fa82436ca`。最后两条真实消息后再次检查 `/api/v1/health/ready` 为 ok / 0.13.1，八服务运行 / API healthy / 无 OOM。其余六个镜像未变，没有数据迁移、新 SSH 授权或 GitHub 推送。
- 前一版 `7098a89efcc65bf23e833565d246eac2afe491f3` release 与镜像 `sha256:0cfb94cc2194ac3318b682ae4953abbedc1da332743059bd370c419d68b5caca`保留；对应 Nginx 配置保存于 `/opt/research-openim/ops/ai-reply-979b7c10afb0/research-openim-production`。回退时同步恢复旧镜像标签、配置和 current 指针，用三份实际 Compose 配置只重建 API / worker，核对 ready 与精确旧首页；禁止 down -v。
- 实际云回执 `/opt/research-openim/ops/ai-reply-979b7c10afb0/deployment-verified.json`、`/opt/research-openim/ops/ai-reply-final.json`；本机父目录 `.runtime/ai-reply-20261005/{deployment-verified,diagnostic-final,live-closure-ui,live-verified}.json` 与 `live-final-replies.png`。初版 a7 只有首条成功，后续预检失败、输入区和滚动问题以及测试工具失败记录均保留。旧缓存计量不能回算，不能把旧未缓存输入数字当完整用量。本轮只验收短问答和连续显示，真实科研规划 / 组群 / 执行 / 交付仍待单独完成。

## 历史更新：默认需求入口已上线

2026-10-05 09:58 北京时间，前端固定为 `d99c884dcc9c9dc3165949e82fd4568fdb4fa1b2`。登录就绪后打开实际“需求与协作”，用户可直接输入目标 / 材料 / 交付 / 截止时间；模板只填草稿。保留现有私聊 / 群聊深链接及刷新，主动导航不被轮询切走；320px 长介绍保持单行，标题可读。

- 这是客户端静态更新。Nginx root 为 `/opt/research-openim/client-releases/d99c884dcc9c9dc3165949e82fd4568fdb4fa1b2/clients/openim/dist`；API / worker 镜像仍为下节 d7 的 b2f1edf，`/opt/research-openim/current` 仍指向 d7 后端 release。契约 / 迁移不变，未重建后端或重测媒体。
- 源码与 Web 归档、外层包 SHA256 核验，公网 HTML 与精确最终构建一致；独立客户端整合类型、最终 Web 构建和四个 SDK 资源检查通过。隔离 Edge / 新合成实验室真实 HTTPS / SDK 七项通过，pageerror 0；默认需求、模板草稿、协调刷新、显式群刷新、通讯录导航、手机标题 / 输入 / 发送 / 返回列表可用。未发送测试消息或调用模型，未使用真实账号 / Key。
- 回退配置 `/opt/research-openim/ops/demand-entry-20261005T015857Z/research-openim-production`，上一前端 b404 和原 d7 前端保留。先恢复该配置，再 `nginx -t` / reload；核对实际公网首页，不能只按 reload 命令返回判断切换完成。
- 首次立即核对首页时得到旧 hash，脚本实际回退；增加 20 秒内的新首页收敛检查后成功，失败日志 `demand-entry-deploy.initial-failed.log` 保留。健康入口必须使用 `/api/v1/health/ready`；`/readyz` 会返回 SPA HTML，不能作为 API readiness。最终真实健康入口返回 HTTP 200 / status ok / 0.13.1。
- 10:00 审计停用本批合成账号、撤销邀请码，RAP 活跃会话和 IM lease 0，测试历史保留；本机合成密码 / bootstrap 文件已移除。10:04 再核对八个服务运行、API healthy、无 OOM、精确首页、Nginx root 和后端镜像未变。云回执 `/opt/research-openim/ops/demand-entry-closure.json`，本机父目录 `.runtime/demand-entry-20261005/closure.json` 及桌面 / 手机截图。不推 GitHub；真实 AI 理解 / 协作安排 / 科研交付仍需另行验收。

## 历史更新：注册修复已上线

2026-10-05 08:26 北京时间发布固定软件 `d7cbe97abdd6271f459918727bf00f7c2bab154c`，`/opt/research-openim/current` 已指向该 release。当前科研契约 **0.13.1**、IM 桥 **1.0.0**、迁移 **015**。后续本地交接文档提交不改变软件归档。下文初次部署 / SDK 媒体结果保留受测基线 `c3f58a4`，本轮未重新做整套媒体或真实模型验收。

- 密码统一为至少 8 个字符，无复杂度组合或独立密码长度上限，不 trim 密码；整体请求大小限制保持。用户名 / 邀请码只 trim 首尾，非法用户名改为中文提示，不显示 Zod issue JSON。
- 根 CI 31 文件 / 400 项和 2 项生产入口测试通过，构建 / 类型 / 导出 / B0 通过；独立客户端 typecheck、3 项 auth 测试、build:web 和四个 SDK 资源通过。两个前端入口真实本地 API 浏览器分组 18 项及稳定错误布局 2 项通过。
- 源码归档 SHA256 `dd7a1af5b3367dce1ff51c3f1b386ff87e112db61dced084f6943abceacc9e13`；客户端归档 SHA256 `fbf7f9bdc688f1c97936da0e061c24708d4657c9ba49cf406e18948f3dcccac8`。云端核验后构建，API / worker 实际镜像为 `sha256:b2f1edf0ee51480720f0b3f7e1deef08ccd133184a9307c38d4e87cad62730b0`；四个变更源文件实际容器 hash 和归档一致，公网 HTML 与本次 dist 完全一致。
- 更新前一致备份 `/srv/research-openim-backups/20261005T002607Z` 的 12 个 checksum / 9 个 gzip 完整流通过；独立恢复 SQLite integrity ok / 迁移 015。旧 release 和 `research-openim-api:before-registration-c3f58a4` 保留供回退。备份仍在同 ECS，未验收异地 / 完整组件恢复。
- 独立合成实验室真实 HTTPS 7 项通过：7 位拒绝、非法用户名中文与不回显内部信息、8 位注册、首尾空白规范化、8 位登录、负责人角色及退出后旧 cookie 401。随后审计 CLI 撤销该测试邀请码、停用账号；测试活跃会话 0。IFRC 开通码 / 真实账号未用未改，没有新增 SSH 授权。
- 最终八个服务实际运行，API healthy / HTTPS ready / 无 OOM；OpenIM 实际镜像仍为 `sha256:1a96f6bc780d672db845e30a9e7496aecb9083d84ee5bf1acfa0757a3fa33b59`。云端非秘密回执 `/opt/research-openim/ops/registration-closure.json`，本机父工作目录 `.runtime/openim-cloud-20261004/registration-closure.json` 和新站截图 `registration-public-min8.png`。
- 初次校验误用根目录包名导入，在备份 / 激活前失败；修正为固定 dist 路径并核验脚本后重跑退出 0，失败和成功日志保留。Workbench 旧上传会话过期经重新登录解决。未推 GitHub。

## 实际部署范围

用户授权在新 ECS 独立部署，入口为 `https://chat.acceptcat.com`，文件入口为 `https://files.chat.acceptcat.com`。旧 `research.acceptcat.com`、旧 ECS、原账号和模型配置继续保留。新 IFRC 实验室使用独立数据库、凭据和首个负责人邀请码；旧站账号不自动迁移。

- 新主机：阿里云广州，Ubuntu 22.04.5、x86_64、4 vCPU / 8 GiB / 50 GiB、5 Mbps。
- Docker Engine 29.8.2、Compose 5.6.0；科研 API / worker、OpenIM Server、MongoDB、Redis、etcd、Kafka、MinIO 分别运行。
- 业务公网入口为 Nginx HTTP / HTTPS；组件、IM API / WebSocket、科研 API 和 MinIO 均在 Docker 网络或宿主机 loopback 上。
- 当前科研契约0.14.0、聊天1.3.0、IM桥1.0.0、SQLite迁移016。生产入口不运行seed、不自动创建测试账号、不隐式迁移；当前发布与回退按本文最新更新。
- 测试在独立 `lab_sdk_qa_20261004_46c65a73` 完成，使用用户批准的虚构账号、随机密码、合成文件和合成录音。IFRC 开通码未用于测试。

## 来源和构建（初次部署基线）

初次部署固定软件源码为 `c3f58a4a88a3b0c0efdf2c868a556cc9d29f25ac`，源码归档 SHA256 `623eb87693bef1841d6bebe3a77879c2592f3474930ce7a95f17fdd000218ebc`，完整客户端归档 SHA256 `27b53c20386fad272fddf3475d904cdcc62fb64219375703e4dd5cfa6e0df1b0`。云端验证归档后解包至对应完整 SHA 目录，当时 `/opt/research-openim/current` 指向该版本。该批公网首页与精确构建文件的 SHA256 一致（`8adfd087d42158deed7c470081835cd188596a8811f73025038f9e6c6ed7d636`）。当前指针与软件归档见本文开头的最新更新记录。

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

运行目录 `/srv/research-openim` 和密钥文件限 root 访问，不提交 Git。首次负责人邀请码和注册说明通过私有本地文件交接，用户自行设置账号及至少 8 个字符的密码。负责人登录后可在客户端“实验室设置”创建成员邀请码并设置自己的模型 Key。

这台试用 ECS 当前到期日为 2026-11-04，续费设置未变更。容量数字只是本次小规模合成验收的主机观测，不代表更多真实成员或大附件的压力测试。

初次无模型 IM 验收时，新 IFRC 尚未配置模型；该历史结果不包含模型理解需求、提出分组、AI 实际执行和科学结果交付。当前 IFRC 已启用模型及实际短问答证据见最新更新。手动组群、独立接受邀请和人类任务交付另行验收。

实际一致备份位于新主机 `/srv/research-openim-backups/20261004T184707Z`，目录限 root 访问。备份只停止本项目的八个容器，包含科研运行目录（SQLite、运行数据和私有凭据）、证书目录、固定源码、客户端构建及 MongoDB / Redis / etcd / Kafka / MinIO 五个组件卷，另存 Nginx 配置、实际镜像 override 和版本清单。12 份文件的 SHA256 和 9 个 gzip 归档的完整流 / CRC 均通过；仅将 SQLite / WAL / SHM 提取到私有临时目录做恢复校验，`integrity_check=ok`、迁移 015、两名 QA 已停用、IFRC 邀请码未用，随后删除临时副本。该备份保存在同一 ECS，尚未做异地备份或完整组件恢复演练。

最初备份脚本的恢复步骤因相对 Compose 路径失败，服务已立即恢复；改成绝对路径后重新执行上述完整备份，脚本退出 0，八个容器实际恢复运行、API 健康、无 OOM。最后 OpenIM 的实际 Mage 检查退出 0 并确认全部服务正常。不得使用 `docker compose down -v`；恢复时必须使用本项目实际 override 和同一批数据。完整组件恢复仍需单独验证。

验收结束实际停用两名合成账号、撤销两枚测试邀请码，清理所有该实验室测试会话和 IM lease；最终只读数据库显示活跃会话 / IM lease 均为 0，保留三项任务与 34 条科研消息。两名原测试账号再登录均返回 401。初次验收当时 IFRC 负责人邀请码仍可用，新 IFRC 和测试实验室均未配置模型；这不代表现在的邀请或配置状态，当前状态见最新更新。云端最终数据库、备份和运行回执已保存到本地受控运行目录，不提交 Git。

本次临时 root SSH 公钥已实际撤销，原服务器公钥保留；关闭连接复用后新的 SSH 连接明确返回 `Permission denied (publickey)`。本地专用私钥、公钥和合成浏览器密码文件已删除，IFRC 私有首次注册文件保留。当前未推送 GitHub。
