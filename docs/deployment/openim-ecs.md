# 新 ECS：OpenIM 科研微信（2026-10-06）

## 最新补发：旧消息停留与阅读全文验收（22:01:49北京时间）

固定客户端 `622e84bff20af8cefdd6d9004286da6ba6ba4a22` 已于2026-10-06 22:01:49静态上线；[PR8](https://github.com/luoyan96/personal-agent/pull/8)已合入main（288b56f），[三平台完整CI](https://github.com/luoyan96/personal-agent/actions/runs/37474793438)全部通过。发布标签 `personal-agent-2026-10-06.4` 指向这份源码；API / worker仍94b26d1、镜像d56ee747、contract0.19 / chat1.8 / schema18，没有迁移。

- 查看历史后明确暂停自动跟随；消息由短加载行变成长正文、模型增量、canonical回执或尺寸变化不能仅因列表几何到底重启。Virtuoso followOutput为真正false；初始会话、同身份本人发送、显式End或真实向下滚到底才恢复。阅读全文成功ACK只向原会话 / 身份 / generation发跟随事件，迟响应不跨账号或页面生效。
- 当前Nginx root `/opt/research-openim/client-releases/622e84bff20af8cefdd6d9004286da6ba6ba4a22/clients/openim/dist`；精确公网index SHA256 `9f2591fb39dcf489669c693202d1006c926c24ac72df824cb142bf092ba99742`，八服务运行、API healthy、HTTPS ready0.19；八镜像与backend current全部保持。静态恢复只将Nginx副本 `/opt/research-openim/ops/history-scroll-622e84bff20a-20261006T140148Z/research-openim-production`复制回现有配置，nginx -t并reload后核对8c5f14c的e4ccf4c首页、健康和八镜像；不恢复数据库或切后端。原21:25补发记录仍保留各自基线。
- types / Web / 四固定SDK资源通过；7个必要production React / HashRouter / QueryChat / Virtuoso场景通过（6+1两次窄运行），API / SDK / model均合成，pageerror0 / unexpectedAPI0。旧源码本地合成场景未复现，不称失败门禁；真实Edge旧跳回观察为原故障证据。两个harness启动失败以及库警告保留。
- 线上确认浏览器加载精确新脚本index-0cce9eaf.js。旧IDE部分回执保持原142字范围；用可见“继续阅读全文”键盘Enter触发真实新请求，精确复用既有解析源而未重传文件。新轮成功使用全部5页 / 29415字符，partial=false，实际9127输入 / 446输出 / 3573ms，outbox sent。刷新后新canonical回复1份、编辑器空白；完整阅读入口和实际模型 / IM路径闭合。
- 先前自动化click几次未形成新turn、位置改变，不能单凭这些操作归因window focus；没有把未提交点击计通过。厂商上传Session过期一次，刷新同权限Workbench后同包上传、hash守卫及激活成功，无新增SSH / Key / 端口。维护连接已按本批收尾关闭，用户聊天保留。
- Git外 `.runtime/document-followup-20261006/history-scroll/summary.json`及两个render报告；`history-release/{bundle-receipt,deployment-online-1,source-review,upload-session-failure,live-button-final}.json`与真实新回复截图。用户论文正文、凭据和运行资料未入Git。扫描OCR / 图像 / 版式及超过20非空页、64000预算的全文仍未实现。

## 本日先前发布：文档全文与继续阅读（2026-10-06）

2026-10-06 **21:02:07北京时间**，全文上下文修复 `94b26d1d4871c45ace12a86f93d4c19cce377c4d` 已成对部署API / worker及客户端；**21:25:34**静态补发客户端 `8c5f14c91f0248c522a52bb4c5eb31f440500f5b`，增加旧解析正文的“继续阅读全文”入口。[PR5](https://github.com/luoyan96/personal-agent/pull/5)与[PR7](https://github.com/luoyan96/personal-agent/pull/7)已合入main，后者软件合并提交2292360。发布标签 `personal-agent-2026-10-06.3` 指向受测客户端8c5f14c，其API / 契约 / Harness代码与已部署94b26d1完全相同；文档提交不改变运行软件。contract0.19 / chat1.8 / schema18，无迁移。详见[文档阅读交接](../development/document-reading.md)。

- API / worker实际镜像 `sha256:d56ee747229eeaffec170810b846f1265ca5c2afbffa4d32a95e69e66871017d`；backend current为 `/opt/research-openim/releases/94b26d1d4871c45ace12a86f93d4c19cce377c4d`。最终Nginx root `/opt/research-openim/client-releases/8c5f14c91f0248c522a52bb4c5eb31f440500f5b/clients/openim/dist`；公网index `e4ccf4c4069a7ab1cb5771880cd8b480c9aef09b70a0221470dd0381d322a65d`，八服务运行 / API healthy / HTTPS ready0.19。静态补发期间八镜像及后端current未变。
- 主发布停写78表SQL / 全行hash保持一致，备份 `/srv/research-openim-backups/20261006T130148Z` 的12checksum / 9gzip / 隔离SQLite integrity及18迁移检查通过；完整组件恢复 / 异地备份仍未验。静态补发回退只恢复Nginx副本 `/opt/research-openim/ops/continue-reading-8c5f14c91f02-20261006T132533Z/research-openim-production`及94b前端，API / worker / 数据库保持；主发布恢复2e69688需先栅栏未完轮并保留用量，不能覆盖旧快照。
- 沿用现有Workbench免密SSH；前次断开经刷新恢复。静态上传一次厂商Session过期、对应归档不存在守卫失败，刷新同权限连接后同包上传 / 核验 / 激活成功，失败记录保留。没有新增SSH、端口或Key。Git外证据 `.runtime/document-reading-20261006/release/{prepare-online-1,deployment-online-1,public-online-1,live-document-final}.json`、真实IDE及13页截图；补发 `.runtime/document-followup-20261006/{frontend/summary.json,frontend/render-7214ef96/report.json,release/bundle-receipt.json,release/deployment-online-1.json,release/github-ci.json,release/software-merge.json}`。

恢复助手主发布目录 `/opt/research-openim/ops/document-reading-94b26d1d4871`；原始包helper严格预期2e69688，只适用于激活前基线，不能对已升级环境直接重跑activate。补发helper `/root/continue-reading-8c5f14c91f0248c522a52bb4c5eb31f440500f5b/deploy-continue-reading.py`，SHA256 e016364d95be33410cdce617fc6abf0f425bd58c22952c57b497fae1d1ab954c；只改Nginx静态root，回退同样不触碰数据。下面各旧恢复说明仅适用于各自历史批次。

## 历史发布：连续 Agent 私聊（2026-10-06）

18:16:59北京时间，用户明确授权后，固定源码 `2e696881583842eb0e251d222083bccd925524fe` 已同时部署客户端、API及worker。contract0.19.0 / chat1.8.0 / schema18，无迁移；完整CI同一源码三平台通过。PR3 / PR2已合并，发布标签 `personal-agent-2026-10-06.2` 指向部署源码。真实模型 / OpenIM结果见[当前状态](../current-state.md)。

| 位置 | 实际值 |
| --- | --- |
| 后端current | `/opt/research-openim/releases/2e696881583842eb0e251d222083bccd925524fe` |
| API / worker镜像 | `sha256:63915f409f27dd18f1ab14fc8cdd3f5e1cf2da4de16bbda80e620a5a90c37d06` |
| Nginx root | `/opt/research-openim/releases/2e696881583842eb0e251d222083bccd925524fe/clients/openim/dist` |
| 公网index SHA256 | `7df13778196d25cfcb8e37e54015c9254a6edaeae1616184270e7fa8318c1be9` |
| 停写一致备份 | `/srv/research-openim-backups/20261006T101640Z` |
| Nginx恢复副本 | `/opt/research-openim/ops/continuous-chat-2e6968815838/activate-20261006T101638Z/research-openim-production` |
| 操作目录 | `/opt/research-openim/ops/continuous-chat-2e6968815838` |
| 实际helper | `/root/continuous-chat-2e696881583842eb0e251d222083bccd925524fe/deploy-continuous-chat-v4.py` |
| helper SHA256 | `668d9a3080c993c958e970b5ef6306cdf7b2a416d92aca784911fa23cfcee8bc` |

- 先成对升级API / worker再启用新客户端。旧0.18客户端兼容新API，新客户端不连接旧严格0.18 body。停止本项目写入者取得一致备份；12checksum / 9gzip流CRC / 隔离SQLite恢复integrity及18迁移checksums通过，78表SQL与全部行hash在启用写入前一致。八服务运行 / 无OOM、healthy / HTTPS ready0.19及精确首页通过，其余六镜像未变。未新增SSH授权、端口或修改私有模型配置。
- 准备阶段原失败保持：v1 release根700使www-data不可读；v2原归档已存在；v3 Windows工作树四个CRLF文件hash与固定Git归档LF不同。最终新release根755、匹配归档hash复用 / 新文件独占写入、源文件依据固定Git blob生成canonical manifest，并检查源 / 镜像 / 运行容器及www-data可读才激活。v4 helper3项本地归档 / 全表hash / 实际SQLite栅栏门禁通过；没有在失败准备阶段切换生产。
- **本批恢复保持现有schema18库，不恢复旧快照。** 停API、worker及OpenIM三个写入者，核对18迁移checksums / integrity；栅栏running为interrupted并保留未知用量，取消不兼容未启动continuous或无输出waiting轮次，清除其暂存正文并推进revision。保留实际 / 未知usage、不退款，消息 / 记忆 / outbox和其余记录保持。helper的自动fallback随后恢复原镜像 `sha256:e632d1c79499b113983bfa2d4995ff1059b518a06a6e2e4a67901c9661d91c41`、current `/opt/research-openim/releases/787ca2314b24320ae0b90da4db4d1401b209f719` 与上述Nginx副本，前端回到27c3279 / index `ff018ec1ecaea9c079a877d5358fac7223a8e9f9124d8b3a73568fbb879b3a0b`；再核对八服务、healthy / ready0.18、精确首页和其余六镜像。本次没有实际切生产回退演练，SQLite栅栏已本地验证；禁止 `down -v`、直接运行旧schema17镜像或覆盖当前数据库。
- 真实云端：既有已登录个人助理发送合成文字，两条短时输入合并一次调用，运行中补充栅栏旧轮，新轮成功；final前实际显示公开delta，最终OpenIM sent，刷新回复1份 / 暂存0。两个长文请求BUDGET_EXCEEDED保留，后续短请求成功，4000 / 90秒仍有限制。不是新建隔离账号，未读取 / 改变Key或密码；原生App、实时语音、完整Muse并行与外部Agent真实流式另验。
- Git外证据 `D:/deepseek-agent/.runtime/continuous-chat-release-20261006` 的 `deployment-verified.json`、`prepared.json`、`public-final.json`、`cloud-turns-final.json`、`live-stream-actual.json`、`live-refresh-proof.json`及截图；原归档、manifest修正收据、三次prepare日志及中止selector报告保留。完整组件恢复 / 异地备份未完成。以下旧恢复说明只对应各自历史批次，不能代替本节当前恢复组合。

## 历史更新：Personal Agent 第一批流程

2026-10-06 11:09:21北京时间，固定源码 `787ca2314b24320ae0b90da4db4d1401b209f719` 发布前端 / API / worker及显式018；11:16:43静态补发 `27c3279f7dc6584ebde905fd821e21f7166e5c74`，个人回执仅在助理输出显示一次、记忆 / 提醒默认简短。contract0.18 / chat1.7 / schema18；八服务运行，其他六组件镜像不变。没有新SSH、端口调整或GitHub推送。

| 位置 | 实际值 |
| --- | --- |
| 后端current | `/opt/research-openim/releases/787ca2314b24320ae0b90da4db4d1401b209f719` |
| API / worker镜像 | `sha256:e632d1c79499b113983bfa2d4995ff1059b518a06a6e2e4a67901c9661d91c41` |
| 最终Nginx root | `/opt/research-openim/client-releases/27c3279f7dc6584ebde905fd821e21f7166e5c74/clients/openim/dist` |
| 最终公网index | `ff018ec1ecaea9c079a877d5358fac7223a8e9f9124d8b3a73568fbb879b3a0b` |
| 主批一致备份 | `/srv/research-openim-backups/20261006T030859Z` |
| 主批Nginx备份 | `/opt/research-openim/ops/personal-agent-787ca2314b24/activate-20261006T030858Z/research-openim-production` |
| 静态补发Nginx备份 | `/opt/research-openim/ops/compact-receipt-27c3279f7dc6-20261006T031643Z/research-openim-production` |
| schema18兼容旧业务镜像 | `sha256:8ef9b682466d1cfd9aef7d18521db598dd42d236f28dc72c69bf9efdbba9d6fc` |
| schema18兼容旧业务源 | `/opt/research-openim/releases/57d059e5201fc54c53bfcaeaa28765ea34397615-schema18-787ca2314b24` |

- 主归档outer `849e352b75a07ae79038d247eb6c66c0a1bab5f194b7b682762591158ee01222` / helper `613ca7eb17019d7f131e17f5f27f0f6bc240de981ac3ce353ab02631557f983a`；限定6成员及内层hash、旧current / API镜像 / 前端root / 首页守卫通过。沿锁文件在既有镜像无外网构建，源 / 运行镜像hash及PDF smoke通过，无升级依赖。
- 停本项目写入者取得八组件一致备份，12文件hash / 9gzip流CRC / 隔离SQLite恢复integrity ok及17checksums通过。018仅新增设置 / 记忆 / 修订 / 跟进4表及索引；73旧表SQL和全部行hash一致，新4表初始0行。源 / 容器hash、八服务 / healthy / HTTPS ready0.18 / 精确首页通过。同ECS备份，异地和完整组件恢复未验证。
- schema18兼容57d镜像在network-none容器通过实际loopbackHTTP / SQLite smoke：新助手及记忆消费请求不能被旧模型重试 / 解释、用量 / 新聊天 / 记忆 / 修订保留、未发提醒暂停、旧普通聊天可用。ModelCall合成，未实际切生产演练回退。
- **schema18禁止直接运行旧17镜像或用17备份覆盖新数据。** 全业务恢复先停API / worker / OpenIM三个写入者，核对018历史和上述固定兼容镜像；仅挂载 `/srv/research-openim/research` 为 `/data`，执行镜像内 `/app/rollback-fence.mjs --database /data/platform.sqlite --source-root /app --writers-stopped`，确认actualUsagePreserved / personalRecordsPreserved / databaseRestored=false、跟进暂停 / 个人请求栅栏。再切production镜像标签、current和Compose来源至上述兼容源 / 镜像，恢复主批Nginx备份的aa3客户端，核对schema18 / ready0.17 / 旧精确首页及其他六镜像，再启动OpenIM。实际回退代码及参数保留在 `/root/personal-agent-787ca2314b24320ae0b90da4db4d1401b209f719/deploy-personal-agent.py`；不使用 `down -v` 或覆盖当前库。
- 仅静态展示恢复：恢复静态补发Nginx备份并test / reload，回到787首版客户端、index `c218ced4289772e30fe9a3c3195bf4c4400c1b98aa62879fa49244eee019aeb2`，保留后端0.18 / schema18及八镜像。补发outer `f27ff8fd5a3d0790addda53ad8e280f00c33e2df4dca292556418ab329a3b701` / helper `7996753351d583e404d6d54bcdc3bec3d42476680e1b1bec05618375c4fa5a43` 的限定5成员、源 / index / www-data / 八镜像不变核验通过。
- 云端独立合成账号12门禁通过：真实HTTPS / React / OpenIM SDK，无Key聊天记忆保存、UI保存、版本纠正、设置、可见提醒；关闭页面到期canonical写入一次、IM实际sent、SDK重开可见、完成并退出。最终静态3项通过：回执仅输出一次且简短、详情可打开、重新登录看到纠正的偏好。未调用真实厂商，未改用户Key / 账号；模型匹配 / 复杂群质量、手机push、云重启 / 双worker、原生安装包仍另验。
- 本地13组实际路由 / HTTP / SQLite界面、后端17专项 + 同空间协作1项通过，SDK / ModelCall合成；共享CI521 + 2、客户端类型 / Web / 四SDK通过。所有failed和harness修正保留。线上pageerror0，SDK worker的map(null) console错误仍记录、原因未定，不称console干净。
- 唯一合成账号用既有维护CLI精确停用，活跃会话 / IM lease / 未发active提醒均0，测试历史保留。本地helper和隔离浏览器停止。Git外 `.runtime/personal-agent-20261006/{deployment-verified,compact-deployment-verified,prepared,cloud-cleanup-verified}.json`、`cloud-1022cfe0/report.json`及`cloud-compact/report.json` / 截图。后续文档提交不改变软件SHA。

## 历史更新：Agent 联系人、接入与公共登录修复

2026-10-06 09:33:52 北京时间，固定软件 `57d059e5201fc54c53bfcaeaa28765ea34397615` 整体上线；09:57:55 静态补发 `aa3c0f13e257c8ac463ee5800cccdea255e6a07b` 修复嵌套公共登录路由。当前API / worker为57d，契约0.17.0 / chat1.6 / schema17；前端为aa3。

| 位置 | 实际值 |
| --- | --- |
| 后端current | `/opt/research-openim/releases/57d059e5201fc54c53bfcaeaa28765ea34397615` |
| API / worker镜像 | `sha256:837c4e89fa03d7253207f5c3c223d1ee62daee7ce609afa4e2a8d3c7e622b7c6` |
| 当前Nginx root | `/opt/research-openim/client-releases/aa3c0f13e257c8ac463ee5800cccdea255e6a07b/clients/openim/dist` |
| 当前公网index SHA256 | `7db7867121af9a3aedf29e9505f936049c085aead02ae7500ac82e2a717049c2` |
| 主批一致备份 | `/srv/research-openim-backups/20261006T013331Z` |
| 主批Nginx备份 | `/opt/research-openim/ops/agent-experience-57d059e5201f/activate-20261006T013330Z/research-openim-production` |
| 登录补发Nginx备份 | `/opt/research-openim/ops/public-login-aa3c0f13e257-20261006T015754Z/research-openim-production` |
| schema17兼容恢复镜像 | `sha256:ebcb6ba7d86dbed7caa68b40c57e928e775971d147c23c7e7de5533d70e1c6c4` |
| 兼容恢复源 | `/opt/research-openim/releases/3b18c6883428f2f00bfbd61d8cce51195011b842-schema17-57d059e5201f` |

- 主归档outer SHA256 `9f3f6bd28c9c27f17aca992c615df8b9663e486d03c0bc497eaefe3c68059afc`，执行helper `5a1e0e4015bee97be43d40d539f3e07cb70af37ef9f018e41a27b4114588f1ec`。云端锁定旧依赖离线编译、API / worker源hash核对、network-none PDF smoke、显式017和逐旧表指纹检查通过。迁移新增绑定表，72旧表SQL / 全行hash完全一致；新绑定数0。
- 停本项目API / worker / OpenIM取得一致备份；12checksums / 9gzip、隔离恢复SQLite integrity ok / 原迁移16通过。其他六镜像未变，八服务运行、API healthy / HTTPS ready0.17、主批精确首页d06af406通过。备份仍在同ECS，未验收异地及完整组件恢复。
- 补发outer `c45d0fe9b80bfb281c7691fbd65d25a50790a0cea8ee66648419ab4cd96d5513`，helper `622de75eea061da1f3195c37d6c9724d9a3abf9cf27e8be7a08cd35a8203bf09`。只切换Nginx静态root；www-data读index / nginx-t / reload / 精确公网hash与ready通过，backend current和全部八镜像不变。实际Edge公共登录 / 注册表单 / 返回登录已恢复，没有填凭据或提交注册。
- **当前schema17不能采用下文历史schema16回退。** 保留现有数据库及新用户记录；兼容恢复时停API / worker / OpenIM三个写入者，核实current及数据库，运行固定 `rollback-fence.mjs --database /data/platform.sqlite --source-root /app --writers-stopped`，停用外部绑定、撤销活跃外部turn并保留实际用量；切兼容镜像 / source / Nginx，核对schema17及ready后再启动OpenIM。离线实际Docker smoke验证旧外部请求 / retry不走平台模型、原协调聊天可用、用量保留。不要把017前的数据库副本覆盖在线数据，也不要直接运行原3b18镜像。登录补发的Nginx备份只回到57d客户端（已知登录空白），仅用于应急静态恢复，优先保留修复版。
- 根CI491 + 2、客户端类型 / Web / 四SDK、15组件 / 6真实本地HTTP / 3实际生产路由树检查通过，各范围与失败报告分开。线上已登录桌面通联 / 表单核验完成；320生产聊天被其他设备登录提示中断，原因未定，不计通过。初始错误路由harness、上传会话到期 / 自动审批超时、空白截图均保留；本批无真实外部vendor探测、云录音、原生安装包、权限扩展或GitHub推送。
- 本机Git外回执在 `D:/deepseek-agent/.runtime/agent-experience-20261006/{bundle-receipt,outer-verified,prepared,deployment-verified,public-login-bundle-receipt,public-login-outer-verified,public-login-deployment-verified,root-verification,live-ui-proof,live-public-login-proof}.json`；前端证据 `frontend-review/{summary,route-summary}.json`，恢复overlay / fence / smoke在 `.runtime/agent-integration-20261006`。此前0ef候选包保留且未上传；后续交接文档提交不改变上述软件SHA。

## 历史更新：Agent 文件阅读与真实回复

2026-10-06，Agent 文件聊天最终软件 `3b18c6883428f2f00bfbd61d8cce51195011b842` 已上线。个人 / 专属 Agent 私聊发送含文字 PDF 或 UTF-8 TXT / Markdown / CSV 后，真实 SDK 成功才开始解析和模型阅读；范围、部分读取与失败明确显示。默认总预算仍为 4000 / 90 秒。旧 SDK 对象网关需要重定向时，可使用“从本机选择阅读”，只重读原附件，不重复 IM 投递。详见[文件聊天交接](../development/agent-file-chat.md)。

最终共享 CI 473 项 + 2 生产入口、客户端类型 / Web / 四 SDK 资源通过；原首版两页 PDF 的真实模型失败保留。最终线上合成验收结果：0977381版本真实 SDK 上传936字节合成两页PDF后自动回复成功；最终3b18c68版本沿同一合成附件追问第2页，真实模型回复明确该页提取文字完整并指出tiny sample，当前消息范围第2页0–54与服务记录一致。没有读取、复制或改变真实 Key / 密码，没有新增云测试账号或推 GitHub。

- 已上线 source `3b18c6883428f2f00bfbd61d8cce51195011b842`，API / worker `sha256:83797932607e2490c42c6ad1a434cca766fb909ad96ab6382eed1943b9904afc`，current 与 Nginx root 均为 `/opt/research-openim/releases/3b18c6883428f2f00bfbd61d8cce51195011b842` 下对应目录。公网 index SHA256 `4816189592b6af038ed4ff46204447db51a7b76afa44e4212049719345f28d0d`，8 服务 / API healthy / HTTPS ready0.16、本批变更源码 checksum、其他六镜像不变核验通过。
- 更新前一致备份 `/srv/research-openim-backups/20261006T003325Z`，12 checksums / 9 gzip / 隔离 SQLite 恢复 integrity / 16迁移 checksum 通过；完整栈恢复与异地备份未验。Nginx 回退配置 `/opt/research-openim/ops/agent-files-3b18c6883428/activate-20261006T003324Z/research-openim-production`。
- 当前回退基线为 source `a5360e9eac6ceab5cc1f716f174b826b3431285b`、API / worker `sha256:0c4b07fbe463e63ebe3ba1f8f6b9c2ecd7816532cc51ac16c79ef336ea1d9eda`、Nginx `/opt/research-openim/releases/a5360e9eac6ceab5cc1f716f174b826b3431285b/clients/openim/dist`、首页 `4816189592b6af038ed4ff46204447db51a7b76afa44e4212049719345f28d0d`。恢复这些软件配置后保留当前schema16数据库，禁止旧015数据库恢复或 down -v。
- 固定依赖离线构建及 network-none Linux PDF smoke通过；不新增依赖版本、SQL迁移、SSH授权或端口。原802首版调用失败 / 旧CI断言 / 安装中止与复现原证据保留。
- 证据在Git外父目录 `.runtime/agent-file-scope-final-20261006` 的 bundle / outer / prepared / deployment、root-verification、live-ui-proof 和最终截图。

## 历史更新：顶部加号和聊天扩展菜单

2026-10-05 23:20北京时间，加号菜单前端 `e536e759a71f59f244d740d2bfe25f2e5812bf56` 已静态上线：顶部添加朋友 / 创建 Agent / 发起群聊，输入区图片 / 文件 / 语音展开。API / worker仍为0ea0516，契约0.15 / schema16不变；八服务与精确公网首页通过。本地九组实际组件检查、客户端类型 / Web / 四SDK资源与既有Edge八组入口打开 / 取消检查通过。媒体回调与麦克风拒绝仅本地合成，本批没有重测云文件 / 录音投递。

- 新Nginx root为 `/opt/research-openim/client-releases/e536e759a71f59f244d740d2bfe25f2e5812bf56/clients/openim/dist`；后端 `/opt/research-openim/current`仍指向 `/opt/research-openim/releases/0ea0516d71d4f3c114f96ee0621ad463924a7a85`，API / worker镜像949cd650...与其余六镜像全部未变。服务运行 / 无OOM、API healthy、HTTPS ready0.15和公网精确index `ad9776effd48d619a731994b8e05dee5e4c7fe8315e0a803b711b4384fd8cdaa`实际核验。未重启容器或改数据库。
- 外层hash `04fc169570fa6da1deb3f6f115a020807a488b26327ce536a1bf72c3ff62ac39`、执行helper `d8bd91ea0db53b3d86707941073bd19ec0e205c7b91940ebee7471474a92b65d`、source归档 `bc089883bac002a720e5b72c2d5192f89aa325175094c122dafa0c38cfbd9a44`、web归档 `d1e1f7675e346e97efaba68c6ee35afdc61c96d31ad427c721cbdbb6fd523d95`均核验。限定5成员外包、安全展开、release755 / www-data实际读index、nginx -t / reload与新旧首页守卫通过。
- 回退配置 `/opt/research-openim/ops/plus-menus-e536e759a71f-20261005T152030Z/research-openim-production`；恢复该Nginx后 -t / reload，并核对旧首页SHA256 `7bcd46a2153093f56e69503a8c5339f66dca6d4e9409e2865dedd9a8521c76af`、ready0.15、八服务 / 全部镜像与后端current不变。只回退前端，不恢复旧数据库或迁移；原0ea后端 / schema16保持。本批成功未触发实际回退，不把helper语法核验称作恢复演练。
- 现有Workbench正常免密登录同权限连接上传本批源码 / Web；无新SSH / 权限 / 公网端口变化。云回执在 `/root/plus-menus-e536e759a71f59f244d740d2bfe25f2e5812bf56/deployment-verified.json`及Nginx备份目录。Git外证据位于总控父目录 `.runtime/plus-menus-20261005`：`bundle-receipt.json`、`outer-verified.json`、`deployment-verified.json`、`root-verification.json`、九组本地报告、八组`live-ui-proof.json`及最终`live-plus-menus.png`。
- 本批Edge只打开 / 取消菜单、表单和录音面板，没有新云测试账号、真实模型调用、联系人 / 群创建、云文件发送或麦克风录制。原菜单过早点击中止与本地fixture失败保留；历史云媒体证据仍为原受测版本。最终交接说明仅本地提交，不重新发布软件或推GitHub。

## 上一批更新：自然语言创建 Agent、自动私聊与连续回复

2026-10-05 22:25:01北京时间，最终前端 / API / worker软件`0ea0516d71d4f3c114f96ee0621ad463924a7a85`整体部署。current为`/opt/research-openim/releases/0ea0516d71d4f3c114f96ee0621ad463924a7a85`，Nginx root是该release下`clients/openim/dist`。API / worker镜像`sha256:949cd6501bdf286920db0f48b8ff23def262a534538f2226e010537667a45ac8`，其他六镜像未变；八服务运行 / 无OOM、API healthy / HTTPS ready0.15和schema16核验通过，没有迁移或新SSH。

- 外层SHA256 `9dd70ca4919119d69f542cea3d62241da746a1f1ffe59fdc2826d1f24bc6ff4c`，执行helper `9d3d25bba302a157b8c0c1c9050728348f2397f163b68e68672a0e5a6dbb8d63`；恰好5成员 / 外层及内包checksum / 安全展开通过，source归档`3831fb427bc0634600461d0d9d495b0b0baa1fad2258f73a83d7d92fa499fda5`、web归档`7760b834644fb5de608ad10220a774c04fabadb2e707ec79508a3ac0a08dfc74`。云端离线从f847依赖镜像构建，三份变更API源码在归档 / 镜像 / 实际API和worker一致。www-data读取与公网精确index `7bcd46a2153093f56e69503a8c5339f66dca6d4e9409e2865dedd9a8521c76af`通过。
- 本项目三个写入服务停止后做一致备份`/srv/research-openim-backups/20261005T142440Z`，12checksums / 9gzip完整流 / 隔离SQLite恢复integrity ok / 16迁移与原checksum通过；另保存本次原f847静态前端及精确首页。仅派生backup脚本EXIT trap使数据服务先恢复，API / worker / OpenIM直到版本切换后恢复，原backup脚本未改。尚未做完整组件恢复或异地备份。
- 回退基线是首版f847，API / worker旧镜像`sha256:1e238ea6c6b96e3475290f30a43b4aa53f14670c60438197e02bb4447eb94d4b`，前端`/opt/research-openim/releases/f8478d7b171d27fd0972787ddb8e599fdc89aec5/clients/openim/dist`，首页`0f5bc91c71c5b772c653f98155306d89dfa6983d28436f875b494daf69ba744e`。原Nginx保存`/opt/research-openim/ops/agent-creation-0ea0516d71d4/activate-20261005T142439Z/research-openim-production`。恢复镜像 / current / Nginx后核对旧精确首页、ready0.15、全部服务与schema16；保留当前数据库，不需要恢复旧数据，不套用更早015数据库回退。失败回退模拟通过，最终激活没有触发实际回退。
- 首版f847在21:45发布，备份`20261005T134506Z`保留，实际创建联系人 / 手动SDK开聊 / 一轮真实回复。实际自动导航失败和生成档案挤占连续聊天预算后，本批整体补救；独立导航静态包没有上传 / 激活。最终22:26原IFRC新精确档案请求复用链研直言并自动SDK开聊，22:27 / 22:28两轮真实模型回复、历史回执同URL重开与历史保留通过。没有读取 / 修改真实密码、Key、记忆或新建云QA账号。
- 最终共享CI457 + 2、完整客户端类型 / Web / 四资源、客户端原17组与父子路由5组、后端连续预算10组通过；局部模型 / SDK合成测试明确记录。首版失败、Workbench首次上传Session过期和UI过早断言保留；正常续登同权限连接后同包成功。模型 / 原生客户端 / 媒体其他批次证据不可冒充本次复测。
- 云回执`/opt/research-openim/ops/agent-creation-0ea0516d71d4/deployment-verified.json`；本机Git外`.runtime/agent-creation-20261005/continuous-{bundle-receipt,outer-verified,prepared,deployment-verified}.json`、`live-ui-closure.json`、`live-final-agent-chat.png`和本地检查日志。部署后仅补本地交接文档，不改变0ea软件归档或推GitHub。

## 上一批更新：三个可添加的科研聊天 Agent

2026-10-05 20:34北京时间，前端固定 `a25ee9bdf1601f81fce78f6028216b9aed9db792` 发布到 `/opt/research-openim/client-releases/a25ee9bdf1601f81fce78f6028216b9aed9db792/clients/openim/dist`，Nginx root指向该目录。后端current仍为下面的68d；API / worker镜像和其余六容器镜像全部不变，八服务运行 / 无OOM，API healthy、HTTPS ready / 契约0.14核验。

- 通讯录新增文献阅读 / 论文修改 / 研究方案三卡，确认保存本人真实档案后打开既有直接会话；取消不创建，保存后IM失败重试不重复建，完整相同档案复用。原资料 / 记忆 / 自定义创建保留。仅聊天角色，不新增联网、PDF / 文件上下文、工具或科研执行能力。
- 原有Workbench连接正常恢复后上传单包，外层SHA256 `05e7e7586dabc13e1fb48c08acdcd3f8a0b100a66315f74dd649b4138ce7fdef`，helper `85ea811dd95b4229a66a02c6b6d99399cdcd674de43c94a0e80cc89fd38cf9c7`；源码 `c52694f6c5cb96ae7929eb2f9f747ccbfec0f3d15c8f18364fa8dab771ac351e`、Web `a4b38ed92cbe872219556d0a31e547acdb91d830c1c66f739edc5f2a62d4207a`逐核验。新release755、实际www-data读取index通过，Nginx -t / reload后公网首页精确SHA256 `dcc6cc772661fcd8fe957f2935989abcce2e154a5117c2382990264dad390565`。
- 没有数据迁移、镜像重建、重启服务或新增SSH。前端回退Nginx保存于 `/opt/research-openim/ops/agent-starters-a25ee9bdf160-20261005T123403Z/research-openim-production`；本批失败守卫只恢复该Nginx并验证旧首页 / health / 镜像，不涉及schema16。回退须核对后端current仍68d和旧前端896450e2首页，禁止套用上一批015数据库回退。
- 本地后端52 HTTP / SQLite / 4合成模型上下文检查，客户端16组真实本地分段记录、总控类型 / Web / 四资源通过。20:35既有IFRC正常刷新恢复、实际添加文献Agent、SDK私聊 / 一次自编摘要真实模型回复，20:36重开同会话通过；没有读取或更改真实Key / 密码，没新增QA账号。另两角色尚未分别调用真实模型；未重测媒体、Electron或执行任务。
- Git外 `.runtime/agent-starters-20261005` 保存baseline、bundle / outer / deployment回执、16组成功与旧选择器 / 样式失败记录、`live-ui-proof.json`及实际catalog / chat截图。部署源a25后只合入本地交接文档，不重新发布或推GitHub。

## 上一批更新：个人注册、自然聊天与模型设置

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
