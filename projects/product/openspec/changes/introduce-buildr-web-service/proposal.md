## Why

Local App React 等价迁移已在 `product/buildr` 同仓完成，前端源码仍嵌在可执行 Service 内。继续把 React/Vite 工程与 CLI/runtime 混在同一 Service，会阻碍前端独立演进与日后云端表面拆分，也会让 Service registry 无法表达真实的前端工程边界。现在需要在不改变本机同源托管与 session 安全模型的前提下，把前端源码迁到同仓同级的 `buildr-web` Service。

## What Changes

- 在 Product Project 下新建 workspace Service `buildr-web`（`source.type: workspace`，路径 `projects/product/services/buildr-web`），与 `buildr` 同仓同级，并登记到 `services/manifest.yml`。
- 将 Local App React/Vite 源码所有权从 `projects/product/services/buildr/web` 迁到 `buildr-web`；`buildr-web` 负责前端工程与构建。
- `buildr` Local App HTTP **继续**同源 loopback 托管构建产物；构建产物由 `buildr` 在构建/打包时消费（复制或约定路径到现有 `src/interfaces/local-app/web-dist` 或等价可证明路径）。
- npm package / launcher / checkout 三入口仍只消费 `buildr` 内已纳入的静态 dist，不要求运行时依赖 `buildr-web` 源码或 Vite 开发服务器。
- **BREAKING（维护者路径）**：前端源码根从 `buildr/web` 变为 `buildr-web`；开发与 CI 的前端构建入口随之变更。对已安装用户可见的 Local App 行为与安全模型保持不变。

## Capabilities

### New Capabilities

- `buildr-web-service`: Product 下 `buildr-web` Service 的登记、源码根、React/Vite 所有权，以及向 `buildr` 交付可托管静态构建产物的交接边界。

### Modified Capabilities

- `local-app-web-client`: 源码根从 `product/buildr` 的 `web/` 迁到 `product/buildr-web`；行为等价、session adapter 分层与无 Vite 运行时依赖约束保持。
- `local-workspace-application`: 明确本机应用静态资源仍由 `buildr` HTTP 同源托管 package/checkout 内 dist；不因前端 Service 拆分改变 loopback、session 或离线 MUST。
- `npm-cli-package`: 打包与 launcher 继续包含 Local App web dist；构建/打包流水线从 `buildr-web` 消费产物写入既有可证明 dist 路径，且不得把前端开发依赖打进运行时 package。
- `service-asset-indexing`: Product Service registry 除 `buildr` 外 MUST 登记真实的 `buildr-web` workspace Service。

## Impact

- 影响 `projects/product/services/manifest.yml`、新建 `projects/product/services/buildr-web/`、迁出 `projects/product/services/buildr/web/`，以及 `buildr` 的构建/打包脚本与 Local App HTTP 对 dist 的消费约定。
- 不改变 Local App 产品边界、Application 写边界、session 安全模型或深链 URL。
- 非目标：独立 Git 仓、云端认证、分域 CORS、CDN、改变 session 安全模型、扩大 Local App 产品边界。
- 推进闸门：先完成 OpenSpec 文档并经确认，再授权实现；本提案阶段不创建目录、不搬代码。
