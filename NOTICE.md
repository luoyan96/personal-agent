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
