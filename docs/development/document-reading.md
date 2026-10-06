# 文档阅读上下文修复

日期：2026-10-06。API / worker固定 `94b26d1d4871c45ace12a86f93d4c19cce377c4d` 于21:02:07上线；21:25:34增加旧正文继续入口，最终客户端 `622e84bff20af8cefdd6d9004286da6ba6ba4a22` 于22:01:49补齐历史停留和成功请求后的跟随。PR5 / PR7 / PR8已合入main，三批三平台CI通过。发布标签personal-agent-2026-10-06.4指向622e84b，API内容与94b相同，schema18无迁移。后续文档提交不改变运行源码；最新事实见[当前状态](../current-state.md)。

## 最新补发：旧消息停留与阅读全文验收（22:01:49北京时间）

固定客户端 `622e84bff20af8cefdd6d9004286da6ba6ba4a22` 已于2026-10-06 22:01:49静态上线；[PR8](https://github.com/luoyan96/personal-agent/pull/8)已合入main（288b56f），[三平台完整CI](https://github.com/luoyan96/personal-agent/actions/runs/37474793438)全部通过。发布标签 `personal-agent-2026-10-06.4` 指向这份源码；API / worker仍94b26d1、镜像d56ee747、contract0.19 / chat1.8 / schema18，没有迁移。

- 查看历史后明确暂停自动跟随；消息由短加载行变成长正文、模型增量、canonical回执或尺寸变化不能仅因列表几何到底重启。Virtuoso followOutput为真正false；初始会话、同身份本人发送、显式End或真实向下滚到底才恢复。阅读全文成功ACK只向原会话 / 身份 / generation发跟随事件，迟响应不跨账号或页面生效。
- 当前Nginx root `/opt/research-openim/client-releases/622e84bff20af8cefdd6d9004286da6ba6ba4a22/clients/openim/dist`；精确公网index SHA256 `9f2591fb39dcf489669c693202d1006c926c24ac72df824cb142bf092ba99742`，八服务运行、API healthy、HTTPS ready0.19；八镜像与backend current全部保持。静态恢复只将Nginx副本 `/opt/research-openim/ops/history-scroll-622e84bff20a-20261006T140148Z/research-openim-production`复制回现有配置，nginx -t并reload后核对8c5f14c的e4ccf4c首页、健康和八镜像；不恢复数据库或切后端。原21:25补发记录仍保留各自基线。
- types / Web / 四固定SDK资源通过；7个必要production React / HashRouter / QueryChat / Virtuoso场景通过（6+1两次窄运行），API / SDK / model均合成，pageerror0 / unexpectedAPI0。旧源码本地合成场景未复现，不称失败门禁；真实Edge旧跳回观察为原故障证据。两个harness启动失败以及库警告保留。
- 线上确认浏览器加载精确新脚本index-0cce9eaf.js。旧IDE部分回执保持原142字范围；用可见“继续阅读全文”键盘Enter触发真实新请求，精确复用既有解析源而未重传文件。新轮成功使用全部5页 / 29415字符，partial=false，实际9127输入 / 446输出 / 3573ms，outbox sent。刷新后新canonical回复1份、编辑器空白；完整阅读入口和实际模型 / IM路径闭合。
- 先前自动化click几次未形成新turn、位置改变，不能单凭这些操作归因window focus；没有把未提交点击计通过。厂商上传Session过期一次，刷新同权限Workbench后同包上传、hash守卫及激活成功，无新增SSH / Key / 端口。维护连接已按本批收尾关闭，用户聊天保留。
- Git外 `.runtime/document-followup-20261006/history-scroll/summary.json`及两个render报告；`history-release/{bundle-receipt,deployment-online-1,source-review,upload-session-failure,live-button-final}.json`与真实新回复截图。用户论文正文、凭据和运行资料未入Git。扫描OCR / 图像 / 版式及超过20非空页、64000预算的全文仍未实现。

## 问题与修复

用户截图显示PDF已解析13页、49622字符，但本轮模型只有第一页118字符。原代码把文件阅读也限制为4000总token，先保留旧聊天历史，再从附件开头填入少量文字。首批两页短文件验收没有覆盖这一风险。

新文件请求或明确的附件追问按所选完整文件片段JSON的UTF-8字节数 + 8192生成保守预算，限制4000–64000总token / 90秒。它是准入估算，不能当成厂商实际用量；实际输入 / 输出及失败继续由运行记录保存。普通无文件聊天仍4000 / 90秒。

worker先完整保留本轮输入、Agent档案和获准记忆，再选择文件文字；旧历史只能使用剩余空间，不挤掉所选片段或减少回复预留。完整所选正文至少能留512输出token时优先全文，随后输出上限仍受实际剩余预算限制。超限时均匀分配各页文字空间，至多选择20个非空页，保留末页及准确字符范围，明确partial；显式页码先去重，不把空白页作为文字覆盖。

连续同一附件及页码的未开始批次沿用首份预算；换文件或页码开始新批次。新的附件请求会使旧连续轮失效。保存过的4000预算、原幂等重放、重试剩余额度、未知用量与旧阅读范围均保留，不追溯升额或制造旧回复全文状态。

## 界面事实

成功回复默认可见“已使用附件全部可提取文字（共N页）”或“仅使用部分文字，未阅读全文”。只有本轮成功、服务partial=false且去重后的实际范围覆盖字符总数，才显示全部可提取文字；解析总页数不是本轮使用页数。等待、失败、取消或旧范围信息不足不称读完。逐页范围可展开，重叠片段只计一次。

全文指可提取文字。扫描页、图表、布局和图片没有因此获得OCR或视觉理解；大于20个非空页或超出预算的文件仍可能部分读取。客户端不另行自动提交预算、重试、上传或IM发送。

## 检查与证据

- 根CI：44文件 / 537项通过，另2项生产入口、B0进程及生产fixture排除通过。
- 固定94b26d1的[GitHub完整CI](https://github.com/luoyan96/personal-agent/actions/runs/37456957982)在Ubuntu Node22.19 / 24与Windows Node24全部通过；本地客户端独立验证仍单独记录。
- 后端：23专项与最后3项页码去重 / 全文输出预留 / 原预算回归通过，源和测试类型检查通过。
- 真实HTTP / SQLite / 实际PDF解析器：合成PDF正好13页 / 49622字符；完整13页文本逐字等于持久解析正文，摘要、方法、实验和第13页结论都进入模型输入。预算63336 / 90秒，prompt JSON56949字节，准入上界58226，输出上限4096。明确第13页追问包含该页3817字符全文、该文件仍标部分读取。模型是合成ModelCall；固定Harness的本地SSE回归也为合成，不是实际厂商验收。
- 客户端类型、Web构建和四固定SDK资源通过。八组实际生产路由 / QueryChat / ChatFooter / CKEditor界面检查通过：全文、118字符片段、等待、失败详情、旧消息、重叠范围去重、空白页以及1440和320px。API / 身份 / SDK / 文件元数据 / 模型回复均合成；pageerror0，既有Router警告保留。
- 主发布助手实际执行并通过停写一致备份、源码 / 镜像 / 精确首页、78表全内容守卫；静态补发仅改前端root，全部八镜像及后端保持。没有新增SSH或端口。

Git外证据目录 `D:/deepseek-agent/.runtime/document-reading-20261006`：根 `root-ci-final.log`；后端 `backend-review.json`、`thirteen-page-call-proof.json`、`synthetic-thirteen-pages.pdf`；前端 `summary.json`、`render-d9dbb750/report.json`及截图；发布准备 `release/helper-tests.log`。首轮不合格PDF排版只提取1265字符、合成用量字段遗漏与错误测试路由匹配的失败日志保留。没有将用户论文、凭据或运行数据提交到仓库。

## 已解析正文的继续阅读

客户端8c5f14c以新请求精确引用fileRead.messageId并启用普通连续私聊，不下载对象文件、不发送SDK副本、不由客户端另传budget。部分成功入口只在Agent输出显示；无输出的失败 / unavailable / cancelled / interrupted只在原human请求显示；pending和全覆盖成功隐藏。发送前重新核验actor/session/direct/membership/send；导航或账号变化使迟响应无效。不确定ACK保留key/body，用户手动重试，不自动重试。旧SDK取回失败独立提示，并指向已有回执；通用错误不能直接认定实际302。

本批9组实际production路由组件验证通过（身份 / API / SDK / 解析元数据 / 模型均合成），types / Web / 四资源通过，证据`.runtime/document-followup-20261006/frontend/summary.json`及`render-7214ef96/report.json`。原401 fixture初始化失败保留；Console有既有Router / Antd警告及预期负例，不称零错误。

## 真实线上验收

- 原问题是4000总预算和旧历史优先挤掉正文；此前GitHub修复尚未部署。这次真实既有IDE论文新追问使用全部5页 / 29415字符，partial=false，实际9252输入 / 671输出 / 5066ms，回复涉及正文方法及实验。不是新上传用户论文，也未读取 / 改变Key或密码。
- 既有已登录Edge个人助理实际上传13页 / 49622字符合成PDF，Linux真实解析、既有模型及OpenIM路径通过。新上传实际13596输入 / 149输出 / 1895ms；新追问实际13582输入 / 80输出 / 2193ms，正确返回第4 / 8 / 13页末尾标记。两次预算均63352 / 90，全部13个文字范围及partial=false；这份合成重复文本不代表论文研究质量评估。三个正式回复outbox均sent；13页追问刷新后canonical回复1份，编辑器空白。
- API / worker实际镜像 `sha256:d56ee747229eeaffec170810b846f1265ca5c2afbffa4d32a95e69e66871017d`；backend current为 `/opt/research-openim/releases/94b26d1d4871c45ace12a86f93d4c19cce377c4d`。最终Nginx root `/opt/research-openim/client-releases/8c5f14c91f0248c522a52bb4c5eb31f440500f5b/clients/openim/dist`；公网index `e4ccf4c4069a7ab1cb5771880cd8b480c9aef09b70a0221470dd0381d322a65d`，八服务运行 / API healthy / HTTPS ready0.19。静态补发期间八镜像及后端current未变。
- 主发布停写78表SQL / 全行hash保持一致，备份 `/srv/research-openim-backups/20261006T130148Z` 的12checksum / 9gzip / 隔离SQLite integrity及18迁移检查通过；完整组件恢复 / 异地备份仍未验。静态补发回退只恢复Nginx副本 `/opt/research-openim/ops/continue-reading-8c5f14c91f02-20261006T132533Z/research-openim-production`及94b前端，API / worker / 数据库保持；主发布恢复2e69688需先栅栏未完轮并保留用量，不能覆盖旧快照。
- 沿用现有Workbench免密SSH；前次断开经刷新恢复。静态上传一次厂商Session过期、对应归档不存在守卫失败，刷新同权限连接后同包上传 / 核验 / 激活成功，失败记录保留。没有新增SSH、端口或Key。Git外证据 `.runtime/document-reading-20261006/release/{prepare-online-1,deployment-online-1,public-online-1,live-document-final}.json`、真实IDE及13页截图；补发 `.runtime/document-followup-20261006/{frontend/summary.json,frontend/render-7214ef96/report.json,release/bundle-receipt.json,release/deployment-online-1.json,release/github-ci.json,release/software-merge.json}`。



## 发布与恢复

契约仍0.19 / chat1.8 / schema18，仅更新预算和阅读语义说明；无数据库迁移或依赖变更。部署须将API / worker成对升级后启用同版客户端，记录固定源码、镜像、首页hash、备份和真实验收结果。旧线上基线2e69688可兼容当前schema18；回退保留现有数据库及用量记录，栅栏未完成轮次，再恢复旧镜像与前端，不用旧快照覆盖新聊天。实际操作见[ECS说明](../deployment/openim-ecs.md)。

上述真实既有5页论文与13页合成PDF已完成对应模型 / IM验证；合成PDF只验证全页输入与标记，不代表研究事实正确性评估。新论文真实上传会直接使用本机原文件解析。旧论文已解析时可发新的全文追问，或从部分回执继续阅读全文；旧历史不被改写。
