# 私人技能0.6.0部署与发布收据

2026-10-08北京时间，API / worker和Windows0.6.0均固定源码 `11cd20a92bd1a295120f7c87eea022da3ff9c411`。代码审查 [PR23](https://github.com/luoyan96/personal-agent/pull/23)依赖fix/desktop-message-loading，保留草稿，未合main。

## 服务端

- ECS维护会话在既有免密授权下重新连接。没有新增账号权限、SSH密钥、公开端口或修改其他站点。
- GitHub codeload固定提交源码摘要 `4825b19109101ec0db2dbf69e31429e4bdca6e3e5fbb34c762d710c340c335b6`，新目录 `/opt/research-openim/releases/11cd20a92bd1a295120f7c87eea022da3ff9c411`。
- 现有镜像context-06262a6b作为基础，离线编译contracts / research-skills / API，成对部署镜像 `sha256:580d8333423e8fab0d7fb5f4216a6707fa073b3cbb975794565beb3cf18c6e9b`，两个服务running / unless-stopped。
- 备份 `/srv/research-openim-backups/skills-11cd20a9-20261008T095929Z/runtime.tar.gz`，SHA256 `4a0eced921934a8015f73b2f15424efd04486309542450730a732c30a08576d4`。API / worker暂停写入后备份，独立恢复研究库验证；迁移前83表、迁移后86表，原表行数与排序后行摘要、旧迁移记录保持一致；integrity / FK通过，新增三表当时为空。
- 显式执行迁移021后，公网ready200 / contract0.22、chat1.11 / schema21。部署期间失败会停止新服务，将失败研究库移入备份目录、从已验证备份恢复并启旧配置；没有删除旧版本和备份。成功后再收到的新用户数据不在旧快照中，后续人工回退必须先暂停并保留新数据，不能直接覆盖在线数据库。

部署脚本与完整记录保存在服务器私有目录 `/opt/research-openim/ops/skills-11cd20a9`，包含images.yaml、Dockerfile、deploy-skills.sh、audit-skills.mjs、基线与日志。私密配置未复制到Git。

真实HTTPS六项检查通过：公网版本、固定上游包私人安装、完整59120字符说明 / 120参考文件保存、另一合成账号源码404、绑定自有Agent与独立公开介绍、公开介绍不授予调用和源码权限。合成技能最终已停用 / 解绑 / 撤公开，两个会话logout，账号与审计记录保留。没有配置真实模型Key、消耗供应商额度或修改用户账号。

## Windows与公开更新

2026-10-08 **18:01:21北京时间**，[v0.6.0](https://github.com/luoyan96/personal-agent/releases/tag/v0.6.0)正式发布。安装文件 `D:/deepseek-agent/PersonalAgent-Windows/0.6.0/ResearchWeChat_0.6.0.exe`，86384427字节，SHA256 `77f448b0f5bd56ac3412076d35265eb25fc8b9b97e0c63e01404cfcd29712908`。

exe / blockmap / latest.yml与固定公开GitHub feed门禁通过。四个远端资产size / SHA256与本地一致；不使用Authorization读取公开latest与实际latest.yml，字节与本地清单完全一致。设置 → 版本更新可检查 / 下载 / 确认重启。未替用户安装或重启应用，原appId / 数据目录保持；升级前复制未确认发送文字。

实际打包0.6.0登录页、原生OpenIM与技能preload入口启动通过，新的独立profile；未登录401保持。安装打包曾失败：子路径专用研究技能包没有require根入口、软链接目录未解析到实际pnpm依赖位置。已修正安装包依赖发现逻辑并重打包，失败证据保留，不改变Skill执行权限。

完整CI47文件 / 588项、生产021两项、B0 / Web生产隔离通过；桌面类型 / 原生导入三项、真实隔离Electron组件安装 / 绑定 / 文字调用、记录与1024窗口通过。真实文件选择器返回模拟为原生解析样本，模型合成；未验完整绘图流程。固定源码11cd20a的GitHub [37759957391](https://github.com/luoyan96/personal-agent/actions/runs/37759957391)Ubuntu22.19 / 24和Windows24全部通过。

证据在Git外 `.runtime/private-skills-20261008`，含GitHub固定上游下载、实际模型输入完整性、界面截图、线上检查 / 部署截图、CI / 打包 / 更新门禁与发布收据。后续部署文档提交不改变运行源码、安装包和v0.6.0标签。执行边界见[私人技能说明](../development/private-skills.md)。
