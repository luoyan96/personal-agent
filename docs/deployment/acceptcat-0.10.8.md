# AcceptCat 号与 Windows 0.10.8 交付

2026-10-17，北京时间。用户要求把唯一账号的展示、复制及联系人查找入口改清楚。本批同时交付实际安装包。

## 实现

- AcceptCat号直接使用现有注册用户名，区分大小写；昵称和内部contact/member/IM ID分开，没有新造另一套号码，也没有改接口字段或账号数据。
- 头像菜单、我的资料、真人联系人名片、添加联系人窗口显示实际号码；复制按钮只复制原始username，不带@、地址或内部ID。字段只读；查找依旧是完整号码精确匹配，发送真实申请/等待同意。
- 登录/注册及验证/重号/账号密码错误统一称AcceptCat号，注册姓名与真人资料编辑称昵称；保留原登录兼容。
- `AcceptCatAccountNumber`复用作用域保护：写剪贴板成功才显示已复制；失败聚焦、选中号码并提示Ctrl+C。关闭/换账号或资料后清除旧反馈。已经请求的系统剪贴板写入不能撤回，此处保护显示和下一次操作，不冒称可撤回已复制内容。
- 头像触发改为有名称的语义按钮，支持键盘；添加窗口隐藏时停止查询，API读取使用AbortSignal。没有新增权限、手机号绑定、二维码、公开资料或修改用户名入口。

## 验证

证据Git外 `.runtime/acceptcat-account-20261017`。

- 客户端定向41项通过（现有账号规范/密码保持与卡片、导航、广场回归）；`focused.log`。类型`pnpm exec tsc --noEmit`通过，`typecheck-final.log`。仅客户端，无共享包/Skill/API修改，不重复根共享全套。
- Browser plugin not available，已有Playwright+隔离Edge，实际React头像/资料/通讯录/申请/注册及HTTP/SQLite八组通过，`qa-proof.json`。1536×1024与1024×726截图已检查，无横溢/框架覆盖层，pageerror0；既有Antd/Router弃用警告和特意登出401/重号409保留，无未解释console错误。
- 实际浏览器剪贴板读回号码与大小写一致；只读资料、错误大小写/昵称不匹配、精确查号→发送真实申请→新合成账号在真实申请UI同意→服务返回accepted/chat权限，通过。失败与pending剪贴板为明确夹具；跨账号晚反馈不显示旧号码。没有生产账号、真实外发消息或模型验证。
- 原夹具昵称accessible-name定位和人/Agent同名匹配失败保留；已按实际输入placeholder及号码定位。动画等待包含暂停动画而卡住的一次运行保留 `qa-aborted.json`，随后限时定位出截图动画等待问题，改为有界字体等待/截图禁用动画，未修改产品行为或放宽鉴权/限流。

## 实际安装包

分支 `release/acceptcat-0.10.8` 接续PR55 / e099cc1；固定产品/打包源码 **c88f2285d78c69e81785d4f8e34dc67e049e4b2c**。

- Windows x64 NSIS：`clients/openim/release/Base/0.10.8/AcceptCat_0.10.8.exe`。
- 桌面副本：`C:/Users/luo/Desktop/AcceptCat_0.10.8.exe`，安装说明同目录。
- **87,393,639字节**，SHA256 **beee9d36df9bed4af51cd63b8bf18d26109cccc6ab8ebe503ed3670f21cb15a1**。
- `windows-build.log`：生产科研模式，Electron22.3.27、55运行依赖、NSIS及blockmap通过，publish never。
- `installer-proof.json` / `verify-installer.log`：ASAR版本0.10.8、16生产JS逐字节一致，新号码/复制/查找行为和既有广场/下载/猫素材核对，没有QA夹具。
- `nsis-payload-proof.json`：从实际安装器提取EXE/ASAR，与受测win-unpacked哈希一致。
- `electron-smoke.log`：真实打包程序隐藏、临时隔离用户数据启动，原生桥和renderer就绪并稳定通过；仅关闭测试子进程，既有electron-log重复initialize警告保留。

## 安装与上线边界

退出旧版，双击桌面0.10.8覆盖安装，无需先卸载；没有代用户安装、关闭已登录窗口或清理旧数据。保留0.10.7的其他修复。

本批沿用既有用户名和联系人API，**无需后台迁移/新接口**。没有部署API/worker、目录运营发布、公开GitHub Release或自动更新源。`public-release.json`重新核实latest仍v0.6.0；0.10.8是实际本地试用交付。继承PR50超长Skill正文极限边界及PR51两项说明发布仍分别待办，不冒称在线，不阻挡本次号码入口的安装使用。生产容器版本沿用已有记录，本轮没有重新inspect生产。
