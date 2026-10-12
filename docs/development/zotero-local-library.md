# Zotero 本机文献元数据选入（2026-10-13）

本轮承接 `acceptcat` 前后端体验任务与 `acceptcat-3` 社区能力任务，完成上轮目录中的具体接入缺口，没有重复收录新条目。分支 `feature/zotero-local-library`，基于 `feature/community-research-catalog` / `0da9b08abfff501339c50870ea69c7a9cfa0d1c8`，生产源码 **5e85efe2e978c755c5d71edad44dc535f9ac4cfb**，[草稿 PR38](https://github.com/luoyan96/personal-agent/pull/38)。PR35/36仍是未包含的独立修复；合并前需协调公共组件及状态文档。

## 用户路径与实际交付

广场 → 社区科研工具 → Zotero详情 → 打开资料库 → 选择自己的私人集合 → 从Zotero选择。这个入口本身不读取资料。连接后由原生确认窗口允许本次读取，在Zotero个人库中选择集合，按标题/作者/年份检索，逐页勾选文献，核对文字，再确认上传到AcceptCat。

默认仅导入当前页选中的1–25条，作为一份TXT来源保存标题、作者、日期、期刊、DOI、原条目key/版本、本机实例、网址和摘要。未选条目、PDF、附件、笔记和批注不进入文件。全文未读、网址未访问、条目真实性未独立核验均在预览和成功提示中说明。TXT沿用真实资料服务的不可变版本、原件下载、关键词提取及既有获准Agent绑定，不新增工具执行或自动绑定。

现阶段只支持本人owned/owner_private集合。提交前重新读取集合，后端按expectedCollectionVersion核对；集合已变成公开或不再归本人时拒绝导入。没有创建默认公共/团队目录，不扩大成员权限。用户以后主动更改集合范围仍由原有集合管理流程处理。

导入结果不确定时锁住预览，保留同一请求正文和幂等编号；留在窗口点击“重试原导入”。明确版本冲突才重新核对集合版本。成功写入和列表刷新分开，刷新失败不重复提交。**没有新增跨软件重启的导入恢复**；响应不确定时应保留窗口重试，关闭后重新操作可能重复导入。

## 来源、许可与选择理由

- 依据[Zotero官方本机API](https://www.zotero.org/support/dev/web_api/v3/local_api)及[读取规范](https://www.zotero.org/support/dev/web_api/v3/basics)，访问本机23119端口的个人库users/0。启用入口位于设置→高级；只读无需API Key。官方API默认不分页，本适配明确limit25/start，搜索采用titleCreatorYear，不跟随分页链接或条目网址。
- 再读[54yyyu/zotero-mcp固定修订](https://github.com/54yyyu/zotero-mcp/tree/0faf1b25c4b9bb95e2571bc8af60b62e9ce10e24)README及维护元数据：未归档、最后push2026-10-08。Python3.10+、Zotero7+；服务/CLI为MIT，plugin为AGPL-3.0-or-later，不能用GitHub根license字段概括整包。
- 再看[Windows插件检测报告#700](https://github.com/54yyyu/zotero-mcp/issues/700)与[失败搜索/空结果报告#701](https://github.com/54yyyu/zotero-mcp/issues/701)。#700另有10月12日在Windows上使用Zotero7.0.24的用户报告；这些是社区原始报告，未在用户机器复现，不声称修好了插件。
- 本轮实现自己的有限本机元数据适配，无需上游MCP、Python、向量模型或插件。未复制上游代码/Skill、安装依赖或调整默认版本，公开目录继续保留固定来源及许可说明。`agents/skills`内容和单一来源不变。
- 本机读取不调用模型；确认导入后保存到用户配置的AcceptCat服务，后续Agent聊天仍按本人的既有模型服务计费。语义检索、全文、编辑、批注等上游功能未接通。

## 原生与数据边界

仅固定 `127.0.0.1:23119` 的GET请求，不接收renderer URL，不带Cookies或Key，不使用代理，不跟随302/file重定向。正文2MiB上限，10秒超时，JSON/API版本3、分页和字段验证；过长字段报错，不截断后冒充完整。集合和条目浏览最多到start5000，超出需缩小范围；一页满25条但缺总数时保守允许继续，真正空页单独显示。

读取许可保存在主进程内存，最长15分钟，绑定当前主frame及完整页面身份；取消、关闭或换页释放并中止已开始读取。账号切换由renderer世代/成员守卫关闭窗口，丢弃晚到结果；不是操作系统多用户身份认证。Zotero10+提供Server-ID时随请求核对实例，切换实例报错；**旧版无Server-ID时不能保证跨库身份**，预览明确未提供标识，不保存跨运行游标。

文献内容是未经信任的来源材料，不调用其中链接、不执行指令、不渲染原HTML。界面使用普通文本与既有猫咪/主题。原生桥不提供Zotero写方法或任意文件读取。

## 实际验证与失败记录

Git外证据 `D:/deepseek-agent/.runtime/zotero-local-20261013`。仅使用合成账号、文献与本地API，不读取个人Zotero库或Key。

1. `focused-final.log`：**13项**通过（7项新的路径/真实隔离HTTP/响应大小/错误/许可/取消/晚到/导出检查，6项原社区目录与技能导入回归）。HTTP测试核对生产固定目标后路由到隔离随机端口，不访问用户23119服务；超时测试只缩短测试时钟。
2. 客户端`tsc --noEmit`、原生`tsc --noEmit --composite false --project tsconfig.node.json`、完整`build-web.mjs`及四固定SDK资源通过。未修改共享代码、契约或内置Skill，不重跑根共享CI。默认原生composite检查暴露既有imageClipboard.ts文件清单问题；最初把新DTO写成.ts时也暴露跨project输出要求，改用.d.ts并明确include。没有为通过门槛调整生产运行权限或放宽类型。
3. `qa-passed.json`：**7组实际界面流程**通过，生产React/HTTP/API/SQLite/原生handler，Edge隔离profile，1536×1024和1024×726。Browser plugin not available，使用已有Playwright/Edge，无新浏览器依赖。Electron窗口、IPC传输和原生许可选择为夹具；Zotero响应是合成loopback服务，固定请求构造/读取器实际执行。
4. 覆盖目录跳转不读取、原生取消零读取、403配置提示/重连、分页/末条、选中摘要末尾保持、取消零上传、错误不同于空结果、真实API提交后合成503再用同编号重试只有一个来源、集合变公开拒绝、账号切换途中晚稿丢弃、第二账号不能发现/读取私人来源。两尺寸无水平溢出，模态标题、关闭与确认均可达，截图已查看。
5. pageerror0；既有Antd bodyStyle/findDOMNode和预期400/503/404保留。首轮UI失败仅为Antd将“完成”渲染成“完 成”的测试定位；改用实际可访问名称后通过，没有把首轮称为通过。错误prettier CLI路径、首次类型检查及初次QA证据保留；新格式化、最终类型/构建和QA分别记录，不掩盖失败。

远端run38299994061两Linux检查成功，首轮Windows共享检查632/634通过，discovery分页/seed与execution A12两条已有测试超过默认5秒时限。相关后端与测试本轮未变。请求重跑失败Windows节点，不提高预算或修改测试时限；execution A12本机定向通过。最初单独过滤discovery分页测试缺少同文件前面测试建立的任务，断言失败，该失败保留；改为整个discovery文件9/9通过。GitHub矩阵重试最终Ubuntu22.19、Ubuntu24、Windows24均成功，受测HEAD0135f0b、生产源码仍5e85efe；完整结果见Git外ci-retry-passed.json。不能把缺夹具的单测失败或首次共享时限失败算作通过，不为这次CI诊断重打包或部署。

关键复现命令（clients/openim）：

```powershell
node --test tests/zotero-local.test.mjs tests/community-research-catalog.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit --composite false --project tsconfig.node.json
node scripts/build-web.mjs
```

## 发布状态与后续

只提交本地候选草稿PR38；未制作新安装包、公开Release、安装/重启用户客户端、部署网页/API/worker或迁移。沿用2026-10-10的aee02447/Windows0.10.0/schema022部署记录，公开更新源仍0.6.0；本轮没有重新核验线上。上轮PR37三平台GitHub run38159262310已成功；本轮PR检查单独查看。

尚未验证真实Zotero版本/用户文献库、正式安装二进制或模型回复质量。先用用户明确选定的少量文献验证，再考虑全文/图表、群组库、增量同步和MCP自动工具；不把当前元数据导入称为完整科研文献Agent。技能库任务可继续负责引用格式与中文质量验证，本轮不触碰其SkillLibrary授权分支。隔离服务4646/4647与浏览器已关闭，未关闭用户软件。
