# 来源与许可说明

## 2026-10-28：任务工作页

0.10.68 使用上述同日固定 DSH 0.2.1-rc.3 发行包的公开 session/workspace Remote API，接口依据为该发行树中的 api-session-controller/api-workspace-controller 说明及类型元数据。AcceptCat 的任务 UI、绑定、权限与回执适配自行编写，不复制上游控制器实现、图标或 luanyujia-workbench 的代码/规则。上游完整许可随既有内置发行树保留；没有新增第三方运行依赖。[接口与验证记录](docs/development/dsh-task-workspace.md)。

## 2026-10-28：本地 DSH 页面

后续 0.10.64 改为随 Windows 安装包分发固定官方 DSH 0.2.1-rc.3 发行文件，构建时下载/校验/解包；上游源码和二进制不提交 Git。完整发行树内的 DSH（包声明 MIT）、Electron、Chromium、Node、Python、文档工具和各依赖许可保留在 `resources/dsh` 及其 ASAR 中，各自适用原许可；不能将所有依赖统称为 MIT。来源 URL/SHA512 固定于 runtime-lock.json，不表示官方合作或模型/商标授权。通过官方配置 overlay 接入 AcceptCat，未修改上游源文件。

以下为 0.10.63 的历史首批记录：

通过 [DeepSeek Harness 官方 Desktop CLI](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md#bundled-command-runtime) 连接用户另行安装的 Windows DSH 0.2.1-rc.3（受测安装构建 be72761ee1a6736ebcdf4f3739363b083ae53c98）。没有将上游 DSH 源码或安装文件复制到本仓库/AcceptCat 安装包；嵌入页面的品牌和内容由本地 DSH 提供，不表示双方官方合作。适配层自行实现，见 integrations/deepseek-harness/desktop。

独立 DSH 文档的浏览器兼容层复用现有锁文件中的 [core-js 3.49.0](https://github.com/zloirock/core-js)，MIT 许可，版权 Denis Pushkarev 与 CoreJS Company。完整许可在构建的 localDshRuntime.js 头部保留并随安装包分发。未迁入 luanyujia-workbench 的实现、个人规则或模板。

## 2026-10-16：AcceptCat产品介绍资产

GitHub首页展示既有蜷睡橘猫图标和实际开发界面的合成科研流程截图，来源、受测版本及原件核对见[展示素材说明](docs/assets/README.md)。截图为产品示例，不包含用户真实研究资料；图标沿用用户此前指定的Catnap Desktop已有像素，其独立许可尚未追溯，不新增未核实的作者或MIT声明。较新集成版的OpenMuse主题/布局及其许可见展示素材说明中的固定来源；本次文档发布不迁入应用实现或改变OpenIM派生部分许可。

本仓库由 `luoyan96` 的科研探索代码与本次新增的平台起步材料整理而来，迁入文件与提交记录见 [docs/migration.md](docs/migration.md)。

- 原 `dsh-research-plugins` 的 package.json 声明 MIT；迁入时源目录未包含独立 LICENSE 文件。本记录保留来源与该声明，不补写未核实的原始版权人信息。
- 原 `dsh-research-skills` 的迁入快照没有独立 LICENSE 文件；这里保留来源，不为原内容新增许可声明。
- DeepSeek Harness 及 Cordis 源码未复制进仓库。依赖由包管理器安装，各依赖适用其自身许可。
- F0 前端品牌小图裁自本仓库 `docs/design/v1.1/01-entry.png`（既有 Image Gen 设计素材）；不引入外部品牌。Phosphor Web 2.1.2 图标来自官方 npm 包，适用其 MIT 许可，随依赖安装保留许可。

当前包均为 private，不随提交自动发布 npm 包。若后续对外发布软件包，需要明确本项目整体许可并核对依赖要求。公开可见的 GitHub 仓库与明确的软件再分发许可是不同事项。

## 2026-10-09：沿用用户原 Catnap 桌面猫咪图标

同日 0.8.4 入口界面复用用户明确指定的 `E:/acceptcat/frontend/public` 旧项目中两张猫咪科研场景，原图字节保留，实际路径、用途和校验和见 [素材来源](clients/openim/public/assets/acceptcat/ORIGIN.md)。没有迁入旧项目的演示认证、后端或视频；素材原始生成记录及独立许可未追溯，不新增未核实的许可声明。

用户指定原 `Catnap Desktop` 快捷方式中蜷睡橘猫作为当前应用图标。读取该快捷方式确定来源为本机 `D:/0cat/Catnap Desktop/Catnap Desktop.exe` 的图标组1；仅提取已有图标像素（16–256px共七档），没有复制旧应用源码或运行时。完整ICO及最大尺寸透明PNG用于AcceptCat 0.8.3的安装图标、原生窗口和标题栏/关于页。原素材生成过程及独立原图未追溯，本次不补写未核实的第三方许可或作者。来源校验和、迁移范围见[图标交接](docs/development/acceptcat-cat-icon.md)。

B3 的受限运行组合依赖官方 DeepSeek Harness `@deepseek-ai/dsh-llm` / `dsh-llm-deepseek-api-key` 0.2.1-rc.2 和 Cordis 4.0.5（MIT）；经公开接口使用，不复制上游实现。2026-10-20由0.2.0-rc.1 / 4.0.4升级，具体依赖与校验值见 pnpm-lock.yaml，历史测试保留其受测版本。

## 2026-10-04 OpenIM 客户端源码采用

本批按用户要求采用 [openimsdk/openim-electron-demo](https://github.com/openimsdk/openim-electron-demo) 固定提交 `62d7ca7b12e91144b315f36c8ebd1d9e0457a352` 的独立聊天 UI 样式、布局、工具及资源。实际迁入文件、上游路径与修改差异见 [前端来源清单](apps/web/third-party/openim/ORIGIN.md)，原始许可保存在 [LICENSE](apps/web/third-party/openim/LICENSE)。受其许可约束的源码和改编部分不因本仓库其他依赖的 MIT 许可而改为 MIT。

上游 README 声明 AGPL-3.0 及禁止商业使用的额外条款，而 LICENSE 为标准 AGPL 文本。本批保留原文及来源；用户已授权本地采用与开发，并决定后续直接沟通商业授权。该决定不构成 OpenIM 授予额外许可的证明。整个客户端、SDK、服务端和音视频模块的许可应分别确认；实际采用 UI 不表示 OpenIM Server 已部署或 SDK 已接通。

完整客户端重建的独立联调 Compose 改编自 `openimsdk/openim-docker` 固定提交 `55a2d29a813388bf6ad9ae7c2715636724c1400d`（Apache-2.0）。[服务来源与镜像版本](deploy/openim/UPSTREAM.md)及[上游原许可证](deploy/openim/OPENIM-DOCKER-LICENSE.txt)保留在仓库；本地准备不代表服务已运行或媒体已验收。

后续完整重建采用同一固定提交的整个 React/Electron 客户端，保存在 `clients/openim`，完整原许可与 [来源记录](clients/openim/ORIGIN.md)随源码保留。它独立使用 pnpm 10，科研平台继续使用 pnpm 11；本批不以较早的 UI 子集代表完整客户端。

派生 OpenIM Server 基于官方源码 `865bb89517b48493ef9b1b5d9fde87fe0cb05cc7`（`v3.8.3-patch.15`），增加发送人/平台绑定与可信回调上下文校验，原 Apache-2.0 许可及 [构建和修改说明](deploy/openim/server/README.md)保留；该补丁不变更客户端的原许可。

## 2026-10-06 Agent 附件文字提取

后端通过官方 npm 依赖使用 [mehmet-kozan/pdf-parse](https://github.com/mehmet-kozan/pdf-parse) 的固定版本 `2.4.5`，其安装包声明并保留 Apache-2.0 许可。`pdfjs-dist@5.4.296` 与 `@napi-rs/canvas@0.1.80` 由该版本依赖引入，解析器与平台包的完整性锁定在 `pnpm-lock.yaml`；各依赖保留自身许可。不复制上游源码，也不将附件解析等同于 OCR、联网检索或工具执行。

## 2026-10-08 桌面界面与协作

本次在已有OpenIM派生客户端内改造，保留原客户端及依赖许可。用户提供微信截图仅用于布局/交互参考，不复制其头像、照片、品牌图或源码。OpenMuse与Anet仅作为流式交互、持久任务、能力发现的设计参考，本次未引入其源码或新增CopilotKit/AG-UI/A2A依赖；实际传输仍是既有服务协议和OpenIM。

## 2026-10-10 科研能力中心与私人 Skill 素材

界面与资料服务在本项目实现。用户提供的 [paper-framework-figure-studio-pro](https://github.com/c-narcissus/paper-framework-figure-studio-pro) 固定修订 `77557418b4ca8c24fa8961206bf9b8f7f6d030e1` 仅用于 Git 外原件往返验证；没有将其素材库或脚本并入项目、运行脚本或声称完成绘图。本机安装包保留原始文件，由用户按来源许可使用。已有 OpenIM / OpenMuse 许可继续保留。

## 2026-10-09 OpenMuse风格桌面界面

参考并改编 [CopilotKit/openmuse](https://github.com/CopilotKit/openmuse) 固定提交 `1ac68f3909f2478ab6280883f1ab5ea65eb5719d` 的React Native UI主题及聊天布局模式，在当前React DOM/Electron客户端实现。上游为MIT，Copyright (c) 2026 OpenMuse contributors；完整说明保留在 `clients/openim/public/third-party/openmuse/LICENSE.txt` 并进入构建静态资源。不复制其品牌图、用户照片或测试数据，不引入其Intelligence后端。此记录不改变已有OpenIM派生部分的许可。实际范围见[界面交接](docs/development/openmuse-desktop-ui.md)。

## 2026-10-12 社区科研工具来源

[K-Dense-AI/claude-scientific-writer](https://github.com/K-Dense-AI/claude-scientific-writer/tree/529b9f73ab4b48925027145800d7b49e96ccfd3c/skills/scientific-writing) 固定529b9f73的scientific-writing为MIT，作者K-Dense Inc.；[54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp/tree/0faf1b25c4b9bb95e2571bc8af60b62e9ce10e24) 固定0faf1b25的Python服务根许可MIT，Zotero Agent插件AGPL-3.0-or-later，整包声明MIT AND AGPL-3.0-or-later。这里只收录自写中文用途、依赖和验证元数据，不复制上游正文/素材/脚本为项目源码，不把整个Zotero项目改标MIT。原始资料只在Git外审阅；用户确认的私人安装保留原包及适用祖先许可。已有客户端许可不变。范围和实际验证见[来源交接](docs/development/community-research-catalog.md)。

2026-10-13依据[Zotero官方Local API](https://www.zotero.org/support/dev/web_api/v3/local_api)编写有限本机元数据读取/选择适配。Zotero为Digital Scholar开发的软件；本轮不复制Zotero或上述MCP/插件源码，不安装、修改或重新分发它们。保留原目录分模块许可，AcceptCat已有客户端许可不变。[实际范围](docs/development/zotero-local-library.md)。

2026-10-14目录增收[K-Dense peer-review](https://github.com/K-Dense-AI/claude-scientific-writer/tree/529b9f73ab4b48925027145800d7b49e96ccfd3c/skills/peer-review)，K-Dense Inc.，固定529b9f73 / Skill2.2，MIT；以及[FutureHouse PaperQA2](https://github.com/Future-House/paper-qa/tree/57e89f7223b0960d5ee5ea048c69e3c47e088572)，固定57e89f7，Apache-2.0。只写中文来源/适配元数据，不复制上游正文、素材、代码或许可证文本作为项目源码；审阅下载和已验证私人原件保存在Git外，私人安装保留适用根许可及原包。PaperQA只待适配，不重新分发其运行时/依赖。已有客户端许可不变。[范围与核对](docs/development/research-review-catalog.md)。

2026-10-15增收[K-Dense scientific-critical-thinking](https://github.com/K-Dense-AI/claude-scientific-writer/tree/529b9f73ab4b48925027145800d7b49e96ccfd3c/skills/scientific-critical-thinking)，固定529b9f73 / Skill1.3，Copyright (c) 2025–2026 K-Dense Inc.，MIT；[Research Toolkit](https://github.com/rrrrrredy/research-toolkit/tree/09e9a8c6e74e8a7075d96fc0a2dbdabb6a43925c)，固定09e9a8c / 1.1.0，Copyright (c) 2026 rrrrrredy，MIT。只收录自写中文介绍、接入条件与验证记录，上游正文/脚本/样例保存在Git外。私人导入保留适用许可；不把示例作者自检当作独立评审，不重新分发 Toolkit 运行时。[审阅与实际发布](docs/development/community-evidence-review.md)。

2026-10-17增收[K-Dense research-grants](https://github.com/K-Dense-AI/claude-scientific-writer/tree/529b9f73ab4b48925027145800d7b49e96ccfd3c/skills/research-grants)，固定529b9f73 / Skill1.3，MIT；以及[exploratory-data-analysis](https://github.com/K-Dense-AI/scientific-agent-skills/tree/a1043ef544e3a100c28e70a736b6cf32554d0677/skills/exploratory-data-analysis)，固定a1043ef / Skill1.4，技能声明MIT、根LICENSE.md为Copyright (c) 2025 K-Dense Inc.。只维护中文目录/适配元数据，不复制正文、脚本或模板进本仓库；原始审阅资料和合成输出在Git外，私人安装保留原件与适用许可。数据体检仍待接入，不重新分发整个运行环境；申请书仅结构讨论，明确上游预算错误及不含当年中国申报指南。[验证与发布状态](docs/development/research-data-grant-catalog.md)。

## 2026-10-24 科研同伴角色设计参考

参考 [titanwings/Distilly](https://github.com/titanwings/distilly/tree/0afc45c29c360ba7bc8260f1bb0bf34e9155f4fa)（原colleague-skill，MIT）的人格场景、对话示例和可修订纠正设计。只借鉴组织思路，AcceptCat的角色文字、示例、明确指令识别及私人记忆接入均独立编写；未复制上游模板、脚本、采集器、人物素材或运行环境，没有安装/执行上游项目。既有OpenIM/OpenMuse等来源许可保持。范围见 [科研同伴设计](docs/development/research-colleague.md)。

## 2026-10-25 角色文件组织

2026-10-26科研同伴团队扩展按负责人要求选读Distilly、Agency Agents、K-Dense科学技能、Anthropic PPTX与中国专利交底项目，固定来源和设计取舍见[设计记录](docs/development/research-colleague-team.md)。本批角色、中文方法和示例独立编写，只参考一般组织与工作流思想；未复制上游模板/代码、人物数据或资源，没有安装/执行第三方仓库、引入其工具或收费服务。上游各自许可不因参考而转授给本项目；既有来源许可与大肥鱼署名保持。

按负责人要求采用 Persona + Work + Skill 组织默认与自建角色，参考Distilly固定0afc45c29c360ba7bc8260f1bb0bf34e9155f4fa的组织思路。agents/roles中文内容、编译器、历史档案投影与导入/导出由本项目独立编写，未复制上游正文、代码、人物资料或执行其生成/采集器。来源和范围见[角色设计](docs/development/agent-role-skills.md)，已有来源许可保持。

## 2026-10-25 私人助理头像

作者：YunYueSama；仓库：[YunYueSama/codex-deepseek-pet](https://github.com/YunYueSama/codex-deepseek-pet)。按负责人要求采用DeepSeek鲸鱼娘社区二创「大肥鱼」的独立头像，取固定修订7661c8b304c5400701f91da01b1a643a207331de的build/icon.png，像素原样保留，不引入上游代码或角色台词。适用“大肥鱼项目署名许可1.0”（自定义许可，非MIT），完整许可、上游素材边界和来源随客户端public/third-party/dafeiyu进入安装包，关于页提供署名。该许可仅覆盖上游有权授权的贡献，不改变既有第三方权利，不表示官方认可。详见[头像来源](clients/openim/public/third-party/dafeiyu/ORIGIN.md)。

同日按负责人要求，将上述原始PNG和同修订build/icon.ico同时用于AcceptCat应用/安装器/快捷方式、窗口、标题栏、启动/登录/关于页及托盘图标，许可与署名同上；ICO原样保留16/32/48/256px四档。不引入上游桌宠运行时，不更改AcceptCat名称或appId。原Catnap橘猫记录仅描述历史版本，不再作为本机0.10.49的新应用图标；旧来源及许可历史保留。

2026-10-28：第二步规则/记忆与任务工作页为AcceptCat适配代码。内置方法仍由agents/skills单一来源打包，通过research-skills解析器生成本次选用的版本副本；DSH仅使用固定发行包的官方会话接口，不复制或修改其源码。设计参考归属继续见docs/development/dsh-team-integration-plan.md。

2026-10-28：第三步群文献分工、设备执行协调与群回执为 AcceptCat 自行编写的适配层；继续使用固定 DSH 发行包的官方 RPC，未迁入或修改上游源码。工作流参考来源沿用三步计划，已有许可、署名与 Skill 单一来源保持。

2026-10-29：DSH原生文件预览恢复使用固定发行包内的官方组件与桌面扩展约定；AcceptCat自行编写隔离preload和任务入口，未复制或改写上游组件源码。Electron43.8.4随其原有许可分发；Mimir和SciencePrism仅作设计参考，尚未包含其源码或插件。

2026-11-05：按负责人要求内置其[luoyan96/dsh-research-workbench v0.4.0](https://github.com/luoyan96/dsh-research-workbench/releases/tag/v0.4.0)官方tgz（源码4572c4b3ef9c02fd818ff01bc6cb0680d357803b、SHA256 583de48caac441a2fe97c316a09e08fa13b23af512a7b9b7435643316b594585）。原包包含Copy的@copylee/dsh-office1.2.0 / 2069af2d6b2b2a9819321a73ea3427716b686608，Copyright(c)2026 Copy，MIT；vendor/copylee-office/LICENSE、上游快照、NOTICE及打包依赖许可原样保留。科研插件原创部分仍标UNLICENSED，不将整包改标MIT；负责人对自己插件的内置授权不改变第三方权利。AcceptCat只修改固定资产/补装适配，不复制上游源码进本仓库或改写其文件工作区。[接入与验证边界](docs/development/research-plugin-0.4.0.md)。


团队资料 Git 工作区的流程设计参考 [Tencent/teamai-cli](https://github.com/Tencent/teamai-cli/tree/a03ca33d8a02304cc22be8425cc1854d4686716c) 的团队文档与 Git 审核实践；未引入该项目代码、资源、hooks或运行时依赖。实现与边界记录于 docs/development/team-library-git.md。

## 2026-11-12 微信分享记录导入接入

接入负责人提供的 D:/deepseek-agent/wechat-import 独立 Node 模块及合成用例，适配 AcceptCat 主进程会话 scope、预览和草稿。模块的聊天头部格式参考 freestylefly/WeChatBridge；Windows ShareTarget 使用 Microsoft 稀疏包接口，接收器由 AcceptCat 独立编写，未复制上游常驻进程、管道或界面代码。上游来源与格式不稳定边界见 docs/development/wechat-share-import.md。新增 yauzl 3.4.0、buffer-crc32 1.0.0 沿各自原有许可分发，不改其许可或署名。
