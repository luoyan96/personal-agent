# 科研广场与工作台入口分工

日期2026-10-18（北京时间）。用户要求去掉广场顶部“发现能力/课题组能力/我的Agent”整排导航，把后两项放入工作台。分支 `release/acceptcat-0.10.11` 接续PR59 / 8b3386b，产品/安装包源码 **d0386f0503701eff530a89e0e282ecc93354901d**。

## 实现

`CapabilitySquare.tsx` 将现有浏览器组件的view作为固定输入；广场包装只传public，不再渲染范围导航，也没有空toolbar占位。保留GitHub推荐/Star热门/代码最新/方向、搜索、目录状态、已绑定Agent配置及现有权限流程。不是用CSS隐藏旧按钮，也没有复制另一套服务或管理逻辑。

工作台增加独立栏目，复用 `WorkbenchCapabilities` 的固定view，切换时重挂载清理搜索/选择/弹窗，既有账号generation保护保持：

| 入口 | URL | 内容 |
| --- | --- | --- |
| 广场 | `/square` | GitHub社区能力发现 |
| 工作台→课题组能力 | `/workbench?view=capabilities` | 当前获准的课题组成员与Agent名片、配置及联系 |
| 工作台→我的Agent | `/workbench?view=agents` | 本人Agent、内置模板添加、模型/资料/名片管理 |

新栏目独立使用既有availability读取，不重复父层检查；隐藏无关的规划新任务按钮，资料库/技能/科研总览等栏目仍有原入口。面板内部h2与工作台h1分层，嵌套面板去除额外padding，栏目在必要时内部横向滚动，整页不横溢。未改变联系人范围、Agent权限、共享设置、API/数据库或后台目录运营。

## 验证目标与实际结果

入口流程：广场直接看到GitHub分类→工作台两个栏目→添加/配置本人Agent→资料绑定/公开名片管理；切换账号不保留他人的编辑入口。Browser plugin not available，使用已有Playwright及隔离Edge，验收页 `http://127.0.0.1:4866/__qa/index.html`，1536×1024及1024×726；真实React/API/SQLite，GitHub事实、账号和资料是明确合成样例，不计生产数据/IM/模型验证。

| 检查 | 实际结果 |
| --- | --- |
| 页面身份与非空 | AcceptCat/科研广场标题、实际GitHub卡片、内置助手与课题组名片均读取通过 |
| 旧导航移除 | public页没有capability-feed-tabs、范围按钮、空toolbar或内置模板区 |
| 推荐/热门/最新/方向/搜索 | 原说明/顺序入口正常，Zotero检索及清空可用 |
| 新入口 | 实际点击工作台栏目，URL分别agents/capabilities，原有技能/资料库/科研总览仍可访问 |
| 添加和配置 | 模板明确添加保存真实私人Agent，可读其资料管理；实际保存本人私人集合绑定，按API读回同集合ID |
| 名片管理 | 在工作台实际公开与撤回同一合成Agent名片，广场没有公开管理按钮 |
| 账号隔离 | B不保留A的文献助手配置，B读取A的Agent绑定被拒绝，回到广场仍无管理范围导航 |
| 截图/布局/控制台 | 1536/1024实拍已查看，无横溢/覆盖层，pageerror0，无未解释console错误 |

7组分阶段实际流程与客户端 **27项定向测试**通过，`tsc --noEmit`通过。定向命令：`node --test tests/community-discovery.test.mjs tests/agent-card-actions.test.mjs tests/agent-chat-navigation.test.mjs`。没有共享代码/内置Skill变更，不重复根全套；前批PR59最新8b3386b三平台Foundation本轮实际读回SUCCESS，不冒称本批远端已通过。

证据在Git外 `.runtime/square-workbench-20261018`。初始假目录事实数组只覆盖六个仓库、当前已七个，造成fixture响应500，修正数组取值后原API无需改动；另有错误CSS选择器、仅错误时才出现的重读按钮、confirm的无标题dialog/英文OK、旧技能标题定位与截图过渡动画失败。保留qa*.log/qa-failed-*.json/截图，分阶段续验保留前面已通过事实，不放宽产品ACL或限流；最终qa-proof.json合并检查与日志、注明checkpoint来源。Router未来标志/findDOMNode/既有bodyStyle警告及登出401/私人404分别解释。截图最终为square-1536/1024、team-1536/1024、agents-1024；早期动画截图不当作最终选中态证据。

## 交付

实际Windows0.10.11 NSIS、55运行依赖、15生产JS逐字节与dist一致、包内新入口/旧行移除/猫咪素材/无QA、安装器payload EXE与ASAR一致、隔离隐藏原生桥/renderer稳定启动通过；既有electron-log initialize警告保留。桌面文件 **87,401,103字节/SHA256 0c763b4dd18ea9f34c3d629327d83dc4bdf3f46f366a4668d273b8cbd0568530**，安装说明同目录；未代安装/关闭现装或删除旧包。[交付记录](../deployment/acceptcat-0.10.11.md)。README预览替换为当前真实组件截图，明确合成目录事实，不把截图数量/Star当作线上事实。

本次无需后台升级/迁移；没有部署API/worker、发布目录、公共Release或更新源，actual latest仍v0.6.0已核实。原后台47c42ac/0.25/1.12/022与线上八项目录仅沿用记录，没有新inspect或读取私人材料。PR50后台边界、三项来源运营和既有维护登录仍独立待办。本轮自建4866/4867按完整Node命令核对关闭，旧预览保持。新的入口不会增加资料/脚本/模型权限，真实IM送达与科研模型质量仍分别验收。
