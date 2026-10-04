# OpenIM 客户端源码采用清单

上游：[openimsdk/openim-electron-demo](https://github.com/openimsdk/openim-electron-demo)，固定提交 `62d7ca7b12e91144b315f36c8ebd1d9e0457a352`。此次采用的是网页界面源码与资源；真实账号、消息、科研任务、权限和模型调用继续由本项目 API 提供。

完整上游许可文件原样保存在 [LICENSE](LICENSE)，上游 README 原样保存在 [UPSTREAM-README.md](UPSTREAM-README.md)。README 的授权说明与 LICENSE 同时保留，不作删除或改写。本清单记录来源，不宣称已购买或获得额外授权。

## 实际进入运行界面的代码

| 上游路径 | 本地实际使用位置 | 移植差异与使用方式 |
| --- | --- | --- |
| `src/styles/global.scss` | `src/openim/client.css` | 采用蓝色主色、灰色副文本、边线、浅灰/蓝色气泡变量、滚动条规则、图片防拖拽；限定 `.chat-window` 作用域，保留应用全局样式隔离。 |
| `src/pages/chat/ConversationSider/conversation-item.module.scss` | `src/openim/client.css`、`src/chat-view.ts` 的会话行 | 将 Tailwind `@apply` 展开为可执行 CSS；移植圆角、间距、选中背景与置顶角标。置顶、未读值接本项目 0.11.0 服务投影。 |
| `src/pages/chat/ConversationSider/ConversationItem.tsx` | `src/chat-view.ts` 的 `renderList` | 将头像/未读徽章、44px 双行、标题与时间、截断预览的 DOM 布局从 JSX 改为现有原生 TypeScript；删去 Zustand、SDK 与 React 路由依赖，不采用 `dangerouslySetInnerHTML`，所有内容经过转义。 |
| `src/pages/chat/queryChat/MessageItem/message-item.module.scss` | `src/openim/client.css`、`src/chat.css` | 将 `@apply` 展开，移植消息容器、反向本人消息、profile、`w-fit` 气泡和换行规则；适配已有类名和移动端宽度。 |
| `src/pages/chat/queryChat/MessageItem/index.tsx` | `src/chat-view.ts` 的 `renderMessage` | 移植头像/消息头/气泡容器及本人反向布局；消息类型由本项目授权内容和协作卡投影提供，不调用未接入的 OpenIM SDK。 |
| `src/pages/chat/queryChat/index.tsx`、`ChatFooter/index.tsx` | `src/chat.css` 的 `.chat-main`/`.chat-composer`、`src/chat-view.ts` 编辑器 | 移植头部、弹性历史、底部白色编辑器和右侧发送按钮布局；使用原生 textarea，保留本项目中文 IME、失败留稿、明确发送意图和权限闭环。没有引入 CKEditor/RTC/文件图片发送路径。 |
| `src/layout/LeftNavBar/index.tsx` | `src/openim/client.css`、`src/chat-view.ts` 导航 | 移植 48×52px 竖向导航、选中状态和 active 图标切换；保留现有任务入口及实验室设置。 |
| `src/components/OIMAvatar/index.tsx` | `src/openim/client.css`、`src/chat-view.ts` 的 `avatar` | 移植方形 42px、蓝背景、白文字、群默认头像逻辑；原生 HTML 提供真人名称首字/AI 图标，不复制 Antd Avatar 或虚构头像 URL。 |
| `src/utils/common.ts` 的 `bytesToSize`、`getFileType` | `src/openim/common.ts` | 保留函数实现；实际用于材料上传表单显示 UTF-8 字节大小与文件后缀。 |
| `src/utils/imCommon.ts` 的 `formatConversionTime`、`formatMessageTime` | `src/openim/common.ts`、`src/chat-view.ts` | 采用最近/日历/旧日期分支，改用内置 Date/Intl 中文格式，删去 dayjs/i18next。实际用于服务端真实时间的会话行、消息头及五分钟时间分隔。 |

`src/chat.css` 首行导入 `src/openim/client.css`。以上代码经生产 Vite 构建进入真实聊天页面，并非未调用的源码备份。

## 原样复制且实际渲染的资源

- `src/assets/images/nav/nav_bar_message.png` → `public/openim/nav_bar_message.png`
- `src/assets/images/nav/nav_bar_message_active.png` → `public/openim/nav_bar_message_active.png`
- `src/assets/images/nav/nav_bar_contact.png` → `public/openim/nav_bar_contact.png`
- `src/assets/images/nav/nav_bar_contact_active.png` → `public/openim/nav_bar_contact_active.png`
- `src/assets/images/contact/group.png` → `public/openim/group.png`

会话/通讯录按钮按真实选中状态切换原图，群会话使用原群头像；未采用上游品牌 logo。

## 本项目新增的接线与交互

联系人详情先展示真人/AI 身份、主人与实际可用状态，再发起私聊；本人真人资料不提供非法私聊。消息草稿在同标签 sessionStorage 按成员 ID 隔离，退出/权限失效清理。待确认协作单按钮位于展开的完整范围之后；预算、材料、时间、成员及任务版本均保留可检查。运行状态与错误常规细节折叠，服务错误明确显示。

会话未读/置顶接本项目真实持久化接口；仅当前可见、历史位于底部的聊天提交该已渲染快照最大 sequence。未打开会话、通讯录、手机列表与向上翻历史不确认新消息。仅授权他人的 AI 入群不会把其主人带入未授权群。

此次未安装 OpenIM Server、SDK 或 Electron；没有宣称 OpenIM 在线连接、语音视频、图片传输或跨设备实时通信已接通。未投入真实模型 API Key，真实模型验收另行记录。
