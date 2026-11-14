# AcceptCat 0.10.110 正式发布回执

UTC2026-11-14T15:51:41Z已公开为Latest：[正式Release](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.110)。本批只升级客户端，后台沿用0.49/039，没有迁移或提示词变更。

## 整合与复核

从main/6779aa24670f6492fb7585fa6f69a38ef81cdb54整合预览版全部改动。独立复核后补修三处P2：成功回执占满50条待发额度、个人任务误显示文件交付而实际只交文字、服务端接收后响应丢失使回执核对按钮被权限变化禁用。成功回执与未发送内容分别有界保存，压力下只收起临时成功回执并提示，保留原请求/幂等键/草稿；个人任务保留文字成果；回执恢复只重放原意图，主进程继续核对权限和字节，不开放新的提交。

626项客户端检查、renderer和Electron类型检查通过。新增六项回执边界与五项实际任务组件回归；原生IPC的丢响应/权限变化、个人文字内容、研究文件显式确认与失败保留通过，实际React/AntD合成浏览器7项通过。先行设计、桌面/窄屏交互和既有992项根CI证据延续预览批次；本次远端三个Foundation和Windows package四项全部成功。

[PR #223](https://github.com/luoyan96/personal-agent/pull/223)最终head `fb9599b1618c22b2513558f6d42b37ff71f7f42c`，四项检查通过后以 `0fae1d3d18ae672c31b5adef4ffe1cfcbc7b3bdd`合入main。正式包固定构建及tag均为fb9599b，1777份输入。公开前确认其为main祖先，且合并后的完整源码树与固定输入完全一致。发布回执后续提交仅更新文档。

## 正式成品

根`desktop:win`完成固定依赖、共享构建、工具和NSIS打包，明确`--publish never`。从EXE提取app.asar及工具，137份页面/主进程资源与本地输出逐字节相同，包含任务/资料/习惯改造、新回执与恢复代码，以及原有缓存、截图、压缩和单URL连接链路。

提取的chatHistory模块由成品Electron在三个独立进程中禁网验证，完整消息与引用持久化、账号和服务隔离、撤回优先及分页通过。提取的Git模块使用files URL有无`.git`两种形式，均识别main/acceptcat-demo并同步819c27947a49d199f77414982ac7f9a284782cd9的6条公开资料；没有修改共享绑定或推送远端。

隔离启动到ready、更新清单/大小/SHA512、四附件GitHub digest与本地SHA256一致。匿名下载latest.yml内容逐字节匹配，正式EXE匿名HEAD返回200、421265849字节。内置科研插件0.4.0、DSH0.2.1-rc.3和固定tectonic保留，rcedit临时文件0份。

桌面正式包：`C:/Users/luo/Desktop/AcceptCat_0.10.110.exe`。

原包：本工作区`clients/openim/release/Base/0.10.110/AcceptCat_0.10.110.exe`。大小421265849字节，SHA256 `cd075cbb9b20a1be01f111432364bc961495b7a51a41b7def698337189dd1539`；桌面副本摘要再次核对。Release四附件为EXE、blockmap、latest.yml、SHA256SUMS.txt；先上传未公开草稿、核对附件，再于合并后公开。

## 证据与剩余边界

`D:/deepseek-agent/.runtime/release-0.10.110-20261114`保存build-source.json、client-all-tests.log、双类型、windows-build.log、installer-audit.json、built-assets.json、electron-smoke.log、packaged-cache.json、packaged-library-result.json、update-check.log、desktop-copy.json、pr223-checks.json、pr223-merged.json、draft-verified.json、public-verified.json、anonymous-download.json与release-assets.json。

补修定向证据在`D:/deepseek-agent/.runtime/chat-recovery-20261114/release-chat-guards-fix-tests.log`和`D:/deepseek-agent/.runtime/task-release-guards-20261114`。隔离依赖缺失和浏览器fixture断言调整记录保留；没有放宽产品超时或权限。GitHub连接器写PR返回403，改用本机已登录gh完成正常PR流程，没有强推或绕过分支保护。

真实账号模型、SDK投递、系统拖放和原生标题栏仍待使用者安装验收；未操作私人消息或文件。既有AntD/Router弃用提示与electron-log重复初始化日志保留；后者在0.10.109同样出现，未阻止ready。本批没有确认最初停止回复的后台根因被修复，修改的是客户端回执保留与恢复路径。预览版回执和最初失败检查继续保留在[本地预览记录](acceptcat-0.10.110-local-preview.md)及其Git外证据目录。
