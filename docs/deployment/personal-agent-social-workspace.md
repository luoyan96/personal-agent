# 2026-10-08：桌面工作台与能力广场上线

本页记录10:08桌面发布及其配套后台。12:25的上下文改造已将API/worker更新为06262a6b；当前镜像、运维配置和检查见[后续部署记录](personal-agent-conversation-context.md)，Windows0.5.1与schema20保持。

## 当前版本

| 组件 | 实际版本 |
| --- | --- |
| Windows 发布 | [v0.5.1](https://github.com/luoyan96/personal-agent/releases/tag/v0.5.1)，2026-10-08 10:08:00 北京时间，公开 latest |
| 桌面标签源码 | `784de4231918e42301f82a979c238118e0405d04` |
| 云 API / worker 源码 | `5c9499800ec71f6b6ad444b2e9d89ba06d9a4808` |
| 两服务实际镜像 | `sha256:0c6929175fae18ad603eb25d558daf75cb3bfb66314e46f3fe9cdfc4bc98a555` |
| 契约 / 聊天 / 数据库 | `0.21.0` / `1.10.0` / `20` |
| 公共入口 | `https://chat.acceptcat.com/api/v1/health/ready` 实际 HTTP200、contract0.21 |
| 源码审查 | [PR20](https://github.com/luoyan96/personal-agent/pull/20)，草稿，未合入 main |

用户明确授权使用现有 Edge 阿里云维护会话，备份后升级这两个服务并执行019/020。仅此项目服务在一致备份时暂停；原 OpenIM、Mongo、Redis、Kafka、etcd、MinIO 镜像、凭据、端口保持。没有替用户安装或重启正常桌面软件。

## 原问题和升级

桌面0.5.0调用新的工作台/广场接口，但云端仍为94b26d1 / contract0.19 / schema18，列表404被显示为权限或内容错误。不是用户资料丢失。0.5.1在读取这些新接口前检查公共ready版本，旧服务/网络错误给出明确提示；本机报告独立，真实403/404权限错误仍保留。

固定后端源码归档627743字节，SHA256 `a3370b55e3390e45966cf2394423020429992a1242c97d416abc26ba26b8b80d`，云端摘要核对后按锁文件构建固定镜像。Workbench源码文件上传网关NoSuchKey、完整包传输过慢失败均保留；改用GitHub公开源代码资产，没有上传运维凭据。

一致备份在 `/srv/research-openim-backups/social-5c949980-20261008T015959Z`：研究数据库/附件/配置/密钥与5个命名组件数据卷及本项目Mongo匿名configdb卷，共7个路径。`data.tar.gz` 43245719字节、SHA256 `ec6dffc491f3a3f5c8c171cf19a2de47980b718d8a8127f1e1736933f08cfd9b`。完整gzip/tar检查、研究库隔离展开读取、schema18完整性/外键/78表摘要与原库一致通过。备份和容器inspect留在服务器私有目录，不能提交Git。未验证异地备份或全部组件恢复。

正式019/020迁移、再次迁移幂等、schema20 integrity/FK及78张旧表行摘要、旧迁移记录保持通过。API与worker实际启动于同镜像；生产入口check和公共ready通过。两项迁移只增表/索引；新写入后不能直接启动旧schema18镜像或用旧备份覆盖当前库。

两服务实际restart策略为`unless-stopped`，Compose标签记录下列新配置。后续运维重建必须沿用四份配置，不能只运行旧版Compose：

```sh
docker compose --env-file /srv/research-openim/compose.env \
  -f /opt/research-openim/releases/5c9499800ec71f6b6ad444b2e9d89ba06d9a4808/deploy/openim/compose.yaml \
  -f /opt/research-openim/releases/5c9499800ec71f6b6ad444b2e9d89ba06d9a4808/deploy/openim/compose.production.yaml \
  -f /opt/research-openim/ops/compose.production-images.yaml \
  -f /opt/research-openim/ops/social-5c949980/images.yaml up -d --no-build
```

中断证据保留：第一次预检拦下未列入的Mongo匿名卷，尚未停服务；随后SQLite完全只读挂载无法创建WAL临时文件，停止后备份读取和原恢复查询均失败。确认schema18后恢复旧服务，再将文件系统挂载改为可写、查询连接仍为readOnly，并使恢复逻辑不因查询错误提前退出。重试完整备份后升级成功。执行脚本的非可执行权限错误也保留，改用Bash解释器运行；没有放宽系统权限。

## 实际检查

- 原共享工程完整CI：45文件/568项、生产020 CLI/HTTP两项、B0真实进程和Web生产隔离。桌面专项与类型检查见当前状态。GitHub三平台检查 [37714297856](https://github.com/luoyan96/personal-agent/actions/runs/37714297856) 实际全部通过。
- 0.5.1公共版本兼容界面8项隔离检查通过；实际NSIS包的登录页与native平台3/桥启动通过。三个受限环境GPU启动失败仍保留，同包在正常宿主使用原参数通过，不能据此前失败判定产品DLL缺陷。
- 2026-10-08 10:03:02–10:03:25北京时间，两个新合成个人账号的16项真实HTTPS检查通过：独立身份/记忆、能力发布/发现/撤回、跨空间真人和Agent联系同意、任务提案幂等/确认、自有Agent即时入群、独立群加入与任务承接、真实OpenIM会话策略回调/身份建立/群与私聊同步、缺模型明确不可用、真人结果精确验收、重复提醒暂停/权限、后台一次到时提醒。
- 到时提醒实际runCount1、delivery `im_sent`、无模型turn。公开资料撤回、两项安排inactive、两会话logout；合成账号和审计历史保留。未使用用户账号、Key、IFRC邀请码或文件；此批没有真实模型调用和SDK媒体收发。OpenIM HTTP同步和提醒投递不替代完整桌面收发验收。
- 第一次子任务执行受sandbox网络EACCES阻止，零注册；root正常执行同一脚本完成。测试工具的`paused`元数据覆盖检查状态导致汇总15，原日志证实该项通过；保存原报告后仅修正报告工具为16/16，未重复线上请求或改产品。

## Windows 资产与更新

`ResearchWeChat_0.5.1.exe` 86296322字节，SHA256 `71d1086c9538effb756ab710d8751ec53c21d8f6f6d9596905fa74368fd58117`。exe、blockmap、latest.yml、SHA256SUMS四资产的GitHub大小/digest与本地一致，发布后公开latest及实际更新清单均为0.5.1；0.4.0历史草稿保持。保持原appId与资产名称，快捷方式显示Personal Agent。

安装文件：`D:/deepseek-agent/PersonalAgent-Windows/0.5.1/`。从左下角设置→版本更新检查、下载，再确认安装重启；也可自行退出旧软件并运行安装包。升级前复制未确认发送的文字，旧版待发记录尚不跨软件重启恢复。

证据位于Git外 `.runtime/desktop-social-workspace-20261007`（部署/发布收据、原脚本失败、cloud-deployed-proof.png、backend/live-20261008020302496_4ff920cd）及 `.runtime/desktop-social-workspace-20261008`（0.5.1兼容界面/打包实际启动）。截图中的API验收报告明确不是产品UI。服务器私有备份不得复制到公开证据。
