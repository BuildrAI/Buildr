## ADDED Requirements

### Requirement: npm package 与 launcher 必须包含 Local App Web 构建产物并保持三入口一致
Buildr npm package MUST 包含 Local App 运行所需的 Web 构建产物，并 MUST 将其纳入安装后可达的 runtime/dependency closure 或明确可发布静态资产集。官方/开发 launcher 构建 MUST 复制同一套可服务的 Web 构建产物。开发 checkout、task worktree 候选 CLI 与已安装 npm package / launcher 启动 `buildr app`（或等价入口）时，MUST 能够托管并打开行为一致的 Local App shell。package MUST NOT 将前端开发专用依赖（例如仅用于 Vite 开发的 `web/node_modules`）作为运行 Local App 的必需安装内容。

#### Scenario: Inspect packed web dist
- **WHEN** verification inspects the `npm pack` file list for Local App assets
- **THEN** the package MUST include the Local App web build output required to serve the shell
- **AND** the package MUST NOT require a separate Vite process to open Local App after install

#### Scenario: Launcher bundle includes web dist
- **WHEN** Product builds macOS or Windows launcher bundles
- **THEN** the bundle MUST include the same Local App web build output used by the npm package path
- **AND** launching the app MUST serve that bundled dist over loopback without a development checkout `web/` toolchain

#### Scenario: Checkout and installed entry parity
- **WHEN** the same Local App route is opened via development checkout CLI and via installed package or development launcher
- **THEN** both entries MUST present the React shell with working session injection
- **AND** MUST NOT diverge into vanilla-source hosting on one entry and dist hosting on another after migration completes
