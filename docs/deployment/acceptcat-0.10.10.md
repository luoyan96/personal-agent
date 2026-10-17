# AcceptCat 0.10.10 Windows交付

日期：2026-10-18（北京时间）。分支 `release/acceptcat-0.10.10` 接续PR58 / da6ec83，产品和安装包固定源码 **24858567a318ab4302f53eead42713e1405dea1f**。

## 本次改进

- Skill原件加入资料库共用现有文件导入流程：先选集合、读取原件，再核对文件和范围并确认上传。
- 读取期间锁定目标，原件路径/修订/SHA256预填备注；未知结果使用相同快照/key确认，避免重复来源。集合范围变化后阻止旧窗口上传。
- 换账号/会话/技能或关闭页面丢弃迟到的预览、状态和准备结果；清单加载失败不再冒充“没有原件”。
- 普通本机文件选择和导入保持，名片/AcceptCat号/广场排序及卡片/资料下载等先前改进继续包含。

入口：工作台→技能库→本人Skill→本机原件与素材→选择文件→加入科研资料库。确认前可编辑资料信息，选择阶段不会上传。完整[实现、验证和限制](../development/skill-material-import.md)；证据Git外 `.runtime/skill-material-import-20261018`。

## 检查与实际文件

客户端22项、类型、真实React/HTTP/SQLite/本机原件九组及窄窗/普通导入专项通过；前批PR58三平台Foundation实际读回SUCCESS。没有共享或内置Skill改动，未重复根全套。两种Windows窗口实拍已看，pageerror0，既有和故障注入日志分别解释；不计真实模型科研质量验证。

真实Electron22.3.27、55运行依赖、科研模式生产构建/NSIS/blockmap通过；实际ASAR版本0.10.10、16生产JS与受测dist逐字节一致、新交互/品牌素材/依赖/无QA通过，实际安装器payload EXE与ASAR一致。隔离临时用户数据隐藏启动，原生桥及renderer稳定就绪；既有electron-log initialize警告保留。

- 仓库外生成路径：`clients/openim/release/Base/0.10.10/AcceptCat_0.10.10.exe`（Git忽略）。
- 桌面副本：`C:/Users/luo/Desktop/AcceptCat_0.10.10.exe`，安装说明同目录。
- **87,396,801字节**；SHA256 **5f046ace333612dbf3c8d757364c14fad7800b131c8a226d6f1bd2c99e78a2e8**。
- ASAR SHA256 **26fba8d6faacb7624ff2d2ea57dbe9231e3568351662c6edf5d5d467d77fc909**；实际EXE SHA256 **d8f4872488aebb989710f0b5fabfab9017c49c730edd093b25e354a1dea5144e**。

退出旧版后运行新文件覆盖安装，无需先卸载。安装身份/数据目录保持；未代用户安装、关闭其已登录窗口或移除旧安装包/数据。只关闭本轮自建QA4856/4857服务，按完整进程命令核对并记录；旧预览未动。

## 发布边界

本功能沿用既有导入/版本/幂等与权限API，**无需后台升级或迁移**。没有部署API/worker、发布社区目录、公共Release或自动更新源；公网latest实际仍v0.6.0，本文件是小范围试用交付。安装器不会因单纯推送分支而出现在旧客户端更新按钮。

PR50超长正文边界和三项目录运营仍待原维护登录，不重复提问。本轮未新inspect生产容器；47c42ac/contract0.25/chat1.12/schema022仅沿用旧记录，不能把前端修复称为这些独立待办已上线。
