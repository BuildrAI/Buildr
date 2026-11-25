# 变更提案：将 Buildr Development DSH 插件重命名为 @buildr-ai/dsh-buildr 并焕新亮色等距 B 标

## 背景
`@buildr-ai/dsh-buildr-development@0.1.0-rc.1` 尚未在 npm 注册公开；用户决定将该独立 DSH 插件统一更名为更简洁的 `@buildr-ai/dsh-buildr`（本地开发变体 `@buildr-ai/dsh-buildr-dev`），界面展示名称同步调整为 `Buildr` / `Buildr Dev`，并将图标由原先较深沉的 `D` 标更换为贴近 `H` 标明亮色彩的等距立体 `B` 标。

## 方案
- 插件包名与通道隔离：`@buildr-ai/dsh-buildr` / `@buildr-ai/dsh-buildr-dev`，面板 ID 为 `dsh-buildr` / `buildr-dev`，展示名称 `Buildr` / `Buildr Dev`，正式握手端点 `/dsh-buildr/open`；内部与 `@buildr-ai/buildr@>=0.1.0-rc.67` 通信协议（`buildr-development-desktop/v1:` 与 `x-buildr-development-desktop`）保持完全兼容。
- 品牌图标焕新：在 `metadata.ts` 与 `client.tsx` 中统一采用亮色等距 `B` SVG（`#1f92f6`、`#f8af08`、`#14b3a4`）。
- 自举平滑迁移：将 `@buildr-ai/dsh-buildr-development-dev` 并入自举脚本旧包名列表，支持现有本机 DSH 开发配置文件平滑卸载迁移至 `@buildr-ai/dsh-buildr-dev`。
- 发布目标切换：将 `publish-harness.yml`、`harness-release*`、`harness-publish.ts`、`harness-handoff.ts`、`harness-npm-authority.ts` 与 `release-preflight.ts` 中的目标统一切换为 `dsh-buildr`，同时在准入解析中保留 `main` 既有历史准入条目的可读性并拒绝再次使用已退役目标。
