# AcceptCat Windows 0.10.3：社区目录每日同步

## Windows 安装候选

源码 **47c42acbccf64b1d329babb26a464733b81d51d3**（后端实现6c6b31f、同步提示位置47c42ac），分支 `feature/community-catalog-sync`，[草稿PR45](https://github.com/luoyan96/personal-agent/pull/45)，基于PR44。Windows x64 NSIS **0.10.3** 已制作：`clients/openim/release/Base/0.10.3/AcceptCat_0.10.3.exe`，**87,399,966字节**，SHA256 **5799fe92a664ae9c2a96882e63ad4ac89fd22ba7e856375dda59e0ba0c23ba2c**。桌面副本 `C:/Users/luo/Desktop/AcceptCat_0.10.3.exe` 已核对一致。

退出旧版后运行覆盖安装，安装身份、入口与数据目录保持。需配套 contract0.25 API 才能读取社区目录；旧后台仍可提供原聊天，但新目录请求不能被当成已同步成功。构建 `--publish never`，本批没有上传GitHub Release、改变公开更新源或代用户安装。当前版本能在服务器目录变化后自动更新界面，后续目录/Star变化不要求重新打包客户端。

## 已验证

- 最终根 `pnpm run ci`：53文件/669项、生产2项、B0与生产隔离通过。首次失败为网页测试的旧0.24契约期望，按新增契约更新后通过，没有放宽响应校验。
- 客户端类型、12项来源安装/能力检查通过。真实打包exe启动/原生桥接与ASAR源标签、目录路由、shared parser全文/数字版本2.10、Zotero模块、此前原件恢复和猫咪图标素材核对通过。
- 六组目录读取/初次同步/元数据变化/待审阅候选/动态增项/失败缓存流程通过；另三组固定SHA安装检查与取消零安装、账号代际清除、1024/1536布局流程通过。使用生产React、真实API/SQLite和原生Skill处理器，窗口/SDK与下载为夹具。六组完成后续安装选择器不匹配中断，修正为实际aria-label并在同一合成状态续跑后三组，没有把中断记为全程通过。
- 实际公开GitHub请求成功同步3个仓库事实、发现20个待审阅候选。最终页面截图使用这份真实公开响应缓存，隔离合成API/账号，不能当作线上账号截图或科研质量验收。同步提示在首屏用途标题上方，卡片显示实际Star/代码更新时间；1024无横向溢出。
- 保留初次新依赖文件尚未进入客户端缓存的类型错误、Vite旧预构建缓存、冷启动18秒超时、候选/安装选择器和历史镜像摘要守卫笔误导致的停止证据。原有electron-log重复initialize与Sass警告保留，打包启动仍通过。

证据Git外 `D:/deepseek-agent/.runtime/community-sync-20261014`，包含根检查、类型、定向测试、GitHub公开响应、界面分段结果、最终实拍、构建/启动/ASAR/复制摘要。生产源码47c42ac的远端[38543331737](https://github.com/luoyan96/personal-agent/actions/runs/38543331737)首次Linux两项通过、Windows两项历史解析/迁移超时失败，仅重跑失败Windows节点后最终三平台全部成功，实际回执github-ci-last.json保留。后续文档提交的检查不替代这个生产源码回执。

## 后台升级准备与恢复

共享契约0.25.0/chat1.12.0/schema022，无迁移。固定GitHub源归档33,763,500字节，SHA256 **d79993448b885301231e4160659aaa31eee3420e1d628143cb94648195bacff3**。同源码构建API/worker，新增contracts源码及package元数据正常编译，不重新安装依赖。运行时开启公开GitHub同步，未配置GitHub token。

用户重新登录已有维护权限后，核对正式实例旧API/worker与旧镜像相同、运行中；历史交接记录中的镜像摘要有笔误，实际旧ID为 **sha256:a8224977144450b2634f88317b305d4e0c63d8dfda6e0fe6766ab130296bff6c**。首次预检因此停止在创建ops、构建或停写前，原脚本和空日志保留。分段读取实际摘要后仅修正守卫，新脚本SHA256 **c89354fb756f4f4566831afda78444bb3f92799122aec5702f26310e0d36b263**；服务器核对一致并通过bash语法检查。没有关闭摘要守卫、安装Docker或改动错误实例。

部署脚本先固定归档校验、离线继承旧镜像构建，再成对停写、数据库/原件全量备份及恢复副本逐表/原件核对；仅更新科研API/worker，六基础服务作实例/镜像/状态前后比较。代码回退需先保存当前数据、成对使用旧schema022镜像，保留当前数据库，不能自动恢复旧数据快照覆盖新写入。

## 已上线回执

2026-10-14北京时间17:51，API/worker成对上线固定源码47c42ac，镜像 **research-openim-api:community-47c42ac**，实际ID **sha256:b78613b5c6e1f77d07e7af392149744161e25460cb7e4f14b2ec0500e3fda2cc**，OCI revision一致，restart=unless-stopped，API healthy/worker running。正式ops `/opt/research-openim/ops/community-47c42ac`，脚本和日志 `/root/acceptcat-community-47c42ac`（原预检脚本/deploy.log与v2保留）。

停写备份 `/srv/research-openim-backups/community-47c42ac-20261014T095124Z/research.tar.gz` 校验通过，解压副本及新writer前原库：91表SQL/全行摘要、22迁移checksum/时间、6份原件字节/模式一致。六基础服务实例/镜像/状态前后一致；无数据库迁移、网页部署、Key或权限改动。

服务器真实公共GitHub首次同步 **09:51:35.482Z—09:51:41.195Z**，state/discoveryState均ok；四项已收录、三个来源仓库、二十个待审阅候选，metadata error均null。当时Writer/peer-review共同2466 Star，PaperQA9366，Zotero5381；这是时间点事实，后续由后台更新。下一次 **2026-10-14T16:00:00.000Z**（北京时间10月15日00:00）。公共请求无需GitHub token；同步任务运行在worker，桌面关闭不影响。`GITHUB_CATALOG_SYNC=1`同时明确写入pair override及既有compose.env，保留原环境文件权限供后续升级沿用；其他环境内容不回显。

本机独立HTTPS ready200/ok/contract0.25，database/storage/authentication ok，harness仍not_verified；新增目录和单项匿名请求均401。服务器operator-only读取持久公共缓存确认实际数据，登录用户API与动态界面已在真实HTTP/SQLite合成流程检查，但未读取真实用户账号或科研内容作云端界面验收。截图、public-probes.json与同步收据留在Git外。首次默认连到同账号旧实例，发现Docker不存在后仅作只读核查，按先前部署记录找到正式实例，没有在错误实例安装或修改软件。
