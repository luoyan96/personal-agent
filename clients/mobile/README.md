# AcceptCat 手机端

独立的 React Native / TypeScript / Expo development build 工程，版本 **0.1.0**。本批只实现已有账号登录、会话恢复/退出、个人助手文字聊天。使用真实业务接口，没有演示登录或模拟回答入口；测试账号、模型和 HTTP 适配器只用于隔离测试。

完整命令、版本、会话/接口设计、检查与限制见 [移动端开发说明](../../docs/development/mobile-android-mvp.md)。先在仓库根目录安装并构建，再进入本目录安装独立依赖。

```powershell
# 仓库根目录（Node >=22.19、pnpm 11.21.0）
pnpm install --frozen-lockfile
pnpm build
cd clients/mobile
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm start
```

需要已安装 development build 的 Android 设备或模拟器。Expo Go 缺少本工程的原生网络模块，不能用于本工程验收。
