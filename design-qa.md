# Windows0.5.0 桌面设计与交互对照

final result: passed（本地隔离桌面/页面范围；不表示生产部署或用户安装升级）

依据为用户提供的微信桌面聊天、详情侧栏、名片与通讯录四张截图。目标是保留微信的阅读和导航习惯，同时容纳人与Agent、持久任务及能力发现；没有复制微信图片/品牌素材。实际Electron22/Chromium108 CSS1280×820、deviceScaleFactor1；通讯录/工作台/广场另测1024×726。参考原图1760×1278不伪称逐像素同尺寸复刻。

## 视觉核对

- 布局：72px浅灰导航、280px聊天列表、白/浅灰聊天区，四入口消息/通讯录/工作台/广场。通讯录约300px列表与右侧名片；工作台列表/详情，广场真实能力卡。
- 字体：系统中文无衬线、14px主要正文、12px辅助资料，长姓名/文件名截断或换行。取消旧大头像/多行重复标题与巨型输入卡。
- 颜色：绿色导航/选中，本人气泡#95ec69，对方白气泡与浅灰底；错误/待确认保留文字，状态不只靠颜色。
- 图像/图标：方形圆角头像、既有线性图标；电脑使用工具栏而非手机加号。没有抄用户截图内头像或文件内容。
- 文案/状态：Agent身份、所属、能力和授权范围真实显示；AI结果与用户验收分别记录，公开需主动发布。无连接时保留失败入口和已保存Agent，不虚构聊天已打开。

Git外截图已实际查看：`.runtime/desktop-social-workspace-20261007/{chat-streaming.png,chat-complete.png,chat-details.png,chat-search.png,task-group-chat.png}`与`.runtime/desktop-social-workspace-20261008/frontend/run-e948eb85/contacts-desktop.png`、`run-da814363/{workbench-1024.png,square-namecard-1024.png}`、`run-9fea4a47/scheduled-workbench-1024.png`。

## 修正与边界

已修正群引用导致@索引偏移、关闭抽屉时迟到更新、本人明确选择Agent仍须二次入群、联系人父路由双列表、新群打开前canonical mapping未刷新等P1/P2。完整CI568项+2生产检查通过，实际HTTP/SQLite任务/广场/通讯录与实际Electron聊天专项闭合。两种最小布局无横向溢出；管理页面pageerror0、最终群聊天pageerror0。原失败和Antd/Router开发告警保留。

不覆盖本批生产服务器或真实模型/IM传输验收；检查用隔离合成账号/模型/SDK网络端口，用户窗口未安装/重启。无未解决本地P0/P1/P2。P3：系统字体与参考设备不同，长期复杂任务/广场内容更密集；按实际用户资料而非静态演示持续调整。

---

# 历史F0 设计对照

final result: passed

范围：仅 01 需求入口、08 实验室总览、09 任务详情的视觉与基础交互。通过不表示真实任务服务、登录或 Harness 可用。

## 依据与捕获

源图位于 [设计索引](docs/design/README.md) 的 v1.1，均为 1487×1058 PNG。实际浏览器为 Codex In-app Browser（Chromium），桌面 CSS viewport 1487×1058，devicePixelRatio=1；截图工具返回内容区域约 1472×1047，比较面板将其规范到 1487×1058，仅用于肉眼对照，不声称逐像素相同。窄屏 CSS viewport 390×844，完整页面截图单独保存，不拿移动布局和桌面源图做逐像素比较。

| 页面 | 实际截图 | 同一输入并列比较（左源图、右实现） |
| --- | --- | --- |
| 01 | [入口](docs/development/reports/f0-evidence/01-entry.png) | [对照](docs/development/reports/f0-evidence/01-entry-comparison.png) |
| 08 | [总览](docs/development/reports/f0-evidence/08-lab-overview.png) | [对照](docs/development/reports/f0-evidence/08-lab-overview-comparison.png) |
| 09 | [详情](docs/development/reports/f0-evidence/09-task-detail.png) | [对照](docs/development/reports/f0-evidence/09-task-detail-comparison.png) |

状态为显式合成演示、实验室范围、未填写输入。密集内容另做 [表格局部对照](docs/development/reports/f0-evidence/detail-table-comparison.png)，上源图、下实现；按原始像素裁取内容区域检查字号、列宽、行距和状态文字。

## 发现与修正历史

1. 首轮 P2：卡片独占一行的状态和重复日期说明使人员区下移，底部输入被推离主要视区。改为卡片顶部状态文字，压缩间距，确定日期简写，未知/建议仍保留明确说明。最终 08 对照包含四列、人员表和底部输入。
2. 首轮 P2：仅页脚标识在长页面和窄屏首屏不可见。页头增加“演示数据 · 尚未连接服务”，页脚保留；真实模式显示服务未接通。
3. 首轮 P2：进行中步骤用了验收勾号。改为时钟图标并保留文字状态，验收仅用于已验收项。
4. 局部对照 P2：详情表文字偏小。将正文调至 17px、次级交付说明 15px、行高 1.4，保留表头/正文层次。修正后重拍 09 和窄屏长标题。
5. 编译阶段图标导出路径与声明问题已修复；最终浏览器控制台 error/warn 为空。此项是功能修复，不作为视觉比对的替代证据。

## 五项视觉核对

- 字体：系统中文无衬线，桌面入口 50px、页标题 40px、卡片 20px、详情正文 17px；长标题自然换行。未取得生成图的具体字体，系统字体渲染细微差异为 P3。
- 布局：暖白背景，无固定侧栏；约 1170px 内容宽，入口约 1004px；四列看板、人员表、详情表和两栏交付/更新保持源图层次。中屏两列、窄屏单列；表格保留横向滚动和键盘焦点。
- 颜色：背景 #faf9f6、正文 #15212b、强调 #246f61、警示浅黄 #fff4df。状态同时有文字，不靠颜色区分。
- 图像与图标：品牌小图从已有源图精确裁取，未用 CSS 重绘；线性图标来自 Phosphor。没有新增照片或插画。源图图标带生成纹理，实现采用清晰标准图标，属有意差异。
- 文案：不复制源图中会被误认为真实能力的陈述。保留未知日期、示例成员时间、未接通能力、交付项数含义和阶段说明；看板提示从当前范围数据汇总。菜单点改为具体状态，无假菜单。

## 交互与边界

入口 → 总览 → 详情 → 总览 / 对话、范围切换、需求示例填入、未接通提示弹窗、错误重试、未知 ID、空/加载/失败状态已在浏览器操作。Enter 打开 dialog，Escape 关闭后焦点回触发按钮；跳过导航到 main；窄屏表格 ArrowRight 实际滚动 40px。390px 下 document scrollWidth 不超过 innerWidth。完整记录见 [G0-F 报告](docs/development/reports/G0-F-2026-09-21.md)。

无未解决 P0/P1/P2。P3：系统字体与生成图纹理不完全相同；图标包仍含旧字体格式资源，可在后续性能工作中按真实设备需求裁剪。本批次不新增功能以掩盖限制。
