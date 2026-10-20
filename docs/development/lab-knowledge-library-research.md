# 课题组资料与素材库调研（2026-10-20）

## 范围与状态

用户要求先调查他人方案，再说明论文/代码、论文写作、专利、已获批项目申请书、PPT素材如何组织，以及自建/复用、技术路线和成本。本批仅官方文档、许可文本与现有代码的对照研究；以下为候选建议，不代表用户已确认产品范围或功能已实现。

实际基线 `release/acceptcat-0.10.19` / `69d8822ee1d2f027b949bf030c6ec6fa0887e0b7`，开始时工作区干净。本调研没有改产品代码、依赖、安装包、数据库、服务器、公开目录或Release；未使用私人材料、模型Key或真实模型请求。未部署候选工具，未做真实科研语料的解析质量或负载评测。调研当时Key预览部署尚待单独答复；随后用户明确同意，该接口于同日独立部署，准确生产状态见[后续部署记录](../deployment/key-preview-20261020.md)，不能把这次部署计为资料库新方案实现。

## 现有实现核对

- `packages/contracts/src/research-library.ts`：集合范围包含owner_private/task_scoped/lab_shared/public，文件元数据有题名、作者、年份、DOI、标签和备注；不可变版本、SHA256和页/字符引用、本人Agent绑定已有。
- `apps/api/src/research-library.ts`：SQLite元数据/提取页与服务器blob原件，单原件10MiB；PDF/TXT/Markdown/CSV提取，其他格式仅原件；按当前授权先过滤，再关键词排序，未接语义索引或OCR。
- Zotero适配目前只将用户选中的个人库条目元数据/摘要导入TXT；没有同步团队文献全文、附件、笔记或批注。见 `zotero-local-library.md`。
- 尚无统一科研条目与多附件关系、领域状态/模板适用版本、PPT缩略图、完整Office解析、资料复用统计、模板到任务成果的完整归档闭环。原件版本与基础权限不能称为这些功能完成。

## 对照来源与可借鉴做法

以下均于2026-10-20阅读官方文档或维护方仓库；网页与main分支会变化，正式选型仍须固定发布版本并核对各模型/依赖许可。

| 系统 | 官方依据 | 对AcceptCat的启发与边界 |
| --- | --- | --- |
| Zotero | [Collections and Tags](https://www.zotero.org/support/collections_and_tags)、[Related Items](https://www.zotero.org/support/related)、[Groups](https://www.zotero.org/support/groups) | 同一条目可处于多个集合；集合、标签、关联分开，组库独立于个人库。保留其文献/引用能力，AcceptCat维护业务关联；跨库条目并非自动同一副本。 |
| 飞书 | [知识库组织](https://www.feishu.cn/hc/zh-CN/articles/807073676453-飞书知识库-构建企业与个人的专属智库)、[权限](https://www.feishu.cn/hc/zh-CN/articles/821998241087-快速了解知识库权限) | 内容导航与企业/知识库/页面权限分层。适合已有飞书团队直接使用；外部文档链接不等于AcceptCat已获准读取全文或同步权限。 |
| eLabFTW | [Resources](https://doc.elabftw.net/docs/usage/user-guide/resources/)、[Templates](https://doc.elabftw.net/docs/usage/user-guide/templates/) | 资源分类、模板和科研记录分别建模，通过链接复用；模板与实例可以使用不同权限。借鉴数据模型，不引入本轮不需要的完整实验室管理系统。 |
| openBIS | [Data Modelling，20.10.12-plus文档](https://openbis.readthedocs.io/en/20.10.12-plus/user-documentation/advance-features/openbis-data-modelling.html) | 项目、集合、对象、数据集分层，并可有多对多关联。本次阅读的是指定历史文档，仅作模型参考，不据此断言最新部署要求。 |
| Nextcloud | [版本控制](https://docs.nextcloud.com/server/latest/user_manual/en/files/version_control.html) | 文件历史/恢复是单独成熟能力；用户文件版本和科研业务状态应分开。所读latest文档标有upcoming版本，不锁定任何具体版本行为。 |
| Dify | [文档元数据](https://docs.dify.ai/en/cloud/use-dify/knowledge/metadata)、[实际LICENSE](https://raw.githubusercontent.com/langgenius/dify/main/LICENSE) | 可借鉴文档切块、元数据过滤和检索。LICENSE有多租户与前端标识的附加条件，不能笼统视为标准Apache-2.0；采用方式须逐项核对。检索引擎不替代课题组成员和任务授权。 |
| RAGFlow | [维护方README与LICENSE入口](https://github.com/infiniflow/ragflow) | 可作为复杂文档解析/检索候选；官方当前README起步推荐4核、16GB、50GB，实际随负载变化。不是AcceptCat试测数据，也不代表所有RAG方案要求该配置。整套服务会带来额外运行组件与权限适配。 |
| Docling | [支持格式](https://docling-project.github.io/docling/usage/supported_formats/)、[仓库](https://github.com/docling-project/docling) | 优先做PDF/DOCX/PPTX结构解析的可替换候选，支持OCR和本地执行；旧DOC/PPT依赖LibreOffice。代码MIT不代表所选模型/所有依赖自动相同许可。中文双栏、公式、表格、扫描件和PPT视觉必须另测。 |

另查 [SQLite FTS5](https://www.sqlite.org/fts5.html)、[pgvector混合检索](https://github.com/pgvector/pgvector#hybrid-search)、[阿里云OSS版本控制](https://help.aliyun.com/zh/oss/user-guide/overview-78/)。全文索引、向量索引、对象版本均是组件，不提供完整科研资料治理。

## 建议的产品模型

保留工作台“资料与素材库”入口。按课题组/个人可见范围切换，主分类为论文与文献、代码与数据、专利、项目申报、汇报与PPT、方法与写作。另用“模板/案例/方法/正式成果”等用途筛选，并区分本组成果与外部参考；分类与用途不建成互相复制的多套文件夹。

核心为资料条目、多附件、不可变文件版本、条目关系、专题引用与任务引用。一个条目可有PDF、Word/LaTeX、补充材料和外部代码仓库；可进入多个专题，跨权限展示仍逐项鉴权。论文关联代码仓库及固定commit、环境/复现说明；发表和复现状态分别记录。项目关联申请书、获批证据、通知、预算和总结；申报/获批/结题区分。专利区分交底、申请、公开、授权及相应文件。PPT保留可编辑原件，后续按页建立缩略图、文字、用途与出处，不声称提取文字等于理解版式。

模板记录适用年份、机构/资助方/期刊、来源、维护人及推荐版本；正式案例与通用空模板分开。用户只需少量基本字段，AI可以提出分类和关系建议，不能推断“已获批/已发表/已授权”。领域状态由有权限的人及相应证据确认。

素材来源分三路：团队主动贡献且确认可共享的真实案例；官方指南/模板及有明确许可的公共素材；团队自行沉淀并审阅的方法。公开可下载不自动等于可打包再分发，许可不明则保留出处链接。本组案例可制作脱敏共享副本，保留其与原件的关联。系统交付的是组织和复用能力，不能承诺自动填满某课题组的历史申请书与内部成果。

候选闭环：老师/学生上传或选入 → 核对分类/范围 → 在任务中引用明确资料版本 → Agent按当前权限读获准片段并给出定位 → 生成新任务材料 → 老师审阅 → 明确选入团队案例/成果库。模板实例不覆盖模板，任务验收不自动授予全组共享；未加入课题组不读取其资料。

## 建议技术边界与实施顺序

自建AcceptCat的科研条目、关系、权限、模板复用和任务闭环；复用存储、解析与检索组件。已有Zotero/飞书/NAS继续保留，第一步支持明确选入/外链和来源标识；双向同步与统一登录另估。不另造Office多人编辑、网盘同步客户端或Git托管服务。

1. 当前React/Electron与TypeScript API保持；第一批沿用SQLite，补条目/附件/关系/筛选和迁移。FTS5是关键词索引候选，需显式中文分词、索引更新、撤权和短查询评测，不能认为默认unicode61已解决中文检索。
2. 原件使用存储适配层，当前blob可兼容，生产候选阿里云OSS私有Bucket，文件和缩略图分开；权限以AcceptCat为准，对象存储版本不替代业务版本/备份。较大文件分片/直传、配额和清理须设计后实现，当前10MiB不能简单放大。
3. 现有worker旁增加隔离解析任务，Docling/必要的LibreOffice和中文OCR作为服务器可替换服务；展示排队/已解析/失败/仅原件及重试，避免阻塞聊天与任务API。先部署在受控Linux服务侧，不要求每位Windows用户安装Python/Docker。原生预览与中文字体还需验证。
4. 第一批先做好可见范围、字段和关键词检索。语义阶段采用关键词+向量的混合检索候选；若迁移到PostgreSQL，可用pgvector减少独立搜索服务。当前大量SQLite SQL与迁移需单独评估，不能当成安装一个插件即可切库。不在首批同时引入多种向量数据库、图数据库或整套RAG平台。
5. 原件、文字、缩略图、索引、缓存和Agent回答均按同一授权策略处理；搜索候选阶段过滤权限，引用返回前复核；撤回后停止后续检索。外部模型读取前仍需明确材料范围，不能默认全库可传。

工作量仅为工程估算：按10–30人试点、约5000份以PDF/DOCX/PPTX为主的资料、复用现有账号任务与资料API，第一批“分类/多附件/基础预览/版本权限/任务引用”约6–10人周；语义检索、复杂OCR和资料辅助整理另约6–10人周。两名熟悉项目的工程人员第一批约4–6周，包含联调回归，真实导入清理、现有并行工作、采购与服务器变更可延长；正式承诺前先做小样本验证。完整在线Office、双向同步或大型实验数据管理会明显扩大到持续项目。

下一步候选是20–50份获准样本和约30个真实找资料问题，衡量分类负担、原件/版本可回溯、中文/扫描/PPT解析、查找正确性与权限隔离，记录解析耗时/资源后再决定检索引擎和硬件。本批未读取这些样本、未运行此评测。

## 后续收窄：优先接入课题组既有飞书（2026-10-20）

用户认为自建知识库范围过大，提出直接连接飞书，并明确回答“已经在用飞书，资料也在里面”。因此后续候选优先级调整为：保留飞书作为现有资料和协作文档的主要来源，AcceptCat先做有明确范围的只读连接、原文引用及科研任务衔接。上文完整自建分类/解析/索引方案保留为长期参考，不作为首期全量开发清单；先前6–10人周估算不能直接套到飞书接入，也不是已承诺工期。

### 官方能力与限制核对

- [飞书开放平台介绍](https://open.feishu.cn/document/client-docs/intro?from=op_develop_app)列有知识库子节点/节点信息、文档内容读取、复制模板、创建/归档文档及消息等能力；[项目管理集成方案](https://open.feishu.cn/solutions/detail/docs?lang=zh-CN)说明通过用户身份调用文档API和云文档组件集成。说明技术路径存在，不代表当前AcceptCat已获准访问任何资料。
- [官方远程MCP工具清单](https://open.feishu.cn/document/mcp_open_tools/supported-tools?lang=zh-CN)提供fetch-doc、search-doc、create-doc、update-doc等。所读清单中search-doc仅doc/docx，fetch-file为文档内素材且5MB以内、需下载权限；fetch-doc也有类型限制。这些是具体MCP工具的边界，不能推成飞书全部OpenAPI的统一上限，更不能声称接入后所有PDF/PPT/多维表格都能被AI全文读取。
- [应用类型](https://open.feishu.cn/document/home/app-types-introduction/robots-web-applications-and-mini-programs)区分同一企业内的自建应用和面向不同租户的商店应用。已有一个飞书组织的试点可先评估自建应用；多课题组/多租户产品化、审核和组织策略另行处理。
- [官方Node SDK](https://github.com/larksuite/node-sdk)支持Node/TypeScript、开放API及鉴权辅助，适合现有服务端的有限连接层。旧[larksuite/oapi-sdk-nodejs](https://github.com/larksuite/oapi-sdk-nodejs)已弃用并指向新仓库，不作为新接入依赖。[官方本机MCP](https://github.com/larksuite/lark-openapi-mcp)与远程MCP是可验证选项，部署/身份模式须分别核对，不将其当作已经适配多用户生产连接器。
- [访问凭证官方文档](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/tenant_access_token)明确应用身份及App Secret仅应位于服务端。候选个人读取优先使用用户OAuth授权，并同时限制API scopes、用户实际文档权限、AcceptCat课题组/任务权限和用户选定范围。飞书组织/群聊与AcceptCat课题组不自动等同。

### 候选最小闭环

1. 在现有飞书组织内连接一个明确的资料空间，用户授权并选择文档/目录；先用少量原生文档与可支持附件验证，按可读类型明示结果。
2. 资料与素材库显示原文链接、来源标识和实际读取时间/版本；编辑与日常整理继续在飞书进行。首版原文跳转优先，嵌入式编辑另评估SDK适用条件。
3. Agent按需读取所选资料，并在回答中标注真实来源/读取范围；失败、撤权、失效和不支持格式分别处理，不用一个高权限应用身份向所有成员提供全文。向外部模型提供资料仍受本人明确范围约束。
4. 既有任务规划Agent把获准资料引用到AcceptCat任务。飞书正文变更时，任务审阅需要明确当次引用版本；必要的获准快照、缓存保存范围/有效期另设计，不默认镜像整个知识库或宣称即时撤回既存副本。
5. 首个闭环可用后，再评估确认后把成果写到指定飞书位置、通知和群机器人；这不是本轮对外写入或发消息的授权，飞书任务状态双向同步也不并入首期。

能够减少自建文档编辑、文件目录和日常资料整理界面的工程量；仍需开发用户/租户身份对应、授权更新/撤销、访问范围、文件类型适配、重试/限频及版本引用。先验证现有资料空间再估工期。当前仓库源码检索未发现飞书连接器；本批只更新调研/状态/日志，未创建飞书应用、索取App Secret、安装SDK/MCP、绑定账号、读取私人文档、改权限、发消息、打包或部署。生产和安装包沿前一独立部署记录，本批没有重新核验生产。
