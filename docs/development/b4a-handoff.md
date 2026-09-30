# B4a 契约、权限与迁移交接 · 0.6.0

共同基线61eec851ac1f00e18b12e729f5fa6cdcc320f730。本文件先随契约/迁移提交；服务完成与实际验证以阶段报告为准。B4b和G5未开放。

## 精确授权矩阵

| 动作 | 来源要求 | 目标/其他要求 |
| --- | --- | --- |
| 留存结论 | 当前完整任务权限；本人是指定验收人；指定交付已验收；指定附件是该交付附件且可读取 | 显式内容/适用说明；owner_only或source_readers；不产生反馈共享 |
| 查结论/历史/列表 | 当前来源完整权限、选定revision附件未撤销；owner_only仅确认人 | SQL先授权再分页及计数；撤回后404/列表排除，持久审计保留 |
| 修订 | 原确认人仍有来源权限；新指定交付已验收 | expectedVersion与expectedTaskVersion；追加不可变revision，不改旧复用绑定 |
| 撤回结论 | 原确认人或当前来源验收人且仍有来源权限 | 隐藏所有版本内容；派生链路与缓存重新检查 |
| 选结论规划/执行 | 明确conclusionRefs(id,version)；版本current；源权限与scope通过 | 目标本人草案/本人承接任务；全部潜在读者必须已获来源权限；开放认领拒绝；禁止依赖环；无选择不入模 |
| 授予公共方法样例 | 指定已验收交付的提交人和验收人必须同为本人；selectedText必须是交付摘要原文片段 | 显式authorizeLabUse；只有片段可用，非原任务权限；首版不允许从已有复用依赖任务再公开片段 |
| 拒绝分享 | 当前来源权限与交付版本 | 可记录decline，不影响已完成或后续验收 |
| 读取样例/维护方法 | 现有内置公共能力owner；不自动授予源任务权限 | 只读明确可用片段；不枚举私人能力/方法 |
| 撤回样例 | 原grantor且现时有来源权限 | 依赖方法失效；若活动方法依赖它则停用并递增配置代次；旧试跑派生内容隐藏 |
| 候选/试跑/启用/停用 | 现有公共能力owner；候选只能引用有效样例 | 受控枚举配置，不接受代码/工具；试跑仍需本人承接目标、预算与真实Harness；精确方法试跑成功后人工确认启用 |
| 本人规划历史 | owner_id必须为当前会话成员；重新校验所有来源 | SQL先授权再count/page；无原始prompt；遵循F3-01状态与方案状态区分 |

API仍由cookie/CSRF/Origin认证，不能传actorId。版本冲突409；不可见资源404；无权动作403；陈旧结论/不合法状态409；范围扩大403；模型/能力不可用503。同原key重试不再产生新记录，缓存重放重验授权。精确Schema与每路由请求/响应样例位于packages/contracts。

## 撤回、过时和派生内容

结论通过不可变revision绑定sourceTaskVersion、交付id/version、附件id/version/hash和确认人。任何源任务版本变化、指定交付变化/退回、头revision更新均使旧revision needs_review，不能新派发；历史保留，用户只能显式追加新revision并重新选用。源撤权/附件撤销/结论撤回与“过时”不同：前者阻止相关内容读取，后者保留可读的历史并标需复核。

复用依赖保存于job、plan、task，使用递归来源图在服务SQL过滤列表/计数/详情/人员承诺及缓存。派生任务上的材料、交付和事件沿任务访问保护。撤回后不通过复制草案、confirm缓存、旧交付候选恢复访问；worker派发/写回也检查来源。不能追回已下载或已由用户手工复制到平台外的副本。

规划不再自动把其他任务全文加入模型上下文：taskIds及conclusionRefs须主动选择。修改已含结论的草案/执行已含结论的任务也须明确重选其绑定来源，不能偷偷省略依赖。公开认领或增加不具备来源权限的受邀者被拒绝。

## 方法与配置代次

既有capability.version继续表示启用配置generation，以兼容B3/F3。新增独立不可变methodVersion，运行同时绑定两者。007把B3原算法导入为method1/origin=legacy_b3，保留原generation和历史运行capability.version；不生成伪造“已发布/已试跑”历史。候选方法只允许emphasis/detail/exact_quote枚举；每次新候选追加版本，人工启用使generation递增，旧排队/运行绑定失效而非静默换方法；已结束记录仍保留旧方法。

试跑使用获准片段作为材料，经现有持久worker/Harness0.2.0-rc.1执行。模型工具仍为空；维护者不获得任务原文/附件/私人方法。样例失效的所有依赖方法不可新调用，活动方法必须停用；不声称进行了训练或能从模型“遗忘”。

## 007迁移

先备份本任务DB/WAL和附件，停止相关服务；不重置旧库。新增conclusions/conclusion_versions、reuse_edges/source权限视图、public_samples/sample_edges、public_methods/public_method_state/method_events。001—006不改。迁移runner仍在事务内按checksum只执行一次；再次运行检查相同历史。

`pnpm install --frozen-lockfile`、`pnpm build`后，使用同一私有配置两次运行 `node --env-file=.env apps/api/dist/manage.js migrate`。迁移代码与服务将在下一提交接入。升级旧库、实际启动、测试与完整SHA随后补入本文件。
