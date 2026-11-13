# 团队资料 Git 工作区：第一版

2026-11-09 后续整合：负责人授权与PR190一起交付，统一候选契约0.45、033仓库配置/034个人规则；下文0.44/033为独立分支验收历史。实际后续状态见[整合说明](constitution-library-integration.md)与当前状态。生产本批未部署。

状态：2026-11-09，`feat/team-library-git` 从 main `da6e0ef55afad662ac8a93b6c11bd36763e8e352` 开发；源码与隔离验收完成，待功能 PR 审阅。本批没有合并、部署生产后台、发布新版本或生成本机新 EXE。CI 包仅用于构建验证。公开客户端仍为 0.10.98，线上仍 contract 0.43.0 / schema 032。

代码交付：[PR #191](https://github.com/luoyan96/personal-agent/pull/191)。提交复查发现并行 [PR #190](https://github.com/luoyan96/personal-agent/pull/190) / c1b8d466 同样新增 033（personal-work-rules）并使用候选契约 0.44。两批独立基于同一 main，**不能原样依次合并或部署**：先决定审阅/合并顺序，后一个分支须 rebase，将新增迁移排到 034、契约升到后续版本，并同步枚举/计数/恢复夹具/功能门槛和导出，重新跑整合 CI。本文的 0.44/033/114 表仅描述本独立分支，不能冒充两批整合后的版本。没有擅自引入 PR190 的规则/提示词改动。

## 用户流程

资料主页面按已选设计组织为团队资料、我的资料，团队资料使用项目树、文件列表、预览与取用详情。保留共享原件/飞书、旧资料索引、课题组生效规范和本机报告的次级入口；我的资料复用本机资料文件夹与索引入口。旧客户端/低于 0.44 的后台继续使用原资料页面，不显示一个实际无法工作的 Git 入口。

1. 课题组管理员粘贴 GitHub 仓库地址后点「连接仓库」或回车，地址末尾有无 `.git` 均可。2026-11-13客户端候选改为自动识别默认分支、读取资料清单中的空间ID，用户不再填写这两个内部字段；重新连接同一仓库保留原发布分支。Git权限/网络和清单检查通过后才通过现有接口保存共享配置，失败保留原绑定。成员需要 Git for Windows；私有仓库读取及提交更新还需本机已有的 GitHub 仓库权限。AcceptCat 登录不会自动换取 GitHub 权限，应用不保存 PAT。
2. 同步读取已发布目录；按项目、用途或关键词找材料。Markdown 安全排版，常见文本和 PNG/JPEG/WebP 可预览；其他格式明确提供副本/工作台原生文件区入口，不伪造 PDF/PPT 渲染或文件可用状态。
3. 在工作台使用时先选择本人可操作的任务；工作台选好任务文件夹后，明确点确认取用。按需同时带入该项目的规范与要求，校验版本、复制原件并留下来源 JSON。不会自动提交模型请求。资料助手输入的要求随账号与任务隔离，在用户点交接时使用。
4. 修改说明或 Markdown、新增项目、登记共享原件/本地文件均提交到独立待审分支。应用返回 GitHub 比较入口，用户创建 PR、审核合并后团队再同步。分支上传成功不等于 PR 已创建或团队已发布；冲突不自动合并。
5. 成果继续走任务已有的共享归档流程，再通过“登记团队共享原件”把该版本加入项目目录。Agent 可在任务副本中工作；本批没有给 DSH 增加自动向仓库发布的权限或工具。

## 数据与权限

- `acceptcat-library.json` 格式 1：稳定 `workspaceId`、项目 ID、资料 ID、用途、说明、维护者、推荐标记，以及 `git` / `shared` / `local` 来源。格式由 `packages/contracts/src/team-library.ts` 校验。
- `git`：相对路径与 SHA256。小文本适合随 Git 管理；裸对象缓存不 checkout，不运行仓库 hooks、smudge、子模块或脚本；拒绝链接、路径越界、Windows 保留名、错误哈希和 LFS 指针。首次读取的目录限 1 MiB，单个 Git 正文限 20 MiB。
- `shared`：既有资料服务的 fileId、version、sha256。登记时只接受当前可见的团队/公开集合；取用时重新核对原件权限、版本及哈希，使用现有 1 MiB 分块读取及最多 512 MiB 原件通路。**20 MiB 是 Git 正文通路的界限，不是本地 PPT 或共享上传的新上限。**
- `local`：本机已授权资料文件夹内的相对路径与校验值，只共享指针。其他成员须已有同一份原件。复制到私有临时目录后再校验，避免用户同时编辑原文件而误用不同版本；没有把整个本地目录上传。
- 来源随任务保存：仓库地址、发布 commit、空间/项目/资料 ID、原件版本和 SHA256。原件和来源记录进入现有任务素材清单；失败可以保留已校验的部分副本，重试由既有素材去重，不自动执行。
- 原生桥只服务主窗口主 frame，使用既有 Cookie 会话核对本人身份和当前课题组。缓存按服务、账号、课题组及仓库绑定分开；读取结束和推送前重查仓库，切号、登出、换组、变更仓库均使晚到操作失效。后台不克隆仓库、不存 Git 凭据或原件。
- Git 是目录/内容治理来源；库内“规范与要求”是明确选入的项目材料，不能覆盖平台权限和既有课题组生效规范。没有修改角色、Skill、模型设置、DSH 本体或既有系统提示词。

## 后台适配与部署边界

候选契约 **0.44.0**，增加 GET/POST `/api/v1/library/repository`，只保存每组一条带版本的仓库绑定。实时成员权限先于读取/幂等重放，写入须管理员、Origin/CSRF、Idempotency-Key 和 expectedVersion。新增 **033-team-library-repository.sql** / `team_library_repositories` STRICT 表；旧迁移逐字节保留。隔离数据库确认 33 条迁移、114 张业务表，032→033 两次迁移幂等、旧成员不变。

生产部署须另行安排：先核对在线完整 Compose 链与实际 API/worker 镜像，停写一致备份，在恢复副本运行新迁移并重复核验，再迁移正式库和成对更新 API/worker。033 文件保持 LF；沿用现网已经验证的研究技能构建/025 历史字节处理，不直接改 schema_migrations。旧版严格拒绝未知迁移，**不能把“多一张表”当成可以只切回旧镜像**；优先兼容前滚，若确需数据库恢复，须另行确认升级后写入损失。此文不是部署回执。

## 示例仓库与迁移

负责人提供的 [files](https://github.com/luoyan96/files) 原为空且公开，已初始化仅含公开合成内容的六份示例和格式说明。main 固定 `819c27947a49d199f77414982ac7f9a284782cd9`，空间 `acceptcat-demo`。真实 fetch/原件哈希检查通过。

客户端界面提交的示例说明更新为 `2c7403cd4b634f6990ce72619091855cf7f6e913` / `acceptcat/library-f993ef25-7858-4430-bf46-838272b498fb`，已建立 [草稿 PR #1](https://github.com/luoyan96/files/pull/1)，未合并，main 保持。公开仓库连文件名、说明与历史也公开，禁止加入实验室内部材料。

迁到实验室 GitHub 仓库时转移仓库或推送完整历史，保留 workspaceId/projectId/entryId/相对路径，修改共享配置；原任务副本和来源不重写。共享原件服务与权限须单独保留。第一版仅支持 GitHub HTTPS；GitLab 等其他托管需扩展连接器，不能声称当前仅改地址就可用。

## 检查与重现

根仓库：`corepack pnpm@11.21.0 install --frozen-lockfile`、`corepack pnpm@11.21.0 run ci`。完整 CI：71 文件 **886 项**、生产运行检查、B0 进程与 Web 生产检查通过。

客户端使用独立 pnpm：根目录先 `corepack pnpm@11.21.0 run build:desktop-deps`；进入 `clients/openim` 后执行 `corepack pnpm@10.28.0 install --ignore-workspace --frozen-lockfile`，再运行 `typecheck`、`typecheck:electron`、`build:web`。全部通过；Git/原生桥/任务取用/构建守卫 **24 项**通过；`test:local-dsh` **42 项**及 `test:team-library` **10 项**通过（与 24 项有重叠，不能相加当独立数量）。Windows CI 已加入新测试。

测试使用真实本机 Git 对象、隔离 SQLite/HTTP、合成账号，以及任务工作区的合成 DSH RPC。验证了 Git→IPC→工作目录内容/版本一致、无隐式上传、失败重试去重、待审分支不移动 main、失效账号/换组拒绝晚到结果、新项目幂等、未知来源/错误哈希拒绝。界面使用实际组件、隔离真实后台和同一 Git store 的测试适配层；1568×1005 与 1280 桌面检查、搜索/预览/版本历史/新增项目取消/待审提交/任务跳转通过。浏览器中不冒充已连接原生 DSH。

Git 外证据：`D:/deepseek-agent/.runtime/team-library-20261109/`；完整日志 `ci-final.log`、`client-build-delivery.log`、`native-copy-check.log`、`dsh-regression.log`、`git-package-test.log`、`public-fetch.log`、`ui-final.png`、`ui-proposal.png`、`design-comparison.png`。最终视觉复核见根 `design-qa.md`。

早期失败保留：ci-initial（结构示例 URL 尚未补充）、ci（旧版号/阶段断言）、material-existing（测试打包导入原生依赖及重复清单）、native-all（测试换组回调先后顺序）、qa-ui 各轮（验收夹具 alias/wasm/中间件/可选参数序列化），均已修正复查。一次本机后台启动独立测试窗口的自动审批拒绝只报告 blocked by policy，未绕过；之后使用已登录 Edge 的独立验收页。图片比较时本机 Python 缺 Pillow，改用系统绘图库，仅合成 QA 对照图。

GitHub Windows 两轮检查发现 runner 临时盘祖先路径别名触发过严的原件路径比较（日志 `github-desktop-initial-failure.log` / `github-desktop-second-failure.log`）。改为先解析账号资料缓存根的真实路径，再严格核对子目录：允许系统祖先别名，仍拒绝原件子目录被链接重定向。新增 junction/符号链接回归，Git/权限检查现为 **9 项**、合并定向组现为 **23 项**（先前 8/22 项的后续增量）；本机通过，远端新提交继续检查。首个 PR 提交还漏暂存生产测试的 33 断言，已在后续提交补齐，没有漏改正式代码。

## 保留内容、限制和下一步

原集合、旧资料索引及其 API 是仍在使用的原件/飞书/权限链，本轮没有假定无用后批量删除。新后台就绪后才切换主入口；只有新入口覆盖所有真实调用、迁移旧引用完成并有验收证据时，才按路线图提醒清理对应旧路径。

本批没有 LFS 自动取用、Git 凭据引导、跨重启表单草稿恢复、自动冲突合并、任意目录重命名/删除 UI、Office 全格式内嵌阅读或 Agent 自动提审；这些操作可在仓库 PR 或既有原件入口维护。本地缓存读取仍需核对 AcceptCat 当前会话，Git 暂时不可达时可保留最后成功版本，并非离线账号授权。

下一步只有两件：审阅代码并安排 0.44/033 后台与客户端独立交付；由负责人用真实任务、私有实验室仓库和 1–300 MB PPT 验收。没有调用真实模型、私人材料、双机账号或替换正在使用的客户端。

远端随后完整客户端回归暴露旧 service-status-bridge 夹具未登记新桥接模块（github-desktop-canonical-failure.log），已补齐与其他无关桥相同的隔离登记；129项通讯录/服务状态/资料/任务等回归通过，未改其实际权限逻辑。修后日志 client-regression-final.log；原件路径修后23项与构建在 native-canonical-check.log / client-build-canonical.log。

打包后隔离启动暴露新原生模块直接require ESM契约导致ERR_PACKAGE_PATH_NOT_EXPORTED（github-desktop-package-failure.log），NSIS生成本身通过但该包不可用。沿用现有localDshRuntime的CommonJS契约打包出口，仅新增团队资料schema导出；原生模块只从已打包CJS取schema，类型仍引用共享契约，没有复制校验实现或修改DSH上游/模型。新增不打包逐文件CJS加载回归，24项原生/任务/构建定向检查与Electron类型通过；含任务工作区的44项回归也通过。日志cjs-native-check.log、cjs-library-tests.log；修复后重新构建并等待完整启动检查，不把先前失败包称为可交付。
