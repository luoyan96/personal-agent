# AcceptCat 的 Catnap 猫咪图标

日期：2026-10-09。Windows 0.8.3本地候选，基于0.8.2 / 9f5f78c。本批仅品牌图标和桌面标题栏，保留图片识字回复等既有流程。

固定桌面源码 `064c9f276c0bc74a07750724c0f6600f525aaa4c`；后续交接文档不改变安装包代码。

## 来源

用户提供桌面截图并说明原来将这只蜷睡橘猫作为桌面应用图标。读取 `C:/Users/luo/Desktop/Catnap Desktop.lnk` 的目标和IconLocation，均指向 `D:/0cat/Catnap Desktop/Catnap Desktop.exe`，图标索引0。从该程序资源图标组1提取ICO，未经重绘；导出其最大256×256透明PNG。原程序未启动，旧安装和快捷方式未修改。

- 原EXE SHA256：`799ea5f94b541edf6c6c10a619f035ab171eb17283590ad0224e379250dde9f0`。
- ICO SHA256：`4e6bb8806e5da9d7265c1e44a4c7c35d937170588394a232e30914f9d1aa8321`，保留16、24、32、48、64、128、256px七档。
- PNG SHA256：`d637a0596e26143571b05e7965e4fddbb9fdb4bfc9599540b2efaf77038ad14c`。

此前素材册中的横卧橘猫与这只蜷睡橘猫不同；本次使用旧快捷方式实际绑定的资源。没有将桌面背景或快捷方式箭头加入图标。

## 接入

`public/icons/icon.ico`进入Windows可执行文件与NSIS安装/卸载及AcceptCat桌面快捷方式；原生窗口使用同内容的`public/favicon.ico`，Windows托盘也读取该ICO。`public/icons/icon.png`、`mac_icon.png`及`src/assets/images/profile/logo.png`使用同一透明PNG；桌面标题栏和关于页显示实际猫图。

appId、package.name、用户数据目录、GitHub更新源和服务地址沿用。Windows下其他平台的托盘图未改，本批不验证Mac/Linux打包。没有新增API/worker/契约/数据库修改。

## 验证与交付

实际检查、固定源码、安装文件和校验和见[当前状态](../current-state.md)。原图视觉已核对用户截图；针对本批只进行客户端类型、构建与实际包图标核对，不重复0.8.2聊天/OCR流程或共享核心CI。

客户端类型、NSIS构建、更新资产、实际app.asar静态图标和版本/数据身份校验、隔离打包启动通过。安装EXE和程序EXE中的七档资源重建ICO均与原ICO逐字节一致。Windows实际DrawIconEx绘制的256px橘猫与原程序渲染一致，已查看。打包程序图标组最后一档目录长度记录不同，按实际资源长度校验；最初严格长度断言失败留档，不计通过。`.NET Icon.ToBitmap`不适合作为本次透明图标视觉判据，其失真图保留；最终采用真实DrawIconEx绘制。启动日志含既有electron-log重复初始化提示，未改日志模块。

本地候选不等于公开更新。未代替用户安装/重启运行中的AcceptCat，也未修改旧Catnap。安装新版后Windows可能暂存旧快捷方式图标；新安装包中的资源以校验记录为准。

Git外提取和校验证据：`D:/deepseek-agent/.runtime/cat-icon-20261009`。
