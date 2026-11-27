# Change Proposal: 统一 Buildr 产品命名并切换亮色立体 B 图标

## 背景与动机
此前 DSH 插件已更名为 `@buildr-ai/dsh-buildr` / `@buildr-ai/dsh-buildr-dev` 并切换为亮色彩色立体 `B` 图标，但主产品网页页签图标、网页顶栏标志与标题、桌面启动器及其跨服务发现路径仍保留旧的 `D` 图标与 `Buildr Development` / `Buildr Development Dev` 命名，导致浏览器标签页、桌面入口与 DSH 插件视觉和产品名不一致。

## 变更目标
1. 将品牌主图、网页多尺寸页签图标（`favicon.ico`、`favicon-32x32.png`、`icon-192.png`、`apple-touch-icon.png`）、页面顶栏矢量标志及 macOS / Windows 桌面启动器图标统一切换为与 `@buildr-ai/dsh-buildr` 一致的亮色彩色立体 `B`。
2. 将浏览器页签产品名、页面内品牌名称及默认桌面启动器入口统一切回 `Buildr`（开发版 `Buildr Dev`）：
   - 正式桌面启动器：`Buildr.app`（macOS）/ `Buildr.lnk`（Windows）
   - 开发桌面启动器：`Buildr Dev.app`（macOS）/ `Buildr Dev`（Windows）
3. 保持数据根目录（`Buildr` / `Buildr Dev`）、Bundle 标识、npm 包名（`@buildr-ai/buildr`）、CLI 命令（`buildr`）与 Web 协议不变，同时兼容发现并按所有权平滑迁移 `Buildr Development` / `Buildr Development Dev` 与 `Buildr Web` / `Buildr Web Dev` 旧名入口。

## 影响范围
- 规范：`buildr-web-channel-isolation`、`workspace-cli-routing`
- 服务与资产：`assets/branding/`、`services/buildr-web/`、`services/buildr/`、`services/buildr-harness/`、`services/buildr-development-dsh-plugin/`、`knowledge/docs/glossary.md`
