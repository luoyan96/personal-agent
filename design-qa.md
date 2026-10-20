# Design QA — 已保存模型与Key首尾预览

final result: passed (local implementation; production backend deployment pending)

2026-10-20，产品/API/包固定4bc8d1f7cde314a1a9a99d3360b49a8647d43497。用户提供“我的/模型设置”实拍，要求保存后知道具体型号、API Key中间隐藏。沿既有桌面视觉和配置管理流程，未生成新资产。

## 对照与五项检查

原图2556×1636物理像素，与实际React的1536×1024和1024×726 CSS px截图分别观察；原图、final-model-settings-1536.png和model-settings-1024.png在同次view_image比较。密度、原生窗口按钮、合成控制条为环境差异，未把合成配置当作用户真实Key。

| 表面 | 实际结果 |
| --- | --- |
| 字体/排版 | 保留中文桌面字体及原标题/表单字号，默认型号明确加粗；长型号在列表换行。 |
| 间距/布局 | 默认摘要在配置列表上方；原两栏配置保留，1024宽文档scrollWidth=clientWidth=1024，Key输入在窗口内，底部动作可纵向滚达。 |
| 色彩/token | 沿原浅绿选择/启用与灰色说明；“已保存/未选默认/预览不可用”均有文字，不用颜色代替状态。 |
| 图像质量 | 原品牌猫及Ant图标，无新增位图、拉伸或不相关装饰。 |
| 内容/状态 | 默认摘要和已保存型号读实际元数据；编辑未保存不改摘要，Key读实际本人/对应版本的脱敏响应，失败明确不可用。 |

P2已修：保存后列表只有服务商不易识别型号；空Key输入+“已保存”看不到身份；原密码眼睛容易让人误以为能取回完整旧Key。现列表和默认摘要列具体型号，旧Key只读首尾，更换用独立空输入。保存期间版本变化不显示旧版本预览，误贴遮罩在请求前拦截。

## 实际交互

IAB/cua_repl，真实React/HTTP/SQLite/认证、合成凭据，无模型worker或供应商调用：原Key读取、改名/换型号保存且Key不变、未保存摘要不变、拒绝遮罩、替换新Key、Qwen默认切换、移除/清默认/恢复、刷新读回、旧404/503降级、A慢预览切B不串数据均检查。客户端类型、680项共享检查、NSIS真实载荷及隔离原生启动通过。清洁重载新error0，既有Router警告2；首次类型/契约版本断言/加载超时/HMR选择器失败保留。

Git外证据D:/deepseek-agent/.runtime/model-config-summary-20261019：saved-model-initial-1536.png、unsaved-model-still-original-summary.png、model-saved-key-preserved.png、reject-mask-as-key.png、replacement-key-saved.png、qwen-default-saved.png、key-removed-no-preview.png、legacy-service-keeps-settings.png、preview503-keeps-metadata.png、student-preview-isolated.png、final-model-settings-1536.png、model-settings-1024.png、browser-logs-clean.json、saved-settings-proof.json。

无待修P0/P1/P2。生产当前0.25.0，新增0.25.1预览接口待明确部署确认；此实拍是隔离验收，安装新客户端不等于线上旧Key首尾功能已启用。Windows为目标，未声称移动端或真实科研模型质量已验证。
