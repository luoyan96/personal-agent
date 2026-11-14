# AcceptCat 0.10.110-preview.1 本地验收包

2026-11-14，仅本机预览。未合并main、未推送Release、未部署后台；继续使用0.49/039接口，没有新迁移、提示词或账号数据修改。

## 固定输入与成品

- 分支：`feat/desktop-experience-refresh`，开发起点main/6779aa24670f6492fb7585fa6f69a38ef81cdb54。
- 固定构建：`0a12e4b3ead75a1c0ed3572c8c064dfbc08b4eea`，源码树`bd301a46aaa8294261580f1d92e47913c37438f5`，1776份输入。回执后续提交只更新文档。
- 构建入口：根`corepack pnpm@11.21.0 run desktop:win`，固定依赖、共享构建、工具、Windows打包，明确`--publish never`。
- 本地原包：`clients/openim/release/Base/0.10.110-preview.1/AcceptCat_0.10.110-preview.1.exe`。
- 桌面副本：`C:/Users/luo/Desktop/AcceptCat_0.10.110-preview.1.exe`，与原包SHA256相同。
- 大小421264125字节，SHA256 `14a87626932b7252e4aa5fd56a614a14b7c119d6ddb28d637ac64e62b0bce053`。
- Electron43.8.4、内置DSH0.2.1-rc.3、科研插件0.4.0和tectonic固定载荷保留，没有rcedit临时文件。

## 实际改动

任务、资料与习惯三个主要界面先生成设计图，再由6.1 Sol high子代理实施、主代理审核实际组件并修正。任务列表缩短，顶栏固定，新建个人/课题组任务进入同一菜单；交付区只有一处，选择或拖入本机文件后预览确认，助理准备复用相同链路，保留失败内容、版本冲突处理和原请求重试。已验收版本明确显示，新的未验收结果不会继承旧验收状态。计划仍按同事的两态设计。

聊天已确认请求保留在本机有界回执中，精确消息ID到达后去重，不因缺少SDK指针而立即消失，也不自动重发；连续批次共享turn、账号切换和图片容量有专门回归。停止回复跨导航后重新核对真实详情并提供显式恢复；搜索结果直接定位，普通服务通知收起，关闭按钮避开标题栏。

资料索引不再挂载团队Git模块。团队资料先显示可搜索文件列表与实际详情，更新记录和其他来源进入更多菜单，错误区分网络/权限/分支/清单并保留缓存。模板方法、本机报告、共享原件有准确标题和可用空态。习惯页删除重复概览，按实际记录展示，任意通用主题可见；长文原样可展开，通用习惯和助理专属笔记分开，分享收起，未改学习或压缩机制。

同名助理的可见标签及无障碍名称可区分；未知所属人不推定课题组。群聊默认全部列表，有空态与刷新；能力卡把名称与动作放在首屏，分类可选；技能管理不再挤着无关联系人，返回保留原助理；课题组成员与有效邀请优先、历史按需展开；互斥设置改成单选。

## 核验与边界

根CI通过：84个Vitest文件、992项测试，以及生产边界/真实HTTP合成流程检查。桌面最终615项通过，renderer和Electron类型检查通过。首轮607通过/2失败的日志保留：一个隔离测试缺少新使用的真实schema导出，一个静态文案断言过时；修正后29项定向和615项全量通过，未放宽产品超时或权限。

真实React/AntD组件的隔离合成浏览器检查覆盖任务交付、规划、资料、习惯、通讯录、设置与技能/课题组，桌面和窄屏无页面异常及文档溢出。Browser插件不可用，采用已安装Playwright/Edge。原图/实际截图合并比较、初轮问题与修正记录见根`design-qa.md`。开发态Router/AntD弃用警告保留。

从实际EXE提取app.asar与固定载荷，核对137份构建资源与本地输出逐字节相同，并检查新入口/消息恢复/本地缓存/截图/压缩功能代码均在成品中。提取的chatHistory代码由成品Electron在三个独立进程中禁网运行，完整正文与引用、账号/服务隔离、撤回优先和分页通过。提取的Git模块分别使用`https://github.com/luoyan96/files`和`.git`地址，均识别main/acceptcat-demo并同步6条公开资料；没有修改共享绑定或推送远端。更新清单SHA512/文件大小/附件一致，桌面副本SHA256再次核对。

隔离Electron启动到ready通过。其electron-log重复初始化提示在0.10.109同样存在，未阻止启动，本批未扩展修改日志机制。原生读取时系统锁屏，无法把截图作为应用证据；未进行真实账号的模型回复、SDK投递、系统拖放或原生标题栏点击验证。原始停止回复的后台原因也没有因此被确认修复；本批修的是客户端保留与恢复路径。负责人安装后进行真实账号验收。

## 证据

`D:/deepseek-agent/.runtime/experience-refresh-20261114/`：`build-source.json`、`windows-build.log`、`installer-audit.json`、`built-assets.json`、`electron-smoke.log`、`packaged-cache.json`、`packaged-library-result.json`、`update-check.log`、`desktop-copy.json`、`root-ci.log`、`client-all-tests.log`（首轮失败）、`client-all-tests-final.log`、类型检查与对照截图。`preview.html`是实际组件合成截图的本地预览。

同级`task-ux-refresh-20261114`、`chat-recovery-20261114`、`memory-profile-20261114`保存各工作流的截图、交互脚本、JSON和失败尝试。私人审计和真实运行记录均留在Git外；没有替用户安装本包。
