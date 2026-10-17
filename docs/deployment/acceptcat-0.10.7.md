# AcceptCat 0.10.7 Windows 安装包

2026-10-17，北京时间。用户明确要求把已完成改动更新进安装包；本批不以预览或源码提交代替交付。

## 实际文件

- Windows x64 NSIS：`clients/openim/release/Base/0.10.7/AcceptCat_0.10.7.exe`。
- 已交付桌面副本：`C:/Users/luo/Desktop/AcceptCat_0.10.7.exe`，安装说明同目录。
- 大小 **87,390,081 字节**；SHA256 **3941d839f8968626d481010eadf9afeba86c912b0ad224ec9de29637720b5834**。
- 打包源码 **595eddaa777d082a8d690f559530700a169083a1**，分支 `release/acceptcat-0.10.7`，接续 PR54 / c27170a，仅把桌面版本0.10.6改为0.10.7。App ID、包名、NSIS策略及SDK版本未变。

## 本包包含

- GitHub-only发现，推荐/仓库Star热门/代码最新/科研方向，内置模板在我的Agent。
- 真实添加状态决定查看/Agent配置/和它聊天；社区Skill实际启用并绑定本人站内Agent后提供动作，多绑定可选对象，停用/解绑/读取失败不冒充可聊天。
- 首次新Single会话选择与导航同tick修复，异步期间账号/页面/会话变化保护保持；模板改名后按实际所属核验复用ID。
- 继承资料库所选版本原件下载的类型/大小/SHA校验、停止与重试，以及近期已验证Skill导入改进。

## 实际检查

证据 Git 外 `.runtime/acceptcat-0.10.7-20261017`：

- `windows-build.log`：Vite/Electron22.3.27、55份已安装运行依赖、实际Windows x64 NSIS与blockmap构建成功；使用生产科研模式、关闭开发工具，publish never。
- `verify-installer.log` / `installer-proof.json`：实际ASAR内版本0.10.7、16份生产JS chunk字节与本次构建逐一相等，聊天/配置/排序/下载行为代码与猫咪素材存在，原生SDK/Skill/安装器依赖存在，没有QA URL/合成绑定/演示标题；桌面副本哈希一致。
- `nsis-list.log` / `nsis-extract.log` / `nsis-payload-proof.json`：从实际安装器嵌入的7z payload只提取 AcceptCat.exe 与 app.asar，两者哈希均与受测win-unpacked完全一致。7z识别自解压EXE时的尾部数据提示为SFX封装，不是文件校验失败；未执行用户安装。
- `electron-smoke.log`：实际打包程序以临时隔离用户目录、隐藏窗口启动，原生SDK桥与renderer就绪并稳定通过；仅停止本次测试进程。既有electron-log重复initialize警告保留，没有未捕获主进程异常或renderer失败。
- 继承产品38项定向与14组界面证据见[卡片改动](../development/agent-card-actions.md)。本批仅版本与交付文档，不重复已通过测试。`source-ci.json`核实PR54 c27170a / run39021205757 Linux22、Linux24、Windows24三平台均SUCCESS；不覆盖此前失败记录。
- `public-ready.json`：只读公网ready200，contract0.25 / database-storage-authentication ok，harness not_verified。未登录用户账号或检查生产容器；生产47c42ac / chat1.12 / schema022沿用已有部署记录。

## 安装与边界

退出旧客户端，双击桌面安装包覆盖安装；无需先卸载，沿用原安装身份与数据目录，NSIS保留 `deleteAppDataOnUninstall:false`。没有代用户安装、关闭已登录窗口或清理旧文件。

**本批已交付新本地包，没有部署后台、迁移、公开GitHub Release或修改自动更新源。** 本轮UI沿用现有API，用户能先安装体验。继承PR50的超长Skill正文120,000极限边界不能冒称线上已修复，仍需API/worker配套发布；PR51新增两项来源描述仍待原运营流程，界面显示服务实际目录。没有把这两个独立待办继续阻挡本轮UI安装包交付。

`public-release.json`重新核实正式latest仍v0.6.0 / ResearchWeChat_0.6.0.exe（2026-10-08），不是此本地试用包；设置内自动更新源不会因为本机打包就出现0.10.7。后续需另行完成正式发布流程。
