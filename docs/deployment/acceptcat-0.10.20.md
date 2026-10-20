# Windows 0.10.20：飞书只读接入候选包

2026-10-20，产品代码固定 **2bbcfbce2e369fe8b64a92caf0dd22350a22b870**，分支 `feat/feishu-readonly-pilot`，从干净0.10.19/b497bde接续。实现见[飞书选定文档试点](../development/feishu-readonly-pilot.md)。

在资料与素材库连接本人飞书，预览选定新版文档或知识库内新版文档的纯文本，确认保存到私人集合；可选一段连续原文带入新的任务规划对话，编辑并发送后继续规划，正式任务仍需确认。个人Agent通过已有集合显式绑定读取副本，不随导入自动获得资料。原文继续在飞书维护，没有整库同步、文档写回或群消息。

**Windows x64 NSIS候选安装包已制作并复制桌面** `C:/Users/luo/Desktop/AcceptCat_0.10.20.exe`，**87,422,226字节**，SHA256 **7abe46bad498dd58eac626b4325d8f966c666d83e38454d8de00909dca2eb9ad**。未代安装、关闭现装、删除旧包或改用户数据。保留同一安装身份、Electron22.3.27与55个装配运行包。

生产17JS/8CSS与ASAR逐字节一致，ASAR顶层52个运行包均核验；飞书入口与旧模型预览/规划/课题组功能在载荷中，QA合成内容与接口未混入生产。ASAR SHA256 **a2d8bcb54ec37725adcc7a06bfc777e2e09269d152483cdfaede21fecb2ead7d**。实际NSIS内的EXE/ASAR与受测目录匹配，EXE SHA256 **6d2bd192942ddaa30f7b59222b987011db655a09765057ceb39917fc6f687500**。隔离数据目录、隐藏窗口启动出现OPENIM_ELECTRON_READY，原生冒烟通过；旧electron-log重复initialize警告保留。

693项/55文件CI、2项生产CLI/HTTP、构建/类型/契约/缺DB与进程检查通过；客户端类型、6项规划helper和实际React/HTTP/SQLite合成飞书流程通过。证据在Git外 `.runtime/feishu-pilot-20261020`，含首败、迁移夹具修复、最终CI、构建、真实安装载荷、启动与界面截图。合成提供方不等同飞书真实组织联调，没有真实模型或私人资料试读。

**代码、安装包及配套后台已完成；飞书应用仅本人已发布，AcceptCat未公开发布。** 用户明确批准后，API/worker已配对升级contract0.26.0/schema023，三张新表；完整备份、恢复副本与022→023→022→023演练、旧表/原件及启动后凭据检查通过。App Secret仅服务器root/0600文件、容器内0600，不进入安装器；飞书0.1.0于2026-10-20 10:58发布，可用成员仅罗岩，对外共享关闭。真实账号授权与选定文档试读仍待本人验证。

部署组合 `47c42ac+key-preview.4bc8d1f+feishu.2bbcfbc` / image `4ee12e77`，只覆盖12个运行源文件、保留生产原公共目录种子；其余六服务保持。备份、完整镜像摘要、实测与回退限制见[独立部署记录](feishu-pilot-20261020.md)。旧镜像不能直接启动023库，不盲目恢复覆盖新业务数据。

独立公网readiness返回200/contract0.26.0、database/storage/authentication ok、Harness not_verified；飞书status/旧Key预览匿名401，非法callback400且no-store/CSP/no-referrer正确。服务器配置检查就绪，不等于已真实授权。原Key预览接口保持；GitHub latest记录仍为v0.6.0，未创建Release、上传包、改更新源或公共目录。
