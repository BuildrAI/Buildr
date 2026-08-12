## ADDED Requirements

### Requirement: npm package 与 launcher 必须包含 Buildr Web 构建产物并保持三入口一致
Buildr npm package MUST 包含 Buildr Web 运行所需的 Web 构建产物，并 MUST 将其纳入安装后可达的 runtime/dependency closure 或明确可发布静态资产集。该构建产物 MUST 由 `buildr-web` 的正式前端构建输出消费而来（复制或同步到 `buildr` 内可证明的 web dist 路径）。官方/开发 launcher 构建 MUST 复制同一套可服务的 Web 构建产物。开发 checkout、task worktree 候选 CLI 与已安装 npm package / launcher 启动 `buildr web`（或等价入口）时，MUST 能够托管并打开行为一致的 Buildr Web shell。package MUST NOT 将前端开发专用依赖（例如仅用于 Vite 开发的 `buildr-web/node_modules`）作为运行 Buildr Web 的必需安装内容，也 MUST NOT 要求已安装环境包含 `buildr-web` 源码树。

#### Scenario: Inspect packed web dist
- **WHEN** verification inspects the `npm pack` file list for Buildr Web assets
- **THEN** the package MUST include the Buildr Web web build output required to serve the shell
- **AND** the package MUST NOT require a separate Vite process to open Buildr Web after install

#### Scenario: Launcher bundle includes web dist
- **WHEN** Product builds macOS or Windows launcher bundles
- **THEN** the bundle MUST include the same Buildr Web web build output used by the npm package path
- **AND** launching the app MUST serve that bundled dist over loopback without a development checkout frontend toolchain

#### Scenario: Checkout and installed entry parity
- **WHEN** the same Buildr Web route is opened via development checkout CLI and via installed package or development launcher
- **THEN** both entries MUST present the React shell with working session injection
- **AND** MUST NOT diverge into source-tree hosting on one entry and dist hosting on another

#### Scenario: Package build consumes buildr-web output
- **WHEN** a maintainer or CI builds the npm package or launcher that includes Buildr Web assets
- **THEN** the build MUST consume `buildr-web` static build output into the `buildr` web dist path used at runtime
- **AND** the packed result MUST NOT require `projects/product/services/buildr-web` to exist after install

## MODIFIED Requirements

### Requirement: CLI 与平台 Launcher 必须共享产品身份但保持安装事实独立
Buildr MUST 让 npm CLI、官方平台 launcher 和开发 launcher 共享可比较的产品版本与 App protocol identity，并 MUST 分别报告各渠道的安装来源、source root、runtime 来源和位置。

#### Scenario: Agent 安装 Buildr
- **WHEN** 用户要求 Agent 在受支持主机安装 Buildr
- **THEN** Agent MUST 使用 canonical 入口安装 CLI 与对应 launcher
- **AND** MUST 分别验证命令、图标入口、版本身份和启动能力
- **AND** 任一失败时 MUST 报告部分完成状态和恢复动作

#### Scenario: 只安装 npm CLI
- **WHEN** 调用方显式只安装 npm CLI
- **THEN** `buildr web` MUST 可以启动或复用本机 Web 应用
- **AND** MUST NOT 声称平台 launcher 已安装

#### Scenario: 只安装平台 Launcher
- **WHEN** 普通用户安装携带 runtime 的 release launcher
- **THEN** 用户 MUST 能通过图标运行 Buildr Web
- **AND** release launcher MUST NOT 要求 PATH 中存在 `buildr`

#### Scenario: 多渠道同时存在
- **WHEN** CLI、官方 launcher 或开发 launcher 的多个版本同时存在
- **THEN** 诊断 MUST 分开展示来源、版本、位置和运行实例身份
- **AND** MUST NOT 仅根据 PATH 或文件名猜测 App 来源

#### Scenario: 开发者准备 Buildr checkout
- **WHEN** 开发者从 Buildr Service checkout 执行 canonical 开发准备入口
- **THEN** Buildr MUST 将开发 CLI 指向当前 checkout，并安装或更新隔离的 `Buildr Web Dev` thin launcher
- **AND** MUST 验证 CLI、source root、Node 和 launcher identity 来自同一 runtime 选择

### Requirement: 各安装渠道必须拥有明确的更新责任
Buildr MUST 让 npm、平台 installer 和开发 launcher 工具只更新各自拥有的安装，并 MUST 在版本、source root 或 runtime identity 不一致时提供可解释诊断。

#### Scenario: 更新 npm CLI
- **WHEN** registry CLI 执行 `buildr update`
- **THEN** Buildr MUST 只更新同一 npm package
- **AND** MUST NOT 静默覆盖平台或开发 launcher

#### Scenario: 更新官方平台 Launcher
- **WHEN** 用户运行官方 installer 新版本
- **THEN** installer MUST 更新正式 self-contained launcher 并保留 Workspace Registry
- **AND** MUST NOT 覆盖 `Buildr Web Dev` 或 npm prefix

#### Scenario: 更新开发 Launcher
- **WHEN** 开发 checkout 执行 canonical launcher 更新入口
- **THEN** Buildr MUST 从当前 checkout 构建 development thin identity，绑定 source root 与受管 Node executable
- **AND** MUST 只切换 development channel

### Requirement: Launcher 发布产物必须接受安装生命周期验证
Buildr product Candidate MUST 验证 macOS 和 Windows launcher 的结构、identity、安装、首次启动、更新、回滚与卸载；Release MUST self-contained，Development MUST checkout-backed。

#### Scenario: 验证平台安装产物
- **WHEN** Product Candidate 构建 release launcher
- **THEN** verification MUST 证明 bundle 包含匹配版本的 Node runtime、应用依赖、Web 资源、图标和 metadata
- **AND** MUST 证明启动不依赖 development checkout、系统 Node 或 PATH

#### Scenario: 验证开发 thin launcher
- **WHEN** Product Candidate 构建 development launcher
- **THEN** verification MUST 证明 bundle 不包含 Node runtime、Buildr source snapshot 或 `node_modules`
- **AND** MUST 证明 identity 指向 source root、checkout 和受管 Node，并能启动该 checkout 的 Buildr Web

#### Scenario: 验证开发替换流程
- **WHEN** verification 连续安装两个不同 checkout identity 的 development launcher
- **THEN** verification MUST 证明新版本在 staging 通过后才替换旧版本
- **AND** MUST 证明运行中覆盖被阻止、失败可回滚且正式 launcher 不变

### Requirement: 已安装 package 必须包含通用验证 runtime
Buildr npm package MUST 包含 Project v2 declaration parser、显式 capability execution、process executor、被真实 claim 使用的 resource coordinator、transient evidence lifecycle、Task Verification domain/repository/Application/CLI 与 Buildr Web server dependency closure，并 MUST 继续排除 `test/verification`。Package parity MUST 在没有 Buildr 开发 checkout 的普通 Workspace 中执行代表性 command capability、记录 current Result 并 inspect applicability。

#### Scenario: Tarball CLI 执行普通 Workspace 验证
- **WHEN** Candidate 将 tarball 安装到临时 prefix，并在独立普通 Workspace 中运行 `buildr verification run --project <code> --capability <id> --target-identity <identity>`
- **THEN** 命令 MUST 完成 Project v2 declaration 解析、command execution、真实 timing、可选资源协调和 transient summary 输出
- **AND** import graph、命令 cwd 和 evidence reference MUST 不依赖开发 checkout

#### Scenario: Tarball CLI 管理 Task current Result
- **WHEN** 普通 Workspace 具有 active Task 且 installed CLI 调用 `task verification record|inspect`
- **THEN** installed CLI MUST 与 checkout CLI 生成相同 Result bytes、operation JSON 和 applicability
- **AND** Result persistence MUST 不依赖 `test/`、Product registry 特例或开发 checkout

#### Scenario: Package inventory 遗漏验证依赖
- **WHEN** execution 或 Result Application 的任一静态 runtime dependency 未进入 tarball，或 runtime import 指向 `test/`
- **THEN** package check MUST 失败并报告缺失或越界依赖

## REMOVED Requirements

### Requirement: npm package 与 launcher 必须包含 Local App Web 构建产物并保持三入口一致
Buildr npm package MUST 包含 Local App 运行所需的 Web 构建产物，并 MUST 将其纳入安装后可达的 runtime/dependency closure 或明确可发布静态资产集。该构建产物 MUST 由 `buildr-web` 的正式前端构建输出消费而来（复制或同步到 `buildr` 内可证明的 web dist 路径）。官方/开发 launcher 构建 MUST 复制同一套可服务的 Web 构建产物。开发 checkout、task worktree 候选 CLI 与已安装 npm package / launcher 启动 `buildr app`（或等价入口）时，MUST 能够托管并打开行为一致的 Local App shell。package MUST NOT 将前端开发专用依赖（例如仅用于 Vite 开发的 `buildr-web/node_modules`）作为运行 Local App 的必需安装内容，也 MUST NOT 要求已安装环境包含 `buildr-web` 源码树。

#### Scenario: Inspect packed web dist
- **WHEN** verification inspects the `npm pack` file list for Local App assets
- **THEN** the package MUST include the Local App web build output required to serve the shell
- **AND** the package MUST NOT require a separate Vite process to open Local App after install

#### Scenario: Launcher bundle includes web dist
- **WHEN** Product builds macOS or Windows launcher bundles
- **THEN** the bundle MUST include the same Local App web build output used by the npm package path
- **AND** launching the app MUST serve that bundled dist over loopback without a development checkout frontend toolchain

#### Scenario: Checkout and installed entry parity
- **WHEN** the same Local App route is opened via development checkout CLI and via installed package or development launcher
- **THEN** both entries MUST present the React shell with working session injection
- **AND** MUST NOT diverge into source-tree hosting on one entry and dist hosting on another

#### Scenario: Package build consumes buildr-web output
- **WHEN** a maintainer or CI builds the npm package or launcher that includes Local App assets
- **THEN** the build MUST consume `buildr-web` static build output into the `buildr` web dist path used at runtime
- **AND** the packed result MUST NOT require `projects/product/services/buildr-web` to exist after install
