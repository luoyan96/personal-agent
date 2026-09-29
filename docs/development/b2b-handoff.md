# B2b 联调契约与迁移说明 · 0.4.0

基线 658c1a815d83bc07565e378c48544fad2c1f60ae；包含 F2a-01、G2a 报告和 Windows 旧库测试准备修复。先交契约，服务随后实现与验证；不能单凭本契约提交宣布 B2b 可用。

唯一 Schema 在 packages/contracts；OpenAPI 与 examples 由同源生成。0.3 strict 客户端须整体升级 0.4.0。Task、Assignment、Schedule 原状态不另建副本。新增 TaskDetail changes/dependencyImpacts/artifacts，ActionItem change_response，overview pendingActions.changeResponses；新服务会填充可选字段，旧缓存/fixtures 可解析。前端必须明确处理新增变更待办，不能误渲染为验收。withdraw 改为不含任务材料的回执。既有协作命令保留幂等 key；退出/撤权后旧 key 也重新鉴权，不返回旧成功正文。

## 本批接口语义

- block/resume 保存与恢复原状态；恢复、开始、提交、验收均检查依赖和未复核影响。不能手工改 status 绕过。
- proposeChange 提供 scope、goal、acceptanceCriteria、schedule、dependencies、proposedLeadId、reason 和 expectedVersion。冻结发起人、验收人和已接受牵头者；提议者的提交本身记接受，其余成员须明确回应。最多一个 pending 提议，declined 保留原任务/承诺；全员接受才原子应用，保留旧任务与 assignment 版本。任务有其他变化则提议 superseded，旧请求冲突。已完成任务可提变更，通过后 changes_requested，旧验收保留。更换牵头者走退出/新邀请，不通过变更暗中替换；不同 proposedLeadId 返回 NOT_IMPLEMENTED。
- dependencies 使用共享 Dependency。仅 accepted_deliverable 开放，confirmed_decision 明确 501。指定 requiredRevision 时须该版本是当前有效已验收交付；null 在开始时绑定实际已验收版本，不随更新静默漂移。原草案 string[] 依赖继续有效。变更依赖通过同一提议/接受机制，提议与应用均检查自环、间接环和引用权限。
- 上游阻塞、关键范围/依赖/日期变更、退回、退出、取消、附件/访问撤回写入下游影响。活动下游暂停，已完成下游保留完成事实与影响，所有交付/验收版本不删除。acknowledgeImpacts 在依赖重新有效后由牵头/验收人显式复核指定影响，记录说明；resume 另行执行，不自动继续。
- withdraw 结束本人承诺、停止旧派发，保留交付与未交部分；非独立组织角色撤销访问。候选人另收 pending 邀请，仅见安全摘要，接受后才有承诺。新邀请清除前任 committed 日期。revokeAccess 由发起人执行，不能撤销发起/验收治理角色；退出或撤权均不得通过公开认领摘要重新进入。取消后除发起人审计历史外撤销访问，所有附件下载停止；不删除 outbox，未执行意图标记 cancelled，不伪称撤回外部结果。
- upload 支持共享契约限定的 text/plain、PDF、PNG，decoded 1–10 MiB，JSON body 另有上限；签名/UTF-8 基础检查不是病毒扫描。文件名仅元数据，随机私有存储名不返回。binary content 每次鉴权，attachment/no-store/nosniff，禁止公开静态目录或永久下载 URL。revokeArtifact 全局撤回附件内容，保留元数据、交付引用与历史；旧上传/交付/验收缓存也检查当前附件权限。
- 交付只能引用同任务已授权且未撤回的附件；sources.kind=artifact 的 locator 为同任务附件 ID。交付 revision 固定引用 immutable artifact ID/version，文件不能原地覆盖。草案 inputArtifactIds 跨任务材料复用仍未开放，返回 501。
- invitationDecision/claim 可由承接者填写自己的 committed（confirmed=true、source=member），与建议日期、已确认硬截止分别保存；未知 null。提议的 committed 只有全部必要成员接受后生效，来源/时区不改写。拒绝和未回应不形成新承诺。
- events 为授权分页历史，复用 B2a snapshot/cursor 的 410 重取语义；详情、人员、四列全量计数与 change_response 使用同一事务和 ACL。每任务最多 100 个提议/附件，影响只展示最近 100 个并标记截断，事件完整分页。B3/B4 继续不可用。

## 迁移计划与启动

新增 005，不修改 001–004：task_versions、assignment_versions、change_proposals/decisions、依赖边/绑定/影响、附件元数据及撤回状态，全部事务写入；从现有 B2a 文档回填边与当前版本，不删除旧数据。历史版本从升级时起完整记录，不能声称恢复 B2a 未保存的早期 task 版本。

停自己的 API 并完整备份 SQLite/WAL 后运行 pnpm build、pnpm db:migrate；重复执行校验 checksum，不重置数据。DATABASE_PATH、BLOB_ROOT、APP_ORIGIN、HOST、PORT、NODE_ENV 沿用 B2a；本地合成账号继续 db:seed / db:credentials，凭据只在忽略目录。附件文件与数据库一起备份；普通事务失败清理本次新文件，进程崩溃可能留下无元数据孤儿，绝不通过目录直接读取。正式备份恢复、恶意文档扫描及配额运维未验收。

最终服务 SHA、逐项证据、合成 seed 与具体启动示例将在实现通过后补充。F2b 浏览器和共同 G2 不由后端服务测试代替。本批不开放真实通知、AI worker 或进入 B3，不部署/合并。
