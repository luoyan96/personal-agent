# AcceptCat 0.10.12 Windows 交付

日期：2026-10-18（北京时间）。分支 `release/acceptcat-0.10.12` 接续 PR60 / a6bb210；产品和安装包源码 **da1858ecb7fe2876fc25b11a714d4cdf4f51e45c**。

## 改了什么

- 工作台取消并列的“我的技能”栏目，统一在“我的 Agent”里管理。
- 助手配置内使用“技能 / 资料”切换，展示真实绑定数量、版本和启停；可直接进入技能库添加或管理方法。
- 技能库保留安装、更新、授权、版本和素材管理，带助手名称的明确绑定操作保留其他绑定与授权，返回重新打开原助手。
- 兼容旧 Skill/catalog 链接；目标助手验证、账户切换隔离与原资料绑定保持。

客户端 27 项、最终类型、7 组分阶段真实 React/HTTP/SQLite 界面和两种桌面实拍通过。合成账号、资料、目录事实与包选择器投影；不计真实模型/IM或原生文件选择验证。首败和实际边界见[实现与 QA](../development/agent-skill-management.md)，证据 Git 外 `.runtime/agent-skill-hierarchy-20261018`。前批 PR60 三平台 Foundation 已读回 SUCCESS；本批不改共享代码/内置 Skill 内容，不重复根全套。

## 实际安装文件

- 生成：`clients/openim/release/Base/0.10.12/AcceptCat_0.10.12.exe`（Git 忽略）。
- 桌面：`C:/Users/luo/Desktop/AcceptCat_0.10.12.exe`，安装说明同目录。
- 大小 **87,403,174 字节**；SHA256 **990c217477b6747d49c5ae8da32bade0437df7ce1febc01f6dc01275aa900892**。
- ASAR SHA256 **2e7de36374f464a1bf8c2be3f9ae6a7f7cc0cd18732796748ddacb2882b0d7a4**。
- EXE SHA256 **c4b25cb6b3ef5480100752b7c7031632e533a2726da9f2cd1914c3cd0334897a**。

实际 Electron22.3.27 / 55 运行依赖 / NSIS / blockmap 构建通过。ASAR 版本及 15 生产 JS 与构建产物逐字节一致，核对新层级/目标绑定文案、旧可靠导入/名片/排序/下载、猫咪素材与无 QA 内容。实际 NSIS 内 EXE 和 ASAR 与受测 win-unpacked 一致。临时用户目录、隐藏原生桥及 renderer 稳定启动通过，既有 electron-log 重复 initialize 警告保留。

退出旧版后运行本包覆盖安装，无需先卸载。没有代安装、关闭用户当前软件或删除旧包/数据；应用身份与数据目录保持。

## 后台和发布

无新接口或数据库迁移，本次界面兼容原后台；未部署 API/worker、发布目录、公共 Release 或自动更新源。本轮实际 latest 核对仍 v0.6.0，不能声称更新按钮会下载 0.10.12。源码推送/草稿 PR 与安装包公开发布分别记录。

PR50 后台正文边界、三项社区目录运营与既有阿里云维护登录待办保持，不重复请求。本轮不新检查生产容器，旧47c42ac / contract0.25 / chat1.12 / schema022仅沿用记录。
