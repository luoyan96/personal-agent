# Windows 客户端更新

## 使用方式

Windows 0.1.1起接入 `electron-updater` 5.3.0，更新来源为本项目公开GitHub Releases。需要运行NSIS安装版，从安装后生成的“科研微信”快捷方式启动。0.1.0没有检测器，须手动安装一次0.1.1；直接复制的免安装文件夹不做原地替换。

安装版启动15秒后检查，运行期间每6小时及电脑唤醒后检查。发现正式新版本时，在应用前台显示提示；后台检测结果保留，回到窗口时提示。右键系统托盘图标可随时“检查更新”，同时显示真实桌面程序版本。检查不要求聊天账号登录。

用户点击“下载更新”才下载，任务栏图标显示下载进度。库校验完整安装包后才提供“安装并重启”，需先发送或保存未完成内容。“稍后”不会在退出时自动安装；再次“检查更新”可以取回已下载版本。失败后当前版本继续运行，提示手动重新检查；不自动降级、装预发布版本或运行Web安装器。

更新检测在原生主进程；聊天页面不具有下载 / 安装IPC，也不能指定更新网址。保留TLS验证、上下文隔离与webSecurity。当前安装包无Authenticode签名，不将SHA512完整性检查称为发布者证书验证；本版本没有禁用库的签名检查或嵌入GitHub Token。

## 发布者步骤

更新Git提交或部署网页本身不会生成桌面升级。需要提升 `clients/openim/package.json` 的正式三段版本号，构建并发布新的安装包与匹配清单。

1. 在独立客户端运行 `node --test tests/desktop-updates.test.mjs`、renderer和Electron类型检查。
2. 使用本项目独立pnpm10.28工程构建Windows：`node scripts/electron-build.mjs --win --x64`。构建指定 `--publish never`，不会顺带上传GitHub。
3. 运行 `node scripts/check-windows-update.mjs`，核对生成的 `app-update.yml`为本项目公开GitHub、`latest.yml`版本 / 文件名 / 大小 / SHA512、安装包与blockmap齐全。
4. 建立指向受测源码的GitHub正式版本草稿（如 `v0.1.1`），一起上传 `ResearchWeChat_0.1.1.exe`、相同名称的 `.exe.blockmap` 和 `latest.yml`。核对所有公开资产哈希再发布草稿。不要先发布一个缺失清单的版本，也不要对已发布版本覆盖不同字节。
5. 真实已安装旧版本检查、下载及重启到新版本分别验收。网页UI和后台仍按自己的部署流程与权限管理；桌面升级不会自行迁移服务端数据库。

云端网页当前8b42d35、API / worker94b26d1、contract0.19 / chat1.8 / schema18保持。本批只改原生更新和发布配置，不需要云端静态部署。启动与检查、下载完整性、实际安装执行的证据须分别记录。

## 当前检查记录

Git外证据保存在 `D:/deepseek-agent/.runtime/windows-updates-20261007/`。控制器5组检查通过：检测零下载 / 安装、明确安装动作、并发只一次、网络失败重试、校验失败 / 迟到或不匹配完成拒绝安装、安装抛错恢复退出旗标和坏版本拒绝。renderer与Electron类型检查通过，保留首次strip-only参数属性错误和pnpm执行入口失败记录。

Windows0.1.1安装包与NSIS blockmap / latest.yml已生成，86257023字节、SHA256 `d3350cdd7405aec2526ac9e917e65970ad901d3a2c96ba4977621795891572a0`，更新资源一致性门禁通过，真实打包smoke与HTTPS登录页成功。`native-final3/report.json`记录真实已打包原生管理器对免安装目录的保护及指导，仅OS提示响应替代，未执行安装。初次重复publish参数造成发布器缺GH_TOKEN失败、后续两个测试main模块导入错误保留；最终使用原默认单次never构建成功，不向包内加凭据。

2026-10-07 11:06:33北京时间，正式[v0.1.1](https://github.com/luoyan96/personal-agent/releases/tag/v0.1.1)发布，安装包源码固定 `e8cffadb38ab5bb3abeb951107491ea39a482c10`；该源码[三平台CI37564725311](https://github.com/luoyan96/personal-agent/actions/runs/37564725311)全部通过。三个公开资产的GitHub digest和大小均与本地一致，`release-published.json`、`upload-verified.json`保存实际收据。

`live-final4/report.json`记录实际打包Electron22和electron-updater5.3从公开GitHub检测到0.1.1并真实下载，库SHA512校验及独立SHA256 / 86257023字节核对通过，收到15次有效进度事件。比较版本明确模拟为0.1.0，其余网络执行器、发布源、安装包与校验均真实；程序实际为0.1.1，没有安装执行，不能称真实旧安装版升级重启通过。首轮`live-final3`的自有验收构造器传入测试adapter，库因此不创建网络执行器，失败报告保留；改用库正常构造并仅模拟比较版本 / 隔离缓存后通过，产品包没有因此修改。

当前用户机器首次安装与之后真正安装升级重启仍待用户执行。之前桌面登录后的文件夹 / 模型验收仍是独立待办，不能用下载通过代替。准确源码及结果在统一状态和项目日志追加。
