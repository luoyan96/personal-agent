# 正式网页与桌面服务入口

本批新入口为 `https://chat.acceptcat.com`，媒体为 `https://files.chat.acceptcat.com`；旧 research 站保持独立。部署由总控执行，本说明和配置模板不代表新服务器已启动或验收。

## 构建与上传

根目录先构建唯一共享 contracts，再在客户端用独立 pnpm 10.28.0 锁文件安装与构建。构建环境为 Node.js 24。

```sh
pnpm --config.verifyDepsBeforeRun=false --filter @research-agent-platform/contracts build
cd clients/openim
pnpm install --ignore-workspace --frozen-lockfile
pnpm --ignore-workspace typecheck
pnpm --ignore-workspace build:web
```

上传完整 **clients/openim/dist** 到新版本目录；不要上传 node_modules、.env、.electron-runtime、dist-electron、release 或运行账户文件。正式网页不依赖 Vite 开发服务，也不需要在构建中写入 API/WS token 或模型 Key。科研模式在登录后从真实 `imSession` 取得 IM 公共地址和本人 token。

build:web 显式固定科研模式、关闭开发工具，并在构建后核对 SDK 资源与 HTML 引用，避免本地 .env 的上游演示模式误入正式发行。

以下资源都必须保持同一次客户端构建：index.html、assets、openIM.wasm、sql-wasm.wasm、wasm_exec.js、emojis.json、font、icons。网页挂域名根路径，Hash Router 不改变资源根路径。缺失 wasm/js 必须返回 404，不能被 SPA fallback 变成 HTML。wasm 返回 `application/wasm`，JS 返回 JavaScript MIME。index 和未带 hash 的 SDK 资源采用可重新验证缓存；assets 的内容 hash 文件可长期缓存。安装包内部的 Electron dist 排除了浏览器 wasm，不可代替正式网页 dist。

## 反代与服务端地址

| 外部路径/地址 | 内部入口 | 要点 |
| --- | --- | --- |
| https://chat.acceptcat.com/ | 完整客户端 dist | HTTPS、安全麦克风上下文 |
| /api/ | 127.0.0.1:3217 | 原路径保留，科研 cookie/Origin/CSRF 不改写 |
| /im-api/ | 127.0.0.1:15002 | 去掉 /im-api 前缀 |
| /im-ws | 127.0.0.1:15001 根 URI | Upgrade、Connection、HTTP/1.1、长连接超时 |
| https://files.chat.acceptcat.com/ | 127.0.0.1:15005 | 保留 Host、对象路径、签名查询，MinIO CORS 允许网页 Origin |

[Nginx 示例](nginx.example.conf)放在 http context 下，替换证书与发行目录再执行 nginx -t。80→443 的跳转仅用于页面入口；签名文件 URL 和 WS 必须一开始就是 HTTPS/WSS。MinIO 不挂网页 `/media` 前缀，以免 S3 签名或对象路径被改写。CORS 由对象存储配置并通过真实上传/下载验证，不在 Nginx 重复叠加 Access-Control-Allow-Origin。反代规则依据 [Nginx WebSocket 文档](https://nginx.org/en/docs/http/websocket.html)与 [proxy_pass URI 规则](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)。

科研 API/worker 配置必须一致：

```dotenv
APP_ORIGIN=https://chat.acceptcat.com
OPENIM_PUBLIC_API_URL=https://chat.acceptcat.com/im-api
OPENIM_PUBLIC_WS_URL=wss://chat.acceptcat.com/im-ws
```

OpenIM Server 的 `IMENV_MINIO_EXTERNALADDRESS=https://files.chat.acceptcat.com`；内部 OpenIM API/MinIO 地址仍走容器网络。用户不可访问的 127.0.0.1、Docker 服务名、HTTP 媒体地址不得出现在外部 session 或 sourceUrl。开启派生身份与 mandatory callbacks，保持 fail-closed；浏览器没有 admin token，前端不改这些策略。外部反代不开放回调路径。Access log 不记录 query，因为 WS 和 S3 签名查询包含凭据。

桌面首次启动填写 `https://chat.acceptcat.com` 并保存连接，加载同一套网页和科研 API Origin；原生 SDK 仍走真实 FFI。Mac/Linux 的 SDK platform 与科研桥契约另行验证，本批 Windows x64 包已验证启动。负责人模型配置、普通 IM transport、AI 执行分别检查；没有模型 Key 也应该可以进行真人普通 IM 和媒体通信。

## 真正上线前的验收

总控给出已启动的 HTTPS 页面和独立合成账号文件后，再运行 Git 外的 `sdk-media-review.mjs`。它使用两套独立浏览器会话、真实科研关系同意和 SDK UI：双向文字、任意类型文件选择和下载哈希、拖放、实际 MediaRecorder 录制/取消/发送、对端音频解码播放，以及刷新后的消息保留。自动化音频输入是合成声源，标明不代表真人设备体验；IM SDK 和服务不能替换成 mock。API 和源码静态检查不算 IM 连通验收。

若失败，先按顺序检查：完整资源与 MIME → 公共 session API/WS 地址 → WS 101 与实际 SDK 连接 → canonical 联系人同意/群 joined → callback 策略 → SDK 发送状态 → 文件预签名地址、CORS 与 GET/PUT → 音频加载/解码。文件和录音只走 OpenIM，不能用科研附件上传替代它们作为媒体验收。
