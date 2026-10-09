# AcceptCat 猫咪科研入口（0.8.4）

## 实现范围

用户反馈登录页仍是通用蓝色聊天图标，并指定旧项目 `E:/acceptcat/frontend/public` 可复用。本批沿用 0.8.3 橘猫桌面图标，重做登录、注册、服务连接和原生启动页；聊天/OCR、任务、Skill、模型与更新逻辑沿用已有实现。认证请求与表单校验没有改换。

入口为白底、细标题栏、左侧科研书桌场景与短说明、右侧开放表单。主按钮改为鼠尾草绿色，输入框、文字层次和间距统一。小于 800px 隐藏大图，1024px 桌面缩窄左侧比例，右侧可滚动以容纳注册与可选团队邀请码。普通注册继续不要求邀请码；密码继续最少八位，用户名规则仍来自共享契约。成功与错误使用实际请求结果，不展示虚构连接状态。

两张原图保持字节一致，来源与用途见 [ORIGIN](../../clients/openim/public/assets/acceptcat/ORIGIN.md)。旧项目中的返修任务、论文阅读、科研绘图与 Skill 工作区已有探索，作为后续科研流程参考；不合并旧演示认证或未接通的功能。

## 验证与交付

客户端类型检查与 3 条认证输入/共享契约/中文错误指引检查通过。设计概念和临时证据位于 Git 外 `D:/deepseek-agent/designs/acceptcat-cat-entry-20261009`、`D:/deepseek-agent/.runtime/cat-entry-20261009`。

固定打包源码 **f8e2645c5c7ac8e559e98d4e9400a6b96b8901d3**。真实NSIS `--publish never` 构建、exe/blockmap/latest.yml核对、实际app.asar的版本/原图字节/橘猫图标/身份检查、打包启动门禁通过。

### QA Summary

实际打包入口的10项流程通过；renderer pageerror0。不是演示HTML替代品，截图来自实际0.8.4包中的React页面与独立原生启动窗口。

### Environment

Windows、Electron22.3.27 / Chromium108，独立临时profile；Browser plugin not available，使用隔离Playwright Electron。认证只使用合成HTTP响应与虚构账号，不接触用户凭据。

### Coverage

登录页、密码显隐、Enter提交/禁用重复操作/错误恢复、用户名与八位密码校验、无邀请码注册并返回登录、重复用户名错误、1024×726注册/可选邀请码滚动可达、390×844紧凑布局、服务连接原生URL校验、440×330猫咪启动页共10项。普通注册没有发送邀请码字段；错误显示中文、保留输入。

### Evidence

Git外 `ui-qa.json`、`package-proof.json`、`update-assets.json`、`startup.log`及登录/注册/错误/最小窗口/服务连接/启动截图。概念与最终render已并排查看：真白背景、单一场景卡、61%左侧/开放表单、无图片滤镜、原猫咪图标、绿色主按钮与字体层次吻合。实际按钮rgb(66,106,87)、12px圆角，标题38px，科研图片区域706.5px。真实桌面标题栏更紧凑，表单使用56px而非概念中偏大的输入框；最小窗口右侧允许滚动，紧凑屏隐藏大图，均为可操作性取舍。完整对照记录在Git外 `fidelity-ledger.md`。

预期401/409来自合成错误验收。已有 `electron-log` 重复初始化告警仍存在，不描述为零告警。首轮过早取帧、隐藏窗口rAF等待、启动期间重载竞争、错误调用仅允许连接页的管理IPC及ASAR路径分隔符问题属于验收方法诊断，不计最终通过；最终使用初始化页面、有界等待与Windows规范路径。

### Commands

`pnpm run typecheck`、`pnpm run test:auth`、`pnpm run build:win -- --publish never`、`node scripts/check-windows-update.mjs`、`pnpm run electron:smoke`；Git外Playwright入口脚本与ASAR检查脚本只验收本批范围，没有扩大到聊天/OCR/共享核心CI。

### Remaining Risk

真实账号登录、覆盖安装和系统缩放未在本轮自动操作；聊天/OCR沿用前批证据，本批不声称重验。没有公开Release、阿里云部署或重启用户客户端，现有自动更新尚不会发现此本地候选。

## 本地安装包

**D:/deepseek-agent/AcceptCat-Windows/0.8.4/AcceptCat_0.8.4.exe**，87323352字节。SHA256 **bbb13ee8673e3cce007afa0e4bb25b2afa734da3c71c287e8cbfdacd5d248ff4**；复制后核对一致。同目录有blockmap、latest.yml、SHA256SUMS、安装说明与最终登录截图。固定源码与后续交接文档提交分开；appId `com.acceptcat.researchwechat`、包名、更新仓库和用户数据身份沿用。
