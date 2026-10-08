# 来源与许可说明

本仓库由 `luoyan96` 的科研探索代码与本次新增的平台起步材料整理而来，迁入文件与提交记录见 [docs/migration.md](docs/migration.md)。

- 原 `dsh-research-plugins` 的 package.json 声明 MIT；迁入时源目录未包含独立 LICENSE 文件。本记录保留来源与该声明，不补写未核实的原始版权人信息。
- 原 `dsh-research-skills` 的迁入快照没有独立 LICENSE 文件；这里保留来源，不为原内容新增许可声明。
- DeepSeek Harness 及 Cordis 源码未复制进仓库。依赖由包管理器安装，各依赖适用其自身许可。
- F0 前端品牌小图裁自本仓库 `docs/design/v1.1/01-entry.png`（既有 Image Gen 设计素材）；不引入外部品牌。Phosphor Web 2.1.2 图标来自官方 npm 包，适用其 MIT 许可，随依赖安装保留许可。

当前包均为 private，不随提交自动发布 npm 包。若后续对外发布软件包，需要明确本项目整体许可并核对依赖要求。公开可见的 GitHub 仓库与明确的软件再分发许可是不同事项。

B3 的受限运行组合依赖官方 DeepSeek Harness `@deepseek-ai/dsh-llm` / `dsh-llm-deepseek-api-key` 0.2.0-rc.1 和 Cordis 4.0.4（MIT）；经公开接口使用，不复制上游实现。具体依赖与校验值见 pnpm-lock.yaml。

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
