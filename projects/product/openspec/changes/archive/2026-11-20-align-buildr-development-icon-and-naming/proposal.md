## Why

Buildr Harness 已采用象形 `H` 图标与浅底几何折带风格；当前旗舰工程入口仍沿用 `B` 图标及 `Buildr Web` / `Buildr Web Dev` 命名，在多入口并排展示时与产品线定位不够统一。将工程入口的桌面启动器与网页图标统一替换为象形 `D` 并将用户可见名称对齐为 `Buildr Development` / `Buildr Development Dev`，可在保留母品牌 `B` 资产的同时形成清晰的家族识别体系。

## What Changes

- 新增 `projects/product/assets/branding/buildr-development-icon.png` 象形 `D` 主图标，并保留原 `buildr-icon.png` 作为母品牌资产；同步更新桌面启动器图标（`Buildr.icns`、`Buildr.ico`）与前端网页多尺寸页签图标（`favicon.ico`、`favicon-32x32.png`、`icon-192.png`、`apple-touch-icon.png`）。
- 将前端入口页标题、顶栏品牌标志与页面内应用状态/弹窗文案由 `Buildr Web` / `B` 统一对齐为 `Buildr Development`（开发版标签页标题为 `Buildr Development Dev`）与 `D`。
- 将正式 npm 启动器与开发启动器默认入口名称由 `Buildr Web` / `Buildr Web Dev` 更新为 `Buildr Development` / `Buildr Development Dev`，并补充旧入口的兼容发现与同所有权平滑迁移清理逻辑。
- 保持数据目录（`Buildr` / `Buildr Dev`）、日志路径、CLI 命令、npm 包名、`CFBundleIdentifier`、JSON Schema 与 HTTP 路由不变。

## Capabilities

### New Capabilities

### Modified Capabilities
- `buildr-web-channel-isolation`: 更新开发与正式桌面启动器命名及开发环境标签页产品名展示，并规范旧名启动器入口的兼容发现与安全迁移清理。
- `workspace-cli-routing`: 更新开发版工作空间 CLI 路由发现来源，优先读取 `Buildr Development Dev` 启动器登记并在缺失时兼容回退既有 `Buildr Web Dev` 登记。

## Impact

- 受影响产品资产：`projects/product/assets/branding/`、`projects/product/services/buildr/resources/installation/launcher/`、`projects/product/services/buildr-web/public/`。
- 受影响源码与文档：`projects/product/services/buildr-web/index.html`、`src/app/`、`projects/product/services/buildr/src/modules/installation/`、`tools/build/launcher/`、`knowledge/docs/glossary.md` 及对应单测/集成/端到端测试。
- 兼容性：既有用户本机已安装的 `Buildr Web.app` / `Buildr Web Dev.app`（及 Windows 对应 `.lnk`）可在升级或重装时平滑发现与安全清理，未证明所有权的外部目标保持原样不误删。
