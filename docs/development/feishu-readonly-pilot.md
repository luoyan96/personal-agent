# 飞书选定文档只读接入：首批试点

2026-10-20，从实际干净 `release/acceptcat-0.10.19` / `b497bde01cff96c0a24b5f3422f29485a1581e95` 创建 `feat/feishu-readonly-pilot`，产品代码固定 `2bbcfbce2e369fe8b64a92caf0dd22350a22b870`。用户已同意优先连接课题组现有飞书。没有切换 main，也没有覆盖已有修改。

## 使用路径

工作台 → 资料与素材库 → 连接飞书资料。成员用自己的飞书身份授权，粘贴一份新版文档 `/docx/` 或指向新版文档的 `/wiki/` 链接。AcceptCat 预览实际取得的纯文本、标题、飞书修订号、读取时间和原文链接。只读取选中的文档，不遍历知识库、文件夹或其他材料。

勾选确认后保存到本人拥有、当前仍为私人范围的集合；没有集合时可直接新建“飞书资料”。保存前再次读取飞书并比较文档 ID、修订和正文 SHA256，任何权限、内容、集合版本或连接变化均拒绝写入。保存的文字副本标明来源和限制，沿用资料库不可变文件版本、原始字节与精确片段引用。断开飞书不会删除已经明确保存的副本；用户可在资料库撤回。后续改为课题组/公开集合仍属于用户主动分享副本，不能称为继承飞书实时 ACL。

保存后可将最多 2200 字符、与预览正文完全匹配的一段原文带入新的任务规划对话，附原文链接、修订、读取时间和副本 ID。不会自动发送模型或创建任务；可编辑后发送，正式任务沿用原确认流程。跳转只有随机 nonce 进入路由状态，原文在内存中按账号和会话/服务代次隔离，十分钟内仅可消费一次。规划输入及发送后的对话沿用既有本机记录和服务端处理规则，不宣称跨设备同步。

个人 Agent 继续使用现有资料集合显式绑定、检索及引用验证。导入本身不授权 Agent，不加入课题组，不将私人材料同步给其他成员。

## 实现和边界

- contract `0.26.0`，新增五条会话 API：status、connect、disconnect、preview、import。connect/preview/disconnect 不缓存 OAuth 或外部读取响应；保存使用稳定 Idempotency-Key，未知回执可核对同一请求，避免重复文件。
- 另有公开 OAuth callback，只接受一次性 state 与授权码。state 绑定发起者、所属空间、仍有效的 AcceptCat 会话和应用；十分钟过期，重新发起和断开均失效，兑换期间断开/退出也拒绝落库。PKCE S256，App Secret 仅服务端密钥文件；用户 access token、PKCE verifier 和预览正文 AES-256-GCM 加密，AAD 含应用/空间/账号。授权码、token、密钥和飞书错误正文不进入响应或日志。
- schema023 只新增 `feishu_oauth_states`、`feishu_connections`、`feishu_previews` 及索引，不改已有业务表。服务启动不会自动迁移。旧schema022镜像不能直接启动新库；已获批完成的备份/显式迁移与配对部署见[独立记录](../deployment/feishu-pilot-20261020.md)。
- 外部 HTTP 独立在 `apps/api/src/integrations/feishu-client.ts`。只调用固定官方主机的用户身份 OAuth/user_info、wiki 节点和 docx 元数据/纯文本接口，不使用 tenant token，不抓取用户链接，不接受自定义接口地址，不跟随重定向。单次 HTTP 八秒、整体文档请求二十五秒；单个响应 1 MiB、正文十万字符，最多五份十分钟预览。超限报错，不静默截断整篇读取范围。
- 首批不申请 `offline_access`，不保存 refresh token；授权按返回的 expires_in 到期后要求重新授权。连接状态表示最近成功授权及本地有效期，单文档读取由飞书实时决定；拒绝/失效不会回退为应用高权限身份。
- 纯文本不包含图片、附件、评论或页面/表格视觉结构，不进行 OCR、代码执行或下载附件。暂不支持 PDF/PPT、旧版 doc、表格、多维表格、知识库目录遍历、检索整库、自动更新副本、写回文档或群消息。飞书保留原始资料和编辑协作。

## 部署配置与本人试点

用户明确批准后，已在飞书企业创建“AcceptCat 科研资料只读接入”，开通**用户身份**三项 scope：`contact:user.base:readonly`、`docx:document:readonly`、`wiki:wiki:readonly`。后台逐项显示已开通、数据范围与用户权限一致；回调 `https://chat.acceptcat.com/api/v1/feishu/callback` 已保存。另获上线批准后，2026-10-20 10:58实际发布0.1.0、审核通过、可用成员仅罗岩，对外共享关闭。App Secret仅写入批准的服务器root/0600文件，容器内复制为0600；没有真实OAuth或文档试读。详细应用ID、权限及发布截图留在Git外收据。

服务设置 `FEISHU_APP_ID`，将 App Secret 保存到服务器专用、受限权限文件，通过绝对路径 `FEISHU_APP_SECRET_FILE` 引入；复用 `LAB_CREDENTIAL_KEY_FILE` 进行加密。不要把 App Secret 填入客户端、仓库、镜像或聊天。可选 `deploy/openim/compose.feishu.yaml` 在现有两个 Compose 文件后追加，提供 `FEISHU_APP_ID` 和服务器 `FEISHU_APP_SECRET_PATH`，仅 API 挂载；生产入口将 secret 复制为容器内 0600 私有文件。默认生产配置不自动启用飞书。

当前线上API/worker配对为 `47c42ac+key-preview.4bc8d1f+feishu.2bbcfbc` / image `4ee12e77` / contract0.26.0 / schema023，12个源文件覆盖并保留生产原目录种子；[备份/恢复、迁移/回退演练、旧数据及凭据核验](../deployment/feishu-pilot-20261020.md)通过。服务器配置检查就绪，用户真实授权与选定文档仍待验证。新代码、安装包、应用发布、真实授权、后台部署和AcceptCat公开发布分别记录。

## 核验资料

使用官方 [用户授权码说明](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/obtain-oauth-code)、[用户令牌说明](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/get-user-access-token)；部分网页直读无正文，实际参数补以维护方 [OAuth 实现](https://github.com/larksuite/lark-openapi-mcp/blob/main/src/auth/provider/oauth.ts) 核对 v2 token、PKCE 和 scope。docx 和 wiki 响应字段与路径核对维护方 [docx 生成接口](https://github.com/larksuite/node-sdk/blob/main/code-gen/projects/docx.ts)、[wiki 生成接口](https://github.com/larksuite/node-sdk/blob/main/code-gen/projects/wiki.ts)。采用少量固定只读 HTTP 接口，无新增 SDK/MCP 依赖，原型不等同已通过真实组织的授权与文档试读。

## 验收记录

隔离证据位于 Git 外 `D:/deepseek-agent/.runtime/feishu-pilot-20261020`。使用真实 React、HTTP、SQLite 与**合成飞书提供方**；没有读取真实研究材料。Browser 插件未列出，使用已提供的 CUA 内置浏览器和其 Playwright 接口。

实际交互已走通：空集合入口 → 生成用户授权链接 → 本地合成回调 → 身份显示 → 粘贴链接预览 → 新建私人集合 → 明确勾选保存 → 生成一份文件 → 连续原文片段进入新的任务规划输入框。此过程未发送模型或创建正式任务。桌面1280×720页面非空、无 Vite 错误覆盖；既有 React Router v7 提前提示、AntD findDOMNode弃用提示保留。验收夹具热更新缺少原生getPlatform接口导致HMR失败，补齐夹具并完整重载核验，不据此声称客户端生产错误；原失败仍保留。

首次全量测试发现旧迁移回归用例固定 schema22，并且模拟旧库时未移除新增飞书表；已更新测试夹具的重建路径和最终版本断言，保留首败 `ci.log`。定向旧聊天/个人助手/连接迁移 64 项通过。未用生产库或替换历史迁移校验和来修复测试。

最终 `ci-final.log`：693项/55文件通过，2项实际生产CLI/HTTP检查与进程冒烟、缺DB边界、生产产物排除夹具通过。客户端类型及6项规划helper检查通过。Windows候选包、实际安装载荷、资源字节与隔离原生启动检查见[0.10.20交付说明](../deployment/acceptcat-0.10.20.md)。未测试手机视口、真实组织OAuth、真实材料或模型科研质量。

飞书0.1.0先保存草案并取消发布，获得用户独立上线批准后才发布；最终页面显示已启用/已发布/审核通过，仅罗岩可用。`feishu-published-self.png`为实际发布证明；原草案、权限和回调截图保留。React合成验收页面完整重载后，`qa-final.json`只剩既有AntD弃用提示，没有新运行错误。部署镜像的独立合成HTTP再次验证OAuth/PKCE、回调重放拒绝、账号隔离、wiki/docx预览、私人导入幂等、断开及旧Key预览；首败为该冒烟脚本漏开模型功能开关，修正后通过，产品代码未变。
