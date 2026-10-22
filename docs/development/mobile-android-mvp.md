# AcceptCat 安卓首批试做

日期：2026-10-23（北京时间）。负责人：luoyan96；本批由当前Codex聊天实现。用户明确启动手机试做，覆盖旧路线图手机暂缓安排，Windows主线继续。独立克隆 `D:/deepseek-agent/acceptcat-mobile` 的 `feat/mobile-android-mvp` 从fetch后的主仓库 `main/e393247538825d3cb04512f3c7a90ebdbb09a006` 创建。原桌面目录开始核对时干净，没有在其中切分支、安装依赖或改文件。

## 已实现与边界

- 独立手机布局、对话/我的导航、安卓返回键、键盘输入、账号信息和退出。
- 沿共享契约验证账号，用户名两端空白按规则移除，密码逐字保留；没有注册或新账号体系。
- SecureStore保存绑定服务来源的 `rap_session`；启动向后台验证并获取CSRF；过期/撤销清除本机登录；断网保留加密会话并允许重连。
- 打开同一后台的本人助手，最近100条历史、更早消息、跨分页增量读取和连续文字追问。
- 显示真实的发送中、回执未确认、已发送、排队、生成中、模型不可用、失败和已回复。只展示服务端规范消息，无固定“已连接”或模拟回答。
- 网络重试沿同一文本/幂等键；一次只保留一个未确认发送。模型失败重试需用户明确确认，使用后台remainingBudget和版本；回执丢失仍复用同一重试键，不自动重跑模型。
- 前台2.5秒轮询，后台暂停、回前台刷新；退出/账号变化/组件销毁阻止旧请求迟到写入。

首批不含任务、资料Agent、附件、推送、课题组操作、模型设置、建议事项确认、Markdown富文本和iOS交付。既有附件或待确认事项提示在桌面查看，不在手机暗中执行。草稿/未确认发送只在当次登录进程内存保留；关闭进程后先核对服务端历史，不自动重发。账号/会话和资料权限仍由既有后台校验；未修改后台、共享契约、数据库、DSH调用链或Windows更新通道。

## 技术版本与OpenIM决策

独立 `clients/mobile/pnpm-lock.yaml` 与仅包含本工程的pnpm workspace，`pnpm@11.21.0`；根锁和Windows锁不变。`file:../../packages/contracts` 消费共享契约构建产物，不导入Electron IPC、桌面UI、文件路径或 `window.electronAPI`。

| 组件 | 固定版本/选择 |
| --- | --- |
| Expo | 54.0.37 |
| React Native / React | 0.81.5 / 19.1.0，新架构 |
| TypeScript | 5.9.3 |
| expo-dev-client | 6.0.21 |
| expo-secure-store / expo-crypto | 15.0.8 / 15.0.9 |
| safe-area-context | 5.6.2 |
| Native HTTP | 自编本地Expo module，Android OkHttp4.12.0；Swift结构保留，iOS未验证 |
| 业务契约 | 0.29.0，既有接口 |
| 安卓生成模板 | Expo内置；Gradle8.14.3/JDK17/API36/NDK27.1.12297006 |

已核对[Expo SDK54/RN0.81/React19.1说明](https://expo.dev/changelog/sdk-54)、[官方配套版本](https://github.com/expo/expo/blob/sdk-54/packages/expo/bundledNativeModules.json)、[development build](https://docs.expo.dev/develop/development-builds/introduction/)、[本地Expo模块](https://docs.expo.dev/modules/get-started/)。选择可固定组合，未追逐新大版本；54.0.38首次被24小时依赖成熟期拦截，最终54.0.37通过版本检查，没有关闭守卫。

npm与[官方SDK](https://github.com/openimsdk/open-im-sdk-reactnative)当前为 `@openim/rn-client-sdk@3.8.3-patch.12.4`：patch.10.3起支持Expo development build，patch.12起[Android core3.8.3-patch12+1](https://github.com/openimsdk/open-im-sdk-reactnative/blob/main/android/build.gradle)声明支持16KB页。React/RN peer为 `*`，示例较旧，不能据此宣布新架构组合实机通过。

本仓库OpenIM Server固定 **v3.8.3-patch.15**，桌面SDK **3.8.3-patch.15.1**。现有 `OpenImSession/imSession`、token lease和回调策略只接受平台 **3/5**；[官方枚举](https://github.com/openimsdk/open-im-sdk-reactnative/blob/main/src/types/enum.ts) Android为 **2**、iOS为 **1**。冒用桌面平台会与桌面同平台force_logout/租约耦合，单装npm包无法接现网安卓IM。

因此首批**没有安装或嵌入OpenIM RN SDK**，先走既有授权HTTP聊天接口/DSH worker，轮询规范消息与生成状态。这是根据服务端契约收窄首批交付，不是断言原生包不能编译。后续独立兼容平台2/1、租约、回调与撤销，再验证SDK/新架构/16KB页/服务端组合及来源许可、接实时事件与推送；首批无需部署后台。Expo Go不能加载本工程原生模块，必须development build。

## Cookie/CSRF与接口

| 流程 | 既有接口 |
| --- | --- |
| 登录 | `POST /api/v1/auth/login`，读取Set-Cookie rap_session |
| 恢复 | `GET /api/v1/auth/session`，验证存活、获取member/expiresAt/csrfToken |
| 本人助手 | `POST /api/v1/chat/personal-conversation` |
| 发文字 | `POST /api/v1/chat/conversations/{id}/agent-messages` |
| 读取 | `GET /api/v1/chat/conversations/{id}/messages`、`GET /api/v1/chat/turns/{id}` |
| 明确重试 | `POST /api/v1/chat/turns/{id}/retry`，版本及剩余预算 |
| 退出 | `POST /api/v1/auth/logout`，撤销该次会话 |

不假设Bearer Token。原生HTTP使用独立无CookieJar客户端，显式附当次Cookie、服务来源Origin、写操作CSRF；拒绝跳转、不共享RN全局CookieJar、不记录请求体。后台继续Origin/CSRF/ACL/会话撤销规则。Cookie存SecureStore（Android Keystore/iOS Keychain），不存密码、模型密钥或CSRF到磁盘；Android关闭备份并保留SecureStore排除规则。退出立即停止使用旧登录并清理安全存储，清除失败准确提示；离线退出不声称已撤销服务端会话，服务端原有效期仍适用。iOS重装Keychain保留行为需未来实机检查，本批无iOS结论。

默认来源 `https://chat.acceptcat.com`。测试服务可在本目录 `.env.local` 设置公开的 `EXPO_PUBLIC_API_ORIGIN`，只接受HTTPS来源（无路径/账号/查询），变更后重启Metro或打包。没有任意服务地址输入界面或自动发送私人账号的验收流程。

## 开发与安卓构建

```powershell
# 根目录：Node >=22.19.0、pnpm11.21.0
pnpm install --frozen-lockfile
pnpm build
cd clients/mobile
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm exec expo install --check
pnpm export:android

# 原生工程由配置和modules重建；android/、ios/不进Git
pnpm prebuild:android
# 本机JDK17、SDK36/build-tools36、NDK27.1、CMake3.22
# 为当前终端设置JAVA_HOME和ANDROID_HOME
# 此命令只构建连接Metro的调试APK，不代安装
.\android\gradlew.bat -p android :app:assembleDebug --no-daemon
# android/app/build/outputs/apk/debug/app-debug.apk
pnpm start
# 开发者自己明确选择设备安装时使用，本批没有运行
pnpm android

# 无需Metro的内部预览包：模板调试签名、仅arm64真机
# 必须输出在仓库外；不使用正式发布签名
pnpm build:apk D:\deepseek-agent\.runtime\acceptcat-mobile-20261023\artifacts
```

`build:apk`通过assembleRelease内嵌Hermes JS，模板调试签名仅供内部安装，非商店/公开Release；正式签名与升级身份另行安排。`.expo/dist/android/ios`和APK、运行记录/密钥不进Git。GitHub `Mobile Android preview` 在相关PR上执行类型、隔离HTTP测试、版本检查、JS导出与原生构建，产物为14天Actions artifact，不修改Windows发布通道。

## 检查、产物与下一批

本机类型、Expo配套版本、Android prebuild/自编模块自动链接、Hermes业务代码导出通过；移动 **11项** 检查通过，涵盖真实本地HTTP/socket/SQLite的合成账号登录恢复、注销/跨账号拒绝、迟到响应隔离、丢失发送回执的幂等重试、合成模型两轮回复、无模型明确不可用、剩余预算重试与105条分页历史。没有使用真实账号、私人材料或真实模型密钥。根完整CI **749项/58文件**、2项生产CLI/HTTP、B0与生产无夹具通过。首轮跨账号403预期与实际404不符，修正隐藏资源语义断言，失败日志保留。

**APK原生构建中，尚未确认生成；真机可运行、真实账号恢复和真实模型聊天均未验收。** 最终产物/PR在批次完成记录追加，JS打包不等于APK或真实聊天通过。Git外证据 `D:/deepseek-agent/.runtime/acceptcat-mobile-20261023`：依赖成熟期拒绝、版本调整、并行换依赖造成的首轮Metro失败、成功导出、测试/根CI、工具链与原生构建日志。失败保留。

下一批先由用户自行安装、验证已有账号与两轮聊天，按实际反馈修兼容/断网/生命周期问题，再选任务或资料Agent入口。OpenIM移动平台、推送、附件、课题组与iOS分别推进；不在试做中暗中迁移后台或复制整个桌面端。
