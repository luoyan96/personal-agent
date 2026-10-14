# 社区科研能力：后端目录与 GitHub 每日同步

## 实现范围

AcceptCat 0.10.3 客户端从登录后的 `GET /api/v1/community-catalog` 读取已收录目录、GitHub 缓存事实与待审阅候选；不再内嵌四项固定目录。共享契约 0.25.0，聊天协议和 schema022 保持。目录存入既有 SQLite `runtime_meta.community_catalog_v1`，无需迁移，API 与 worker 重启后继续使用。首次内容来自 `apps/api/src/community-catalog-seed.ts`，已存在目录不会因重启或代码更新被覆盖。

原有六份私人 Agent 配置和用途预览仍在客户端；社区来源说明与审阅提交在后端。Skill 正文继续以 `agents/skills` 或导入原包为单一来源，不在目录复制指令正文。此功能不更改私人技能、资料集合、Agent 绑定、模型 Key 或公开权限。

## 自动更新

API/worker 均设置 `GITHUB_CATALOG_SYNC=1`，持续运行 worker：首次立即同步，然后北京时间每日 00:00 执行。每个已收录仓库获取 Star/Fork、`pushed_at` 代码更新时间、归档状态、默认分支当前提交；仓库 `updated_at` 独立记录，不能当作代码更新日期。当前四项共用三个仓库，一轮仅查询三组仓库与提交接口。ETag 304 沿用已验证内容；GET 目录只读数据库缓存，无 GitHub 网络请求。

两个公开仓库检索查询覆盖 scientific skill 与 research agent，排除 fork/归档和半年内无更新项目，每个查询最多十个结果。合并去重并排除已收录来源，最多三十个候选，仅显示仓库说明、来源、Star、日期和声明许可。**自动检索不等于科研适配或质量验证；候选没有安装和调用入口。** 无中文介绍或依赖信息的候选需每日收录任务补齐，不能直接晋级。

可用 GitHub 公共 API，无需模型或 GitHub 凭证。共享 IP 公共配额不足时可由运营者配置绝对路径 `GITHUB_CATALOG_TOKEN_FILE`，使用已有、最小权限 token 文件；不提供客户端 token 输入。凭证内容不入目录、日志或错误响应。当前部署使用公共请求。

请求仅到 `api.github.com`，8 秒超时、手动拒绝跳转、1MiB 响应上限，校验仓库身份和 public 属性；不下载或运行候选源码。失败保留最后成功事实并显示缓存；一般失败十五分钟后重试，限流按响应等待、暂停后续请求。SQLite 十分钟租约防止多个 worker 重复同步，网络等待不持有数据库事务；短事务重新读取并合并运营者目录变动。

客户端沿用会话代际隔离及五秒可见页只读刷新；退出/换账号关闭旧详情。后台新增或调整已收录项后，当前客户端可直接显示。仓库 HEAD 与审阅 SHA 分开：显示“上游提交有变化 · 待审阅”，安装始终使用固定审阅提交。打开安装入口只读当前目录，检查源码仍由用户点击触发；正在检查的版本保持快照，避免轮询替换待审阅输入。

## 运营者审阅与发布

在 API 同样的受控环境、原数据库路径下运行以下 CLI。它不创建模型调用或安装上游代码。普通登录用户只有 GET，没有目录晋级/改版 POST 权限。

```powershell
# 查看目录、缓存与下一次同步时间
node apps/api/dist/community-manage.js status
# 导出公共审阅描述，编辑后保留原有项并加入新项
node apps/api/dist/community-manage.js export-reviewed > reviewed-public.json
# 确认作者、来源提交、许可、输入/交付、依赖/成本、资料、限制和验证后应用
node apps/api/dist/community-manage.js replace-reviewed reviewed-public.json
# 若到期或刚更新目录，运行一轮；通常由持续 worker 自动执行
node apps/api/dist/community-manage.js sync
```

描述格式见规范的种子文件与共享 `CommunityEntry`；替换是整个已收录目录，不是追加单项。最多一百项、二十个来源仓库，ID 唯一、来源固定 SHA、路径不能穿越。待接入状态不能标为可安装；现有 Zotero 适配标识只对对应项有效。审核文件只含公开介绍和来源，不包含学生论文、私有资料、记忆或凭证。数据库备份和生产环境操作沿用既有部署流程，CLI 不加载 dotenv、也不自动迁移或 seed。

现有每天“社区收录”任务继续查验原仓库、许可、依赖与公开样例；合格后用这份受控目录发布流程收录。技能质量任务维护已采用流程和实际验证。软件 worker 负责元数据和发现，科研适配需要审阅与调用验证。新增脚本或工具执行仍走独立沙箱与权限适配，不因目录收录而获得执行能力。

## 检查和交付记录

证据留在 Git 外 `D:/deepseek-agent/.runtime/community-sync-20261014`。真实 GitHub 公共请求已成功获取三个仓库事实和二十个候选；该检查仅验证数据同步，不评价候选科研质量。HTTP/SQLite/ETag/限流/租约/运营者变动/输入校验为合成网络测试，界面检查使用生产 React、真实 HTTP/SQLite 和原生 Skill 处理器，窗口及 GitHub 下载为夹具。安装包、最终检查数量及云端上线状态见 `docs/current-state.md` 与项目日志；源码存在不代表云端已启用。
