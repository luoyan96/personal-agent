# Windows0.10.25：飞书授权入口与操作指引

2026-10-20，北京时间。接续实际干净 `chore/harness-0.2.1-rc.2` / `60a6afd`，分支 `fix/feishu-authorization-entry-0.10.25`，产品固定 **d74a18768e329c70dffa28febd9e8931a621210a**。没有切main或覆盖已有修改。

## 用户操作

1. 在课题组资料点击“连接飞书资料 → 连接飞书”，桌面请求系统浏览器打开授权页。
2. 在浏览器登录自己的飞书账号并完成授权。弹窗保留“再次打开飞书授权”和“复制授权链接”，并说明未看到授权页时如何继续；复制失败时可选中只读链接手动复制。
3. 浏览器显示“飞书授权已完成”后，返回AcceptCat点击“检查授权结果”。未完成时明确提示继续授权，已连接后引导粘贴文档链接、读取预览。
4. 十分钟链接到期后，打开和复制按钮停用，点击“重新连接”获取新链接。再次打开同一有效链接不重新生成OAuth state。

原蓝色区域是提示卡，只有小行链接可点击；通用Electron外开未等待或展示打开失败。当前改为明确按钮和专用IPC，等待shell回执并设五秒上限，失败可复制继续。回执文案仅表示已请求打开，不将浏览器请求等同于授权成功。没有在用户机器重现并确定系统默认浏览器或关联配置故障。

## 实现边界

主进程只接受已连接服务的当前主窗口/主frame/rendererOrigin；固定 `https://accounts.feishu.cn/open-apis/authen/v1/authorize`，校验七项参数、S256、state/challenge格式、原三项只读scope，以及与当前服务一致的精确callback。拒绝额外/重复参数和其他协议、路径、回调服务。预加载提供专用方法；网页 fallback 从按钮手势直接打开，并清除opener。没有新增通用任意地址打开接口。

保留原OAuth/PKCE与服务端会话绑定，浏览器回调不依赖浏览器另有AcceptCat登录cookie，因此本次不改API。账号/页面切换后迟到的连接回复不能触发外开。资料纯文本预览、确认保存私人副本、Agent显式集合绑定及任务规划片段保持。

## 验证

- 渲染/主进程类型检查通过；30项定向通过，覆盖新URL/IPC/网页打开边界、既有飞书规划、资料聊天发送恢复、聊天列表宽度与Chromium传输。API/契约/核心/Skill未改，不重复根694项CI。
- Browser plugin not available，采用CUA内置浏览器/AX/Playwright。1280×720实际组件、真实HTTP/SQLite、合成飞书服务验证：初次打开失败反馈；复制按钮与只读链接；重复打开计数2/连接创建1；未授权检查提示；缩短返回有效期后禁用/重连；实际callback后显示已连接并读到合成文档；切换账号后迟到POST不外开（opens保持5、connects4→5）。没有访问真实飞书账户、私人文档或调用模型。
- 页面复制API返回成功，CUA虚拟剪贴板读取为空且粘贴工具拒绝，不能据此记为系统剪贴板字节验证。手动复制入口可见；相关限制保留。其他真实窗口尺寸未验。
- Electron **22.3.27** 隐藏隔离测试使用生产编译的完整preload和实际IPC；成功等待回执、shell失败和替换callback拒绝通过。shell为明确的合成替身，**没有实际打开系统浏览器**。预期拒绝日志保留，不视为未处理异常。
- 最终UI仅既有Router未来行为警告与AntD findDOMNode弃用提示，无新运行异常或框架错误遮罩。类型检查首次跨项目导入失败后，将完整校验保留主进程，渲染层仅检查固定跳转地址，未放宽tsconfig。
- Git外证据 `D:/deepseek-agent/.runtime/feishu-entry-20261020`：focused-tests.log、renderer-types.log、electron-types.log、authorization-steps-final.png、authorization-expired.png、connected-preview.png、ui-console.json、native-ipc-proof.json、构建与安装载荷/启动日志。初次夹具编码/语法、Electron工具路径与虚拟剪贴板限制单独留存。

## 安装包与发布状态

Windows x64 NSIS **C:/Users/luo/Desktop/AcceptCat_0.10.25.exe**，**87,433,132字节**。

| 文件 | SHA256 |
| --- | --- |
| 安装器 | `5f33fee28739a4282a819d717ab1791371f1837403d6047cf3903c9592a5a015` |
| 实际NSIS内app.asar | `615490cc68cd3a853d75895cac34b1d0299bf4c39fe542990927c88602803857` |
| 实际NSIS内AcceptCat.exe | `d22884d3bab2ec0f3c76504deceb1cb0c9dfaf2240582088c92d085bf9a262f4` |

生产构建、18JS/8CSS逐字节、52运行包/55装配包、新飞书IPC与校验模块实际入包、旧功能/品牌资源及无QA内容检查通过。实际NSIS内EXE/ASAR与受测目录一致；隐藏隔离数据目录原生启动OPENIM_ELECTRON_READY通过，既有electron-log重复初始化提示保留。

已制作并复制桌面，没有代安装、退出用户客户端、删除旧包或用户数据。GitHub latest实读仍v0.6.0，构建使用--publish never，无公开Release或更新源变更；覆盖安装后获得本次修复。

## 后台接续

无后台部署、迁移、凭据或飞书权限修改。沿已部署 `research-openim-api:harness-0.2.1-rc.2-20261020` / `sha256:34bba4d03a5d714d731c248302f1484d47382c52e833d004dda68c88e01c5130`，contract0.26/schema023，飞书0.1.0仅罗岩；本批未重新inspect线上服务。由本人在更新客户端后完成真实授权、选定文档试读，不能用合成OAuth或IPC回执代替该验证。
