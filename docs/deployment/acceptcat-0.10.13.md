# AcceptCat 0.10.13 Windows 交付

日期：2026-10-18（北京时间）。分支 `release/acceptcat-0.10.13` 接续 PR61 / 13eea26；产品和安装包源码 **8acfbed107b222c4c4f404068c8ecc6cbb821eff**。

## 用户可见变化

- 原设置移为侧栏“广场”下方的“我的”，成为独立页面；左上头像直接进入同一页，不再弹出个人菜单。
- 个人信息、模型、记忆、通用设置、版本与帮助集中在我的；我的 Agent 和课题组能力从工作台移入。
- 工作台只保留科研总览、任务规划、我的任务、资料与素材库。定时任务收进任务规划，本机报告收进资料与素材库。
- 旧 Agent/技能/定时任务/报告链接仍可访问并转到正确位置；技能配置、资料/模型保存、号码与名片复制、更新与诊断功能保持。

客户端27项、最终TypeScript、11组分阶段实际React/HTTP/SQLite及1536×1024、1024×726实拍通过；通过阶段pageerror0、无框架错误层。数据为合成账号、资料与模型密钥；原生报告/更新/偏好为明确桥接投影，没有真实模型、IM、更新下载/安装、诊断上报或本机文件打开声明。首败及具体范围见[实现与QA](../development/my-workspace-navigation.md)，证据Git外 `.runtime/my-workspace-20261018`。

## 实际安装器

- 生成：`clients/openim/release/Base/0.10.13/AcceptCat_0.10.13.exe`（Git忽略）。
- 桌面：`C:/Users/luo/Desktop/AcceptCat_0.10.13.exe`，安装说明同目录。
- **87,406,620字节**；SHA256 **d3df15b6280a953a6065e601f357957575321334bdaecb028c743f0eacc591d7**。
- ASAR SHA256 **1a62696a29748a37109bc30f57ca646443d9b283042662b6f992305ab1e9a3a7**。
- EXE SHA256 **7a10123498b5ee4d60691479cfe6991edab2e07448f4a7f757bf2ab391207a7e**。

实际 Electron22.3.27 / 55运行依赖 / NSIS / blockmap 构建通过。ASAR版本、18生产JS与dist逐字节一致、新我的/分层入口及旧可靠导入/名片/排序/下载、猫咪素材、无QA内容核对通过。安装器实际EXE/ASAR载荷与受测win-unpacked一致，隔离临时用户目录隐藏启动，原生桥与renderer稳定就绪；既有electron-log重复initialize警告保留。

退出旧版后运行本文件覆盖安装，无需先卸载。没有代安装、关闭用户现装或删除旧包/数据，应用身份和数据目录保持。

## 后台及发布状态

无新API、合约、数据库迁移或内置Skill内容变化；兼容原后台，不重复根完整CI。前批PR61三平台Foundation本轮已读回SUCCESS。本次未部署API/worker、发布目录、公共Release或更新源，实际latest仍v0.6.0已核对。源码推送不等于旧客户端自动更新可下载0.10.13。

旧生产47c42ac / contract0.25 / chat1.12 / schema022仅沿用记录，本轮未新inspect生产。PR50后台边界、三项社区目录运营与既有维护登录待办保持，不重复请求。
