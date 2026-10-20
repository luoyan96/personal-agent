# Windows0.10.21：系统代理环境下的桌面联网修复

2026-10-20，产品源码 **543dc9cb4716da413fd23afa5ceb2a5154ed4dcb**，分支 `fix/desktop-network-0.10.21`，从干净飞书试点文档head `94aca6b` 接续，没有切main或覆盖修改。

## 问题与修复

用户现装0.10.20，地址正确；公网ready200/0.26.0，但客户端脱敏日志反复ECONNRESET/ETIMEDOUT，最近11:17:32的GET约21秒超时。本机DNS返回代理虚拟地址，隔离Electron22检测到系统代理。同机同URL对比8次Node请求有1次超7秒，8次Chromium均200。旧转发使用Node https.request，未使用浏览器系统代理解析；不能用公开health成功代替登录后的业务验证。

主进程API转发改用[Electron net](https://www.electronjs.org/docs/latest/api/net)的Chromium网络栈，沿用系统代理和证书校验。固定目标、Origin/CSRF、按服务隔离的手工会话cookie保持；独立非持久session不自动发送其cookie。保留总超时、取消、截断处理，写请求没有新增自动重发。跨站重定向拒绝，受限头由Chromium生成，压缩解码后修正响应编码/长度，慢读缓存有界。502/504明确提示连接中断和检查网络/系统代理，真实503保持服务错误。

真实Electron22联调补齐事件顺序、压缩协商、空POST边界：上传close可先于响应；空请求不启用分块，首次非空写入只选择一次流式模式。中间候选没有交付，修正后重新构建最终包。新增独立typecheck:electron，不生成产物或改变原Web项目引用。

## 安装包与状态

Windows x64 NSIS **C:/Users/luo/Desktop/AcceptCat_0.10.21.exe**，**87,425,242字节**，SHA256 **061a5e162c74c877dd65b95d19222aa9b65e0084a65548c317fe3f9b437ee8f7**。沿用安装身份、Electron22.3.27和数据目录；已制作并复制桌面，未代安装、退出现装或清理旧包/数据。用户需覆盖安装才能使用修复。

ASAR SHA256 **7461a96f31dea858b17c422b4b89c34ce73bd87b60377c50faba67994d7d5eda**，EXE SHA256 **a39f6d9576c4ac430f4a34c7bca99386692539adfe17eb7b7ff2d18d2df355d8**。实际NSIS的EXE/ASAR与受测目录匹配；17JS/8CSS逐字节匹配生产dist，52个顶层运行包/55装配包核对，新transport及调用点进入ASAR，旧功能和品牌保留，QA内容未混入。隐藏窗口/独立数据目录的打包应用启动通过OPENIM_ELECTRON_READY，既有electron-log重复initialize警告保留。

**本批无后台部署、迁移、密钥或飞书应用范围变更，无公开Release/更新源变更。** 后台仍 `47c42ac+key-preview.4bc8d1f+feishu.2bbcfbc` / image4ee12e77 / contract0.26.0 / schema023；飞书0.1.0仅罗岩，真实OAuth/选定私人文档试读待验证。

## 实际验收

- 渲染端、主进程类型及36项联网/会话/发送恢复/下载/飞书规划helper检查通过；API/共享契约/核心/Skill未改，不重复原693项根CI。
- 真实Electron22覆盖上传、空POST、查询、cookie隔离、压缩二进制字节一致、外站重定向0次访问、截断拒绝和取消。最终链路分批并发读取线上公开health **16/16为200/0.26.0，约54–192毫秒**；没有生产账号会话或模型调用。
- 浏览器插件未列出，使用已有CUA内置浏览器和Playwright接口。1280×720实际React/HTTP/SQLite经真实Electron22转发：模拟集合502→恢复→点击重试→错误消失→实际新建私人集合→我的任务/课题组任务/资料库切换，读取正常。仅合成账号。

| 页面检查 | 结果 |
| --- | --- |
| URL/标题、非空与框架覆盖层 | 正确页面，内容正常，无覆盖层 |
| 故障恢复、保存与导航 | 明确报错，恢复后真实读取和落库，三栏目正常 |
| 控制台 | 既有Router/AntD弃用提示，无新运行异常 |
| 安装载荷与原生启动 | 均通过，用户覆盖安装尚未执行 |

证据在Git外 `.runtime/desktop-network-20261020`：网络对比、native-transport-proof.json、client-checks-final3.log、ui-console.json/截图、隔离库/计数、构建/载荷/启动收据。早期原生事件/压缩/空POST失败、类型检查和中间构建日志保留，以本页最终源码/哈希为准。未验证真实用户登录后的全部流程、手机视口或科研质量，外部网络故障仍会明确显示。
