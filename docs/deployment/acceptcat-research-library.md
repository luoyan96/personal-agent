# AcceptCat 0.10.0 科研资料库后台部署

## 固定版本

2026-10-10 18:02北京时间完成核验。沿用用户已明确授权的阿里云维护会话，生产源码固定为 `aee02447f985070a0c4b01c392192e7ae4960953`。GitHub codeload归档 SHA256 `fef0ada545d9148f37a7fe8a1df11ded3146eb0a546254afd2b47d58f23690b7`。契约0.24.0、chat1.12.0、migration022。

新镜像 `research-openim-api:library-aee02447`，ID `sha256:1390545b7d576d4984b1263243010e07123d148c1358895e3e92772d3691f3cc`，OCI revision与生产源码一致。源目录 `/opt/research-openim/releases/aee02447f985070a0c4b01c392192e7ae4960953`，ops目录 `/opt/research-openim/ops/library-aee02447`。

使用已核对旧本地镜像 `research-openim-api:team-f9729a22`，ID `sha256:c3e47a756279050379eb775884b2a7120b52ecb7b86f35c9c97b2465da5f1254`，network none编译 contracts / research-skills / API新增源码与022，沿用既有依赖。构建期间旧服务继续运行；只停止和替换科研API / worker，六项OpenIM及基础服务实例 / 镜像 / 状态前后完全相同，网页静态界面未更新。

## 备份与迁移

停止科研服务后，记录schema21、旧86张表定义与所有旧行摘要、6份原件路径 / 模式 / SHA。完整备份：

- `/srv/research-openim-backups/library-aee02447-20261010T100009Z/research.tar.gz`
- SHA256 `967db69de1cda008f2f0e464088416f3815c2a4187ef92bc71d4d9fc2fcee9a6`

解压副本与原库schema21、完整性 / 外键、旧行和原件相符；在副本运行真实production manage migrate，核对022精确checksum、旧对象SQL与旧数据 / 原件不变、新增五表为空。再次核对停写中的原库后执行正式迁移并做同样检查。022仅增加五张资料表、两个索引和四个不可变原件 / 页触发器。此前21条迁移的checksum及时间不改。备份是科研数据库及科研原件，不能当作全部OpenIM组件一致备份。

审计输出保存 baseline-summary.json、restore-schema21.json、restore-schema22.json、pre-live-schema21.json、live-schema22.json、started-schema22.json。启动后仅检查schema完整性，不把重启后的业务写入误判为迁移篡改。

## 运行证据

实际Compose指定固定源码两份compose、既有production-images和新images.yaml，`up -d --no-build --no-deps research-api research-worker`。API healthy，worker running，两者新镜像一致、restart=unless-stopped。公网ready=200 / ok / contract0.24.0，数据库 / 存储 / 认证ok；harness=not_verified。资料集合、关键词检索与科研工作台匿名访问返回401，证明路由鉴权存在，不是认证后实际科研或供应商质量验收。

部署日志 `/root/acceptcat-library-aee02447/deploy.log` 与ops/build.log、deployed-image.txt、deployed-pair.txt、ready.json保留。脚本SHA256 `46a32e98dc107b7a8540058efb5e476d70b746bf56e3e42f0ca3ff028efbcdc3`，审计器 `63f5019038d543f69fa53387821e70296499f3b0ca681b40ca91d1b98c2db203`；经gzip/base64维护终端传输后核对SHA和bash语法。合成审计包含五种成功检查与三种故意篡改拒绝，未使用真实资料作测试夹具。

本机Git外 `.runtime/capability-center-20261010` 保存public-route-proof.json、deployment-receipt.json与deployment-terminal.png。Windows0.10.0本地NSIS包已有安装说明，未公开Release或代用户安装。工程与UI边界见[实现说明](../development/research-capability-center.md)。

## 恢复边界

旧源码 `f9729a223e0b9ccd0089949e83c10f35c6e4e53d` 不认识022，不能直接运行旧二进制读取schema22。脚本只在新writer启动前的迁移失败阶段，校验完整备份并保留失败库后恢复schema21；新writer开始启动后停止服务并要求独立恢复决策，禁止自动覆盖已有新写入。

本次首次部署成功，没有执行回退。未来恢复需成对停科研服务、先备份当前库与原件，明确选择兼容代码或独立的数据恢复；恢复旧备份会损失备份之后的写入，不能称为普通软件回退。基线摘要与研究原件不能进入Git或公开日志。
