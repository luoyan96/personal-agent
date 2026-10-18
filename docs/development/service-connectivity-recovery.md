# 工作台连接诊断与恢复（2026-10-18）

用户现装 Windows 0.10.14 的科研总览出现“科研团队服务暂不可用 / 读取超时”。从干净的 release/acceptcat-0.10.14 / f153d48 接续，产品修正 a3a795b74775039c483c33903363efd20ecce5fc，Windows 0.10.15 的打包源码相同。

## 实际连接与诊断

桌面运行本地打包界面与随机 loopback HTTP 代理，`/api/` 请求由 Electron 的 Node HTTPS 转发到设置中的 `https://chat.acceptcat.com/`；会话在代理中映射，界面不读取令牌。OpenIM 原生通信和科研 API / worker 是分别运行的服务。启动成功只表明本地界面/代理已建立，不能证明每次远端请求成功。阿里云控制台是维护入口，登录它不登录产品账号，也不触发代码、数据库或用户资料同步。

本次只读核验：

- 现装进程位于 D:/0chat/ResearchWeChat/AcceptCat，ASAR SHA256 d817c77eeed01b9bf6e79328aeec06a890b21de3066320a5b832ebf95e62780a，与 0.10.14 交付一致；实际保存的服务地址正确。
- 23:23 的 GET 传输诊断出现 ETIMEDOUT / ECONNRESET，约 21 秒失败；诊断仅含方法、耗时和错误码，不能将某一条日志断言为截图中的具体健康请求。
- 本机 DNS 将域名解析到 198.18.0.89，Clash/Verge/Mihomo 正在运行；AliDNS 查询返回正式服务器 8.138.247.78。这证明链路经过虚拟地址转发，尚不能单独证明代理就是故障源。未改代理规则、DNS、TLS、端口、认证或安全组。
- 重新连接 Edge 已有阿里云 Workbench 后，实际 API healthy / worker running，镜像 ID b78613b5c6e1f77d07e7af392149744161e25460cb7e4f14b2ec0500e3fda2cc，OCI revision 47c42acbccf64b1d329babb26a464733b81d51d3，两个容器 restart=0 / OOM=false；其余六个组件运行中。服务器 ready200 / contract0.25 / 数据库、存储、认证ok，约0.19秒；harness仍not_verified。
- 主机磁盘85% / 可用约7.3GiB，内存available约5.6GiB，本次未清理数据或重启。`/opt/research-openim/current` 仍指向旧94b26d1；实际后端版本以运行容器镜像与revision为准，未改该指针。
- 公网 Node HTTPS 与现装本机代理各三轮 ready 全部200，分别40–150ms / 99–121ms。这是检查时可连接的证据，不能否认此前短暂故障或代替长期稳定性/真实模型质量验收。

不需要为本批功能同步数据库或升级后台。仅用“前端版本新、后台版本旧”解释该超时不成立；两者通过服务契约兼容，不按桌面版本号强制相同。

## 客户端修正

总览原来并发轮询同一个公开健康接口两次，分别判断工作台0.21与科研团队0.23；任一短暂失败可能卸载整个内容和编辑器。现在用一次响应分别判断两个版本门槛。

新增 useWorkspaceAvailability 只在当前账号generation内记忆已确认的公开契约版本；后续健康复查失败时显示警告并继续真实业务读取，保留已打开的编辑器。未成功连接过的账号仍显示实际失败；明确读到旧版本仍阻止不兼容功能。账号变化或停用该入口会清除版本记忆，不缓存任务内容或权限。业务读取继续使用原有 useResearchRead，403会清除旧统计。

保留原有可见页5秒轮询、失败后至少15秒退避；增加 online 与页面重新可见时复查，并复用已有在途请求。公开健康读取现在传递调用方 AbortSignal，关闭页面/换账号时中止远端读取，仍有10秒总截止。没有自动重试写入或放宽版本/ACL。

## 验证与限制

21项定向检查通过（含3项新增健康响应/取消边界），最终行为源码TypeScript通过；无共享代码/内置Skill改变，不重复根全套CI。Browser plugin not available，沿既有 frontend-testing-debugging / React 技能使用隔离 Playwright / Edge；真实React、HTTP、SQLite合成账号与健康错误注入共8组通过：单健康请求、短失败保留内容、10秒超时保留未保存目标、旧版本、账号切换、首次失败与online恢复、约20秒自动轮询恢复、403清除授权统计。1536×1024及1024×726实拍已查看，无横向溢出、框架覆盖、pageerror；预期503/403与既有Router/findDOMNode警告保留。

首轮弹窗placeholder误用与未等待挂载、权限错误文案预期未采用客户端统一映射导致的失败均保留，修验收脚本后通过；未改产品权限或放宽限流。没有读取真实科研材料、验证真实模型/IM送达或永久解决代理/网络抖动。

Git外证据 D:/deepseek-agent/.runtime/service-recovery-20261018：cloud-inspect.png、transport-metadata.txt、public-local-probes.json、qa-summary.json、qa-polling-proof.json、各首败、focused.log、typecheck.log、windows-build.log、installer-proof.json、nsis-payload-proof.json和electron-smoke.log。安装与发布边界见[0.10.15交付](../deployment/acceptcat-0.10.15.md)。
