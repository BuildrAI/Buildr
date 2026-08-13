## ADDED Requirements

### Requirement: npm tarball 必须使用宿主 Node 且排除平台运行时
`@buildr-ai/buildr` npm tarball MUST 使用满足 `engines.node` 的宿主 Node 运行同一 Buildr application payload，并 MUST 完整提供 CLI 与 `buildr web`。Tarball MUST NOT 包含 Node executable、Product Node、`.app`、`.pkg`、`.msi`、平台 shortcut/Launcher、installer metadata 或平台签名材料。

#### Scenario: 检查 npm inventory
- **WHEN** verifier 对唯一 `npm pack` tarball 检查文件清单和可执行文件
- **THEN** tarball MUST 包含 runtime bundle、payload manifest、Web dist、migrations、package baseline、生产依赖与许可证
- **AND** MUST NOT 包含 Node executable、平台 Launcher、installer toolchain、`buildr-web` source、Vite toolchain、测试、fixtures、source maps 或开发依赖

#### Scenario: 在宿主 Node 安装运行
- **WHEN** tarball 安装到隔离 prefix 并由任一满足 `engines.node` 的 host Node 执行
- **THEN** `buildr --help`、代表性 CLI、`buildr web --no-open` 与 health/readiness MUST 正常
- **AND** 普通非 Web CLI MUST NOT 启动 HTTP listener

#### Scenario: 不兼容宿主 Node
- **WHEN** npm consumer 使用不满足 `engines.node` 的 Node
- **THEN** installation or launcher MUST fail closed 并报告受支持范围
- **AND** MUST NOT 下载 Product Node、切换 Workspace Node 或从 PATH 选择其他 Node 来掩盖不兼容

## MODIFIED Requirements

### Requirement: CLI 与平台 Launcher 必须共享产品身份但保持安装事实独立
Buildr MUST 让 npm CLI、正式平台产品单元和 development launcher 共享可比较的 Buildr version、protocol identity 与 `applicationPayloadDigest`，并 MUST 分别报告各渠道的安装来源、source root、runtime 来源、Product/Host/Workspace Node identity 和位置。正式平台 CLI 与 `Buildr Web` 图形入口 MUST 引用同一实际 SEA executable；来源 MUST 由 installation identity/receipt 证明，不得根据 PATH 或文件名猜测。

#### Scenario: Agent 安装 Buildr
- **WHEN** 用户要求 Agent 在受支持主机安装 Buildr
- **THEN** Agent MUST 使用 canonical 入口安装所选 npm 或平台渠道，并对平台渠道验证 CLI 与对应 Buildr Web Launcher
- **AND** MUST 分别验证命令、图形入口、Buildr/Node/protocol/payload identity 和启动能力
- **AND** 任一失败时 MUST 报告部分完成状态和恢复动作

#### Scenario: 只安装 npm CLI
- **WHEN** 调用方显式只安装 npm CLI
- **THEN** `buildr web` MUST 使用同一 tarball payload 与 host Node 启动或复用本机 Web 应用
- **AND** MUST NOT 安装或声称平台 Launcher、Product Node 或 installer 已存在

#### Scenario: 只安装平台 Launcher
- **WHEN** 普通用户安装 self-contained 平台产品单元
- **THEN** 用户 MUST 能通过图形入口运行同一 SEA 的 `web` 命令，并通过 CLI shim/PATH 运行该 SEA
- **AND** 平台安装 MUST NOT 要求 PATH 中存在 Node、npm 或另一个 `buildr`

#### Scenario: 多渠道同时存在
- **WHEN** npm CLI、正式平台安装或 development launcher 的多个版本同时存在
- **THEN** 诊断 MUST 分开展示来源、版本、路径、runtime、protocol/payload identity 和当前运行实例
- **AND** MUST NOT 仅根据 PATH、文件名或同一版本号猜测来源或合并 lifecycle

#### Scenario: 开发者准备 Buildr checkout
- **WHEN** 开发者从 Buildr Service checkout 执行 canonical 开发准备入口
- **THEN** Buildr MUST 将开发 CLI 指向当前 checkout，并安装或更新隔离的 `Buildr Web Dev` thin launcher
- **AND** MUST 通过显式 development identity 验证 CLI、source root、commit、Node 和 launcher，不得覆盖 npm 或正式平台安装

### Requirement: 已初始化 Workspace 的 Buildr 入口必须消费 Workspace Node identity
Buildr MUST 只让 Workspace-owned npm、验证、Finish adapter 和项目执行消费 `.buildr/workspace.yml` 声明的精确 Workspace Node identity。正式平台 Buildr 主进程 MUST 始终使用其 embedded Product Node；npm Buildr 主进程 MUST 始终使用启动该 package 的兼容 host Node。进入或选择 Workspace MUST NOT 隐式重启主进程、替换 `process.execPath` 或把 Workspace Node 合并为产品/宿主 runtime identity。

#### Scenario: 已声明 runtime 可用
- **WHEN** Workspace 已声明 Node 且受管 runtime 可用，平台或 npm Buildr 执行 Workspace-owned subprocess
- **THEN** subprocess resolver MUST 使用声明版本与 identity 启动 npm、verification、Finish adapter 或项目命令
- **AND** Buildr 主进程 MUST 继续报告并使用自身 Product Node 或 host Node

#### Scenario: Development thin launcher 使用已解析 runtime
- **WHEN** development identity 显式绑定的 checkout 与 compatible development host runtime probe 均通过
- **THEN** launcher MUST 使用 identity 指定的 development host executable 启动 checkout development channel
- **AND** status MUST 将 development runtime、Workspace Node、source root 与 commit 分字段展示；即使两个 Node 版本相同也不得合并 ownership，且不得把 development runtime 报告为正式 Product Node 或 Workspace Node

#### Scenario: runtime 缺失时执行恢复命令
- **WHEN** Workspace 声明存在但 runtime 缺失，命令是 `doctor` 或 `sync`
- **THEN** 平台或 npm 主进程 MAY 使用自身 Product Node/host Node 执行只读诊断或恢复编排
- **AND** bootstrap/runtime main process MUST NOT 成为新的 Workspace Node identity，恢复 MUST 按声明准备精确 Workspace Node

#### Scenario: runtime 缺失时执行普通命令
- **WHEN** Workspace 声明存在但 runtime 缺失，操作需要 Workspace-owned Node subprocess
- **THEN** 该操作 MUST fail closed 并建议 `sync`
- **AND** MUST NOT 从 PATH、Product Node 或 npm host Node 选择替代版本执行 Workspace-owned 工作

### Requirement: npm package 与 launcher 必须包含 Buildr Web 构建产物并保持三入口一致
Buildr npm package MUST 包含公共 application payload 中 Buildr Web 运行所需的正式 Web dist，并 MUST 将其纳入安装后可达且摘要校验的资源目录。该 Web dist MUST 由 `buildr-web` 的正式前端构建输出消费到 `buildr` authority 后进入唯一 payload。正式平台产品 MUST 消费同一 payload resources；development launcher MUST 使用当前 checkout 对应的已验证正式 dist。development checkout、task worktree candidate、已安装 npm package 与平台 SEA 启动 `buildr web` 时 MUST 托管行为一致的 Buildr Web shell。npm/package/platform runtime MUST NOT 要求安装环境包含 `buildr-web` 源码或 Vite toolchain。

#### Scenario: Inspect packed web dist
- **WHEN** verification inspects the unique `npm pack` tarball for Buildr Web assets
- **THEN** the package MUST include the exact payload Web dist required to serve the shell and report its `applicationPayloadDigest`
- **AND** the package MUST NOT include a platform Launcher or require a separate Vite process after install

#### Scenario: Launcher bundle includes web dist
- **WHEN** Product builds macOS or Windows platform products
- **THEN** each product MUST use the exact payload Web dist and digest reported by the npm package candidate
- **AND** launching the graphical entry MUST execute the same SEA with `web` and serve bundled resources without a development checkout

#### Scenario: Checkout and installed entry parity
- **WHEN** the same Buildr Web route is opened via development checkout CLI, installed npm package, or platform product
- **THEN** all entries MUST present the React shell with working session injection and matching protocol behavior
- **AND** MUST NOT diverge into source-tree hosting, CLI-only behavior, or a separate Launcher business implementation

#### Scenario: Package build consumes buildr-web output
- **WHEN** a maintainer or CI builds the common payload used by npm and platform consumers
- **THEN** the build MUST consume the committed `buildr` Web dist authority that originated from `buildr-web` formal output exactly once
- **AND** downstream npm pack and platform jobs MUST NOT require `projects/product/services/buildr-web` or rebuild its assets
