## 1. 图标资产替换

- [x] 1.1 保存象形 D 主图标到 `projects/product/assets/branding/buildr-development-icon.png` 并保留原 `buildr-icon.png`；使用系统图形工具生成桌面端 `Buildr.icns`、`Buildr.ico` 及前端网页 `favicon.ico`、`favicon-32x32.png`、`icon-192.png`、`apple-touch-icon.png`，核对文件魔数与像素尺寸。

## 2. 网页与启动器命名对齐

- [x] 2.1 更新 `buildr-web` 的 `index.html`、`AppShellView.tsx` 与 `AppLayout.tsx`，将页面标题、顶栏徽标与可见应用名统一为 `Buildr Development`（开发版 `Buildr Development Dev`）与 `D`，保留既有 DOM id 与状态交互。
- [x] 2.2 更新开发启动器构建与管理（`tools/build/launcher/build.ts`、`manage.ts`）和正式 npm 启动器及 CLI 帮助（`npm-launcher.ts`、`cli/launcher.ts`）为 `Buildr Development Dev` / `Buildr Development`，并支持对旧 `Buildr Web` / `Buildr Web Dev` / `Buildr Dev` 入口的兼容识别与安全清理。
- [x] 2.3 提取并接入 `developmentLauncherCandidates` / `resolveDevelopmentLauncherRoot` 供安装状态检查与 CLI 路由发现使用，同步更新术语表 `knowledge/docs/glossary.md`。

## 3. 测试、构建与验收验证

- [x] 3.1 更新并补充图标资源、开发/正式启动器生命周期、CLI 路由与浏览器标题/弹窗验证测试断言。
- [x] 3.2 重新构建 `web-dist` 并通过 OpenSpec 严格校验与收敛预检、Buildr 产品全量静态检查、全量单元测试以及受影响集成与浏览器 E2E 测试。
