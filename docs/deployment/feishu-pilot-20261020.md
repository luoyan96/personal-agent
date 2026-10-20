# 飞书本人试点部署：2026-10-20

用户明确批准备份/恢复与schema022→023演练、科研API/worker配对升级、仅将该应用App Secret存入chat.acceptcat.com服务器受限文件，以及发布仅罗岩可用的飞书0.1.0。此前应用草案未发布，密钥未读取；本批授权后执行。没有AcceptCat公开Release、更新源变更、用户客户端安装或私人文档试读。

## 固定范围

产品源码 **2bbcfbce2e369fe8b64a92caf0dd22350a22b870**，分支 `feat/feishu-readonly-pilot`，草稿[PR73](https://github.com/luoyan96/personal-agent/pull/73)。Windows0.10.20安装器及原哈希保持，见[交付说明](acceptcat-0.10.20.md)。

服务器 `launch-advisor-20261004`，原部署基线 `47c42acbccf64b1d329babb26a464733b81d51d3+key-preview.4bc8d1f`，API/worker原镜像 `sha256:8defb3973bfc93a5544df1fe6b715eecf91c152fb4b1544d93f913feec874986`，schema022/contract0.25.1。实际重新inspect两容器均为该镜像且running，磁盘可用7.3GiB，再开始构建。

新镜像 `research-openim-api:feishu-20261020`，**sha256:4ee12e77f80da2e196e6640980dbdb521a1bfa5e168ac1ced6012f387e63ea0d**，OCI组合修订 `47c42acbccf64b1d329babb26a464733b81d51d3+key-preview.4bc8d1f+feishu.2bbcfbc`。基于已核对旧镜像离线构建，覆盖固定源码12文件并逐项SHA256核对：

- API：config.ts、database.ts、server.ts、feishu.ts、integrations/feishu-client.ts及023-feishu-readonly.sql。
- contracts：feishu.ts、index.ts、routes.ts、models.ts、package.json。
- 生产入口：deploy/openim/run-production.mjs。

不部署整条分支；旧公共目录种子源文件新旧镜像SHA256一致。没有更新其他Skill、IM、Nginx、网络或六个依赖服务。

## 备份与迁移

10:57左右，仅停止科研API/worker。新备份目录 `/srv/research-openim-backups/feishu-20261020-20261020T025747Z`，完整 `research.tar.gz` SHA256 **8b61179e5172154dc4d022b7414d567103de2b7cbf8f7eac4bbf2f6a96c96ecd**，校验通过；配置备份保存在同一root专用目录，旧备份和镜像保留。

实际验证顺序：停写基线 → tar备份 → 独立恢复 → 核对022 → 在副本显式迁移023 → 核对 → 演练移除尚无记录的023新表并回到022 → 核对 → 副本再次迁移023 → 核对 → 生产库再次核对022 → 显式迁移023 → 启动前核对 → 配对启动新API/worker。

每次副本及生产迁移比较均确认 **91张旧表**的SQL/行数/逐行内容哈希与迁移1–22的历史记录不变，**6个原件**字节哈希/大小/权限及目录结构不变，integrity_check/foreign_key_check通过。schema023仅新增三张飞书表和一个索引，均为空，没有创建生产合成账号或会话。

运行后另以只读事务核对 `personal_model_configurations`、`personal_model_settings`、`lab_ai_settings` 整表哈希，旧密文/默认选择保持；没有读取或解密已有完整模型Key。API/worker实际inspect为同一新镜像并running，API healthy；其余六容器ID/镜像/状态保持。既有环境、挂载、命令、重启策略、内存与端口设置比较一致，API仅新增两项飞书环境变量和一个只读secret挂载。

## 凭证与应用发布

App Secret从该飞书应用的可见凭证控件取得，立即恢复掩码，使用终端read -s输入。明文未输出、未写本地文件或命令历史、未进入Git/镜像/安装器。仅写服务器 `/srv/research-openim/feishu-app.secret`，root/0600；仅API挂载，生产入口在 `/run/research-private/feishu-app`复制为0600，主加密Key沿用原值。配置检查 `configured:true`、主密钥可用、两个运行时密钥0600；这不代替飞书真实token兑换检查。

2026-10-20 **10:58**，飞书应用“AcceptCat 科研资料只读接入”0.1.0实际显示已启用、已发布、审核通过。**可用成员仅罗岩**，对外共享关闭，三项用户身份只读scope和精确callback保持。未添加机器人、消息、写入或应用高权限身份，未扩大到其他成员。

## 实际检查与证据

构建前通过693项/55文件本地CI及2项生产CLI/HTTP。部署镜像的网络隔离、无生产挂载真实HTTP冒烟通过合成OAuth/PKCE、重放400、匿名401、账号隔离、令牌加密、wiki/docx预览、私人副本/幂等导入、断开及旧Key预览。首败因新冒烟脚本漏开B3_AI_ENABLED，修正夹具后通过，原失败保留；未改产品代码或重建安装包。

远端ba6dc89的run39360378751：Ubuntu22/24首轮成功，Windows既有execution A12用例5000ms超时，仅重跑失败节点后5分56秒成功，三平台最终通过；没有调整测试时限。后续部署记录提交仅改文档，内容/链接检查225份Markdown、10份Skill通过，新文档head的CI分别跟踪。

公网独立验证：ready **200 / contract0.26.0**，database/storage/authentication ok，Harness **not_verified**；飞书status匿名401，旧key-preview匿名401，无参数callback400，no-store/CSP/no-referrer正确。未调用模型，没有真实OAuth、私人资料或科研质量验证。三张飞书表在部署后检查时均0条。

Git外证据 `D:/deepseek-agent/.runtime/feishu-pilot-20261020`：公开探测JSON、源文件manifest、迁移审计/部署/检查脚本、`production-deployed.png`及`feishu-published-self.png`；原包与合成验收证据保留。服务器完整日志及仅含哈希的数据库基线位于 `/opt/research-openim/ops/feishu-20261020`，完整数据库备份留服务器，不传出私人原件。Workbench初次连接WebSocket失败，返回登录后使用已有免密配置重连成功，没有新建SSH凭据或改网络。

## 回退与下一步

不能把旧022镜像直接启动到023库。回退前先停API/worker；本次已在副本验证的退回仅适用于023历史校验一致、三张新表均无记录时，删除这三个新增表/索引及第23条迁移记录，保留旧业务当前内容后重启旧组合。若已有飞书授权或预览记录，保留数据库并修复023，不能盲目恢复备份覆盖新写入。部署脚本具备这一保护，正常上线未触发生产回退。

本人安装0.10.20后，在“工作台 → 资料与素材库 → 连接飞书资料”完成OAuth，再主动选择一份docx或wiki/docx验证正文、权限、来源和保存副本；原文在飞书维护，Agent仍需显式绑定集合。PDF/PPT、整库同步、写回、多人试点与长期科研效果继续后置。
