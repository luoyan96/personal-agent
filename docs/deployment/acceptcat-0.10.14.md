# AcceptCat 0.10.14 Windows 交付

日期：2026-10-18（北京时间）。`release/acceptcat-0.10.14` 接续 PR63 / `9b32c56`，产品与打包源码 **6d643df393b91ce9f5a5c6d3bfb6b6d6a173d3fb**。

## 本次体验

- 科研任务与联系人协作入口分开；计划支持统一安排负责人/待认领，确认前逐步核对分工、交付和日期，成员仍需接受、成果仍需验收。
- 计划步骤、团队总览和个人任务使用准确类型的工作台链接；可重开同一任务，发起人可回到所属计划。
- 工作台总览和个人助理聊天提供同一份实际任务入口；委派回执按真实执行编号定位对应持久任务，任务内可返回有权限的来源对话。
- 预选 Agent 同时加入联系人任务草案，移除时清除预选；修复从科研详情新建个人任务残留类型的问题，状态名称显示中文。
- 包含上一批尚未打包的聊天折叠按钮移除、未加入课题组的空状态及负责人实际网页邀请入口。

详细实现与边界见[任务衔接](../development/assistant-workbench-tasks.md)及[课题组身份](../development/lab-capability-membership.md)。课题组仍由维护者开通、负责人网页发注册邀请码；没有新增自助开组、已有个人账号加入、多课题组或科研工具执行。

## 实际文件与验证

- Windows x64 NSIS：`clients/openim/release/Base/0.10.14/AcceptCat_0.10.14.exe`。
- 桌面交付：`C:/Users/luo/Desktop/AcceptCat_0.10.14.exe`，安装说明同目录。
- **87,418,294 字节**；SHA256 **b8700d88411776da4716ef0ea1695a031aaee995562b1b84cfa88435e4ff02e7**。
- ASAR SHA256 **d817c77eeed01b9bf6e79328aeec06a890b21de3066320a5b832ebf95e62780a**。
- EXE SHA256 **2191d7c9b54802dcb5b923f0179ae1cea71d0938ebf774942632694f8f16ee6e**。

实际 Electron22.3.27 / 55运行依赖 / NSIS / blockmap 构建通过。17份生产JS与最终dist逐字节一致；新任务入口、分工/来源链接与原有素材/号码/名片/技能入口、品牌素材、无QA夹具及旧折叠控件核对通过。实际安装器提取出的EXE/ASAR与受测win-unpacked一致；桌面副本哈希相同。

实际打包程序在新临时用户目录隐藏启动，原生桥及renderer就绪，输出 `OPENIM_ELECTRON_READY` 后稳定检查通过。既有 electron-log 重复 initialize 警告保留，没有当成新功能失败或静默删证。

32项客户端定向、最终类型、11组分阶段真实React/HTTP/SQLite/合成ChatWorker与1536×1024/1024×726实拍通过，pageerror0。原生SDK/会话映射为投影，来源对话返回的本地IM未连接已按失败状态验证；没有真实模型/IM/真实科研质量结论。新增6项定位边界在类型修正后再次通过，无共享/内置Skill改动，不重复根完整CI。

证据在 Git 外 `D:/deepseek-agent/.runtime/task-workbench-20261018`：`qa-summary.json`、`windows-build.log`、`installer-proof.json`、`nsis-payload-proof.json`、`electron-smoke.log`、各阶段首败与实拍。

## 安装、后台与发布

请自行退出旧客户端后运行桌面新安装器覆盖安装，无需先卸载。没有代安装、关闭用户现装或删除旧包/账号/数据，应用身份和数据目录保持。

客户端使用既有API，无新契约/迁移或配套后台部署。本次未部署API/worker、发布社区目录、公共Release或更新源；实际latest重新读回仍v0.6.0。推送源码不会让旧客户端自动升级为0.10.14。

生产47c42ac / contract0.25 / chat1.12 / schema022仅沿用历史部署记录，本次未inspect生产。PR50正文边界、三项社区目录运营与既有维护登录待办保留，不重复请求；前批PR63/9b32c56三项Foundation已读回success，本支远端检查另记。
