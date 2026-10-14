# AcceptCat Windows 0.10.1 与配套后台（2026-10-14）

## 实际交付

用户明确要求制作可试用安装包，并重新登录既有阿里云维护会话，沿用先前升级API/worker授权。Windows x64 NSIS安装包和成对后台固定源码为 **8717dac3918b937b89c146f166ce5ee115d542ba**，分支 `release/acceptcat-0.10.1`。版本提交只将客户端0.10.0改为0.10.1，业务源码与已通过656项本地及三平台CI的PR42生产7d2a9c8相同。

安装包位置：`clients/openim/release/Base/0.10.1/AcceptCat_0.10.1.exe`；副本和安装说明已放 `C:/Users/luo/Desktop`。文件 **87,391,016字节**，SHA256 **698caa2f6f8d5cf49011df51112aff0038292d33760b5589684ab73a982fb831**。退出旧版后按原位置覆盖安装；应用name、AppID、主入口和原账号数据目录沿用，安装器没有删除旧数据。

这是本地交付包，构建使用 `--publish never`，没有上传GitHub Release或改公开更新源。因此用户需要运行本地包；旧版不能单凭已推送Git分支自动收到本版本。本批没有代用户安装或重启其正在使用的客户端。

## 包内范围与验证

本次将PR37—42现有链带入桌面：四项审阅过的科研来源目录、明确的可安装/待适配状态、Zotero个人库只读元数据选入、Skill嵌套/数字版本识别、普通资料/新版本导入的原请求重试和真实保存回执；配套后台修复所选Skill连续输入误分流。未含独立兄弟PR35/36，不把脚本/绘图/向量执行或PaperQA运行时称为已接通。

证据Git外 `D:/deepseek-agent/.runtime/acceptcat-0.10.1-20261014`：

- `client-typecheck.log`、`windows-build.log`：当前客户端类型、Vite/Electron和实际NSIS构建通过。55个真实运行依赖打入包，SDK资源沿用既有配置。
- `electron-smoke.log`：实际win-unpacked AcceptCat.exe在隔离账号目录启动，原生桥接与renderer就绪，稳定运行后关闭自己的测试进程。既有electron-log重复initialize警告保留；没有主进程未捕获异常或renderer失败，不以编译成功替代启动。
- `package-proof.json`：ASAR版本0.10.1/入口/身份、四目录项、导入恢复真实文案、Zotero原生模块/IPC、共享import.cjs完整字节及数字标签2.10、旧猫咪图片和图标核对通过。首轮夹具用了不存在的queryZoteroItems名称，`package-proof-first.log`失败保留；按实际preload接口改为connect/read/releaseLocalZotero后通过，没有改产品接口。
- `desktop-delivery.json`：桌面副本字节数和SHA与构建产物一致。安装说明亦在桌面。

没有新业务源码或内置Skill正文修改，不重复上一批已通过的根CI。上述为包检查，不是用户安装后实际科研材料或模型质量验收。

## 服务器固定版本与保护

云端沿用原八服务环境，仅升级科研API与worker。新镜像 **research-openim-api:release-8717dac3**，ID **sha256:a8224977144450b26430bf488317b305d4e0c63d8dfda6e0fe6766ab130296bff6c**；OCI revision与8717dac3固定源码一致。源码目录 `/opt/research-openim/releases/8717dac3918b937b89c146f166ce5ee115d542ba`；正式ops `/opt/research-openim/ops/release-8717dac3-v2`。

从已核对的旧library-aee02447本地镜像构建，network none、pull=false，仅复制API/research-skills源文件并正常编译，未重新安装依赖。GitHub固定归档 **33,726,549字节** / SHA256 **d42ab1298baf5b7b63ac76b6ce08fce0c04210085add4f2c9f7caf0874fb9c55** 在本机与服务器一致。契约仍0.24.0/chat1.12.0/schema022，无迁移，无模型凭据或权限策略变更。

先停科研服务并保存数据库/原件备份：`/srv/research-openim-backups/release-8717dac3-v2-20261014T040344Z/research.tar.gz`（2026-10-14北京时间12:03:44创建），校验文件同目录SHA256SUMS。解压副本与停写原库对比：**91张表**的SQL/全行摘要、22条迁移与checksum/时间、**6份原件**字节/模式全部一致，integrity/foreign keys通过；新writer启动前原库再核对一致。私密行摘要、原件和配置备份仅留受保护服务器目录，没有进入Git。

API healthy、worker running，两者同新image ID/restart=unless-stopped；六项OpenIM基础服务的实例、镜像和状态前后完全相同。公网ready=200/ok，数据库/存储/认证ok，harness=not_verified；未做供应商质量调用。容器中chat.ts SHA256 `df01f70a3b52962720c2fce587e334156c5b9d68a3aa5ae2854a8e3e5301fd11`，import.ts SHA256 `7720e7c9681101090d8dc478be701bf84c10923c5e7df48145ae09ee39c47307`，与固定本机源码LF字节一致。网页静态客户端未更新。

## 失败与恢复事实

首次脚本在只读bind mount上的SQLite WAL审计报unable to open database file，发生在快照阶段、正式备份与新writer启动前。旧API/worker自动恢复，已实际inspect及公网ready确认旧服务运行；没有迁移或覆盖数据库。失败脚本/日志与首次ops目录保留。

第二版审计仍使用SQLite readOnly和query_only；文件挂载允许WAL/共享内存临时文件创建，业务SQL只读。先在旧服务运行时预检，再停写备份/核对。审计器已用真实合成SQLite验证正常快照、恢复一致、篡改行/原件拒绝；`audit-test.json`保留。第二版成功，不覆盖首次失败证据，不为故障放宽完整性比较。传输gzip/base64后逐文件SHA及bash语法核对，activate脚本SHA256 `a28e8a372963e44831667d37b379f55330fb5b4bc23571a54daaa7b50db9fd30`。

服务器记录：`/root/acceptcat-0.10.1-8717dac3/{deploy.log,activate-v2.log}`及正式ops中的基线/restore-verify/live-before-start/started-schema/ready与其他服务对比。本机`deployment-terminal-final.png`、`public-ready-final.json`、安装/审计记录保留。

代码恢复须成对停API/worker、先备份当前数据，使用旧aee02447两份compose和正式ops的old-images.yaml。旧代码同schema022可读取当前库，但会重新带回本次调用故障；保留当前数据库和原件。不得把恢复旧数据快照当成普通代码回退；新writer启动后的失败需检查状态，不自动覆盖新写入。
