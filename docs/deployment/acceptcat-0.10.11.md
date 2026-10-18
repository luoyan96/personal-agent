# AcceptCat 0.10.11 Windows交付

日期2026-10-18（北京时间）。分支 `release/acceptcat-0.10.11` 接续PR59 / 8b3386b，产品与安装包源码 **d0386f0503701eff530a89e0e282ecc93354901d**。

## 本次改动

- 广场去掉“发现能力/课题组能力/我的Agent”整排导航，直接显示GitHub推荐、最热门、最新和方向筛选。
- 课题组能力移至工作台→课题组能力（`view=capabilities`），本人及内置助手移至工作台→我的Agent（`view=agents`）。
- 配置/资料绑定/聊天动作/名片公开管理复用原流程，权限保持；工作台窄窗栏目与面板可用。

客户端27项、类型、7组真实React/HTTP/SQLite分阶段流程与1536/1024实际截图通过，pageerror0，无未解释错误。没有共享/内置Skill修改，不重复根全套；前批PR59三平台Foundation本轮已读回SUCCESS。详情、首败与边界见[实现及QA](../development/square-workbench-navigation.md)，证据Git外 `.runtime/square-workbench-20261018`。合成账号与目录，不计真实模型/IM验证。

## 实际安装文件

- 生成：`clients/openim/release/Base/0.10.11/AcceptCat_0.10.11.exe`（Git忽略）。
- 桌面：`C:/Users/luo/Desktop/AcceptCat_0.10.11.exe`，安装说明同目录。
- **87,401,103字节**；SHA256 **0c763b4dd18ea9f34c3d629327d83dc4bdf3f46f366a4668d273b8cbd0568530**。
- ASAR SHA256 **39da1e08a001525587bbe5ff6c5e9ce4b1638cca5ba3f2f18c71b1ff2710e19f**；EXE SHA256 **1feadbc7abd04344855e18f2ae10416b846a8b2e7b9a09f9d7833ab8cb4f1126**。

真实Electron22.3.27/55运行依赖/NSIS/blockmap通过；ASAR版本与15生产JS逐字节一致、新入口/无旧范围行/品牌素材/无QA核对通过。实际安装器payload EXE和ASAR匹配受测win-unpacked，临时用户数据隐藏启动，原生桥及renderer稳定就绪；既有electron-log重复initialize警告保留。

退出旧版后覆盖安装，无需先卸载。没有代安装、关闭现装或移除旧包与数据；应用身份/数据目录保持。只核对关闭本轮4866/4867 QA服务，旧预览保持。

## 服务与公开发布

本次是现有前端入口调整，无新API或迁移，兼容原服务；未部署API/worker、发布社区目录、公共Release或自动更新源。公网actual latest本轮核对仍v0.6.0；不是旧客户端更新按钮已能下载0.10.11。源码推送/PR与安装器公开发布分开管理。

既有维护登录、PR50解析器边界和三项社区目录运营待办保持。本轮不新inspect生产容器，旧47c42ac/contract0.25/chat1.12/schema022仅沿用此前记录。
