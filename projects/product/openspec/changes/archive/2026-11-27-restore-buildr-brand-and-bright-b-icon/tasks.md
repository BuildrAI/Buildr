# Tasks

## 1. 品牌视觉与图标资产
- [x] 生成亮色彩色立体 `B` 的 `projects/product/assets/branding/buildr-icon.png`，移除退役的 `buildr-development-icon.png`。
- [x] 更新 `buildr-web/public/` 多尺寸页签图标（`favicon.ico`、`favicon-32x32.png`、`icon-192.png`、`apple-touch-icon.png`）及启动器图标 `Buildr.icns` / `Buildr.ico`，并通过视觉与格式核对。

## 2. 网页、桌面启动器与跨服务发现切换
- [x] 更新 `buildr-web` `index.html`、顶栏亮色 `B` 矢量标志与样式、`AppLayout.tsx` 中的 `Buildr` / `Buildr Dev` 标题和提示文案。
- [x] 更新正式启动器（`npm-launcher.ts`、`launcher.ts`）与开发启动器（`tools/build/launcher/build.ts`、`manage.ts`、`web-profile.ts`、`workspace-cli-routing.ts`）为 `Buildr` / `Buildr Dev`，保留对 `Buildr Development*` 与 `Buildr Web*` 的兼容探测和按所有权平滑迁移清理。
- [x] 更新 `buildr-harness/src/process/development-cli-shim.ts`、`buildr-development-dsh-plugin/src/installation.ts` 及 `verify-desktop-pair.ts` 中的启动器候选顺序与路径引用。

## 3. 文档、当前认知与测试更新
- [x] 更新 `projects/product/knowledge/docs/glossary.md` 中的 Buildr Web 启动器条目。
- [x] 更新 `web-favicon-assets.test.ts`、启动器/路由集成与 E2E 测试及 `buildr-development-dsh-plugin/test/installation.test.ts`，覆盖新命名、新图标断言与旧名入口兼容迁移。
- [x] 完成 `buildr-web` 构建、相关 Static/Unit/Integration/E2E 验证及 `openspec validate --strict`。
