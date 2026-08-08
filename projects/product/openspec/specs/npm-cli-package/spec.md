# npm CLI package 规范

## Purpose

定义 Buildr CLI 作为 npm package 本地打包、安装和验证的行为，确保用户不依赖开发 checkout 也能通过安装后的 `buildr` 命令完成 Buildr workspace onboarding。
## Requirements

### Requirement: npm tarball exposes buildr command
Buildr MUST 在 Product root 下提供 npm package metadata，使维护者能够创建以 `bin/buildr.mjs` 暴露 `buildr` executable command 的本地 npm tarball。

#### Scenario: Build local tarball
- **WHEN** a maintainer runs `npm pack` from the Buildr product root
- **THEN** npm MUST create a tarball for the Buildr CLI package
- **AND** the tarball MUST declare `buildr` bin as `bin/buildr.mjs`
- **AND** the bin MUST delegate to the packaged `src/interfaces/cli` implementation

#### Scenario: Install tarball locally
- **WHEN** a user installs the tarball with `npm install -g ./<tarball>` or an equivalent temporary `--prefix`
- **THEN** the installed environment MUST provide an executable `buildr` command
- **AND** the executable MUST NOT require `tools/`, `test/` or `scripts/`

### Requirement: installed CLI uses package assets
已安装的 `buildr` command MUST 使用 npm package 中包含的 assets，而不是要求访问 development checkout。

#### Scenario: Initialize workspace from installed command
- **WHEN** the installed `buildr` command runs `buildr init --target <dir> --name <name> --profile <profile>`
- **THEN** Buildr MUST create the default workspace baseline from the package assets
- **AND** the workspace MUST NOT require files outside the installed npm package

#### Scenario: Complete onboarding from installed command
- **WHEN** the installed `buildr` command runs `buildr init --agent <agent> --target <dir> --name <name> --profile <profile>`
- **THEN** Buildr MUST create the workspace baseline, install the product Buildr Skill, reconcile the selected Agent runtime, and run final doctor using only packaged assets
- **AND** the command MUST behave consistently with the checkout-based CLI for the same inputs

#### Scenario: Run onboarding commands from installed command
- **WHEN** the installed `buildr` command runs `project create`, `service create`, `doctor`, `sync`, `runtime check`, `rules render`, `skills render`, `package check`, and `bootstrap guide`
- **THEN** each command MUST behave consistently with the checkout-based CLI for the same inputs

### Requirement: npm package excludes private workspace assets
Buildr npm package MUST 仅包含已安装命令所需的 `bin/`、产品 `src/` runtime、明确可发布的文档和 `package/` 交付资产，并 MUST 排除仓库测试、维护脚本、active changes 和私有 Workspace 内容。

#### Scenario: Inspect packed file list
- **WHEN** verification inspects the `npm pack --json` file list
- **THEN** the package MUST include package metadata、`bin/buildr.mjs`、安装后可达的 `src/` dependency closure、package assets 和 publishable docs
- **AND** the package MUST NOT include `test/`、`scripts/`、`tools/`、active OpenSpec changes、private business projects、root workspace rules、local runtime directories or service repositories

#### Scenario: Product verifier belongs to installed runtime
- **WHEN** `buildr package check` or another installed command requires a verifier
- **THEN** that verifier MUST be owned by `src/` and included in the runtime dependency closure
- **AND** package metadata MUST NOT include `test/verification/` merely to satisfy an installed command dependency

### Requirement: npm runtime inventory 必须与源码生命周期边界一致
Buildr package inventory MUST 从静态入口和 import graph证明安装后命令的完整依赖闭包，并 MUST 将 checkout-only tests、verification orchestration 和 maintenance scripts 排除在 runtime inventory 之外。

#### Scenario: Verify candidate tarball inventory
- **WHEN** Candidate 构建 npm tarball
- **THEN** verifier MUST 证明每个 `bin` 和 `src` runtime dependency 已包含
- **AND** verifier MUST 证明 `test/`、`scripts/` 和旧 `tools/` 未包含
- **AND** package parity MUST 在无 development checkout 的临时目录执行代表性命令

### Requirement: product verification covers npm installation
Buildr product verification MUST 测试从 product root 开始的 npm package installation path，并证明安装后的单命令 onboarding 可用。

#### Scenario: Verify installed package
- **WHEN** standalone release smoke 或完整 Candidate verification 从 Buildr product root 验证正式 tarball 生命周期
- **THEN** release smoke MUST pack Buildr npm package 或复用该次 Candidate 提供的不可变 tarball，安装到临时 prefix，并执行安装后的 `buildr` command
- **AND** release smoke MUST 使用 `buildr init --agent <agent>`、独立 `sync` 和 `doctor --json` 证明核心 onboarding loop 与最终 runtime 状态有效
- **AND** Workspace E2E MUST NOT 重复持有 tarball inventory 或安装后 lifecycle

### Requirement: npm package 具备公开发布基线 metadata
Buildr npm package MUST 声明非占位版本、开源 License、可执行 bin、Node engine 和运行依赖，并且 MUST NOT 使用阻止打包发布的 private 状态。

#### Scenario: 检查公开 package metadata
- **WHEN** 维护者从 product root 运行 `npm pack --dry-run --json`
- **THEN** package identity MUST 使用非 `0.0.0` 的语义版本
- **AND** package metadata MUST 声明开源 License
- **AND** package MUST 允许公开打包
- **AND** tarball MUST 包含 License、CLI runtime modules 和 package assets

#### Scenario: npm package 安装后由 Agent 使用
- **WHEN** Agent 安装本地 tarball 或后续公开 registry package
- **THEN** 已安装的 `buildr` MUST 能列出 runtime，并用 `buildr init --agent <agent>` 完成 workspace 初始化、runtime reconcile 与最终 doctor
- **AND** 已安装 package MUST 继续支持独立 `sync <agent>` 和 `doctor --agent <agent> --json` 维护已有 workspace
- **AND** 已安装 package MUST NOT 依赖 development checkout 或仓库级验证脚本

### Requirement: registry package 支持 CLI 自更新
从支持的 npm registry 安装的 Buildr package MUST 支持 `buildr update` 检查和更新同一 package identity，且不得隐式维护 workspace。

#### Scenario: 检查 registry 更新
- **WHEN** registry 安装的 CLI 运行 `buildr update check --json`
- **THEN** Buildr MUST 查询当前配置 registry 中同一 package identity 的可用版本
- **AND** Buildr MUST NOT 修改 package、workspace 或 Agent runtime

#### Scenario: 更新 registry package
- **WHEN** registry 安装的 CLI 运行 `buildr update` 且存在可安全安装的新版本
- **THEN** Buildr MUST 更新承载当前 executable 的 package
- **AND** Buildr MUST 保持安装 prefix、registry、scope 和 tag
- **AND** Buildr MUST NOT 执行 workspace sync 或 doctor

#### Scenario: registry update 回归验证
- **WHEN** 产品验证构造包含旧版与新版 Buildr package 的临时 registry 或等价隔离 fixture
- **THEN** verifier MUST 证明旧版 installed executable 能检查并更新到新版
- **AND** verifier MUST 证明更新动作没有修改测试 workspace，后续显式 sync 才完成 workspace reconcile

### Requirement: 公开 registry package identity 必须稳定
Buildr 公开 npm package MUST 使用 `@buildr-ai/buildr` identity、`buildr` executable 和指向 `https://github.com/BuildrAI/Buildr` 的完整 registry metadata。

#### Scenario: 检查准备发布的 package
- **WHEN** 维护者运行 package check 或 `npm pack --json`
- **THEN** package name MUST 是 `@buildr-ai/buildr`
- **AND** repository、homepage 和 bugs MUST 指向 canonical GitHub repository
- **AND** `publishConfig.access` MUST 是 `public`
- **AND** package MUST 声明用于发现 CLI、Agent workspace 和开发工具的 keywords

### Requirement: npm 版本必须映射明确 dist-tag
Buildr release automation MUST 将 prerelease 版本发布到 `next`，将稳定版本发布到 `latest`，并 MUST 拒绝 tag 与 package version 不一致的候选。

#### Scenario: 发布 0.1.0 RC
- **WHEN** package version 是 `0.1.0-rc.1` 且 Git tag 是 `v0.1.0-rc.1`
- **THEN** release automation MUST 选择 npm dist-tag `next`

#### Scenario: 发布 0.1.0 正式版
- **WHEN** package version 是 `0.1.0` 且 Git tag 是 `v0.1.0`
- **THEN** release automation MUST 选择 npm dist-tag `latest`

#### Scenario: tag 与 package version 不一致
- **WHEN** release tag 去除 `v` 后不等于 `package.json#version`
- **THEN** release automation MUST 在 npm publish 前失败

### Requirement: 开发 checkout 必须从 Buildr Service package root 运行并保留 Project bridge
Buildr MUST 将 `projects/product/services/buildr` 作为 development checkout 的 npm package root，并 MUST 保留 `projects/product/buildr` 作为稳定兼容入口；source discovery、安装、自更新和诊断必须识别二者属于同一 Product checkout。Project bridge MUST 使用满足 package `engines.node` 的 Node 启动 Service CLI，并在当前环境没有兼容 Node 时返回可操作诊断。

#### Scenario: 从 Service package root 打包
- **WHEN** 维护者从 `projects/product/services/buildr` 运行 `npm pack`
- **THEN** tarball MUST 使用既有 `@buildr-ai/buildr` identity 和 `bin/buildr.mjs`
- **AND** package inventory MUST 只包含 Service root 内声明的发布文件

#### Scenario: 从 Project bridge 启动开发 CLI
- **WHEN** 用户运行 `projects/product/buildr <command>`，且 PATH 或当前 Agent runtime 提供满足 `engines.node` 的 Node
- **THEN** bridge MUST 自动选择兼容 Node 并从 `projects/product/services/buildr` 启动 CLI
- **AND** CLI MUST 从该 Service root 解析 package identity、runtime dependencies 和交付资产
- **AND** 输出的 development checkout source MUST 关联当前 workspace 和 Product Service

#### Scenario: 显式选择开发 Node
- **WHEN** 用户通过 `BUILDR_NODE` 指定可执行且满足 `engines.node` 的 Node
- **THEN** Project bridge MUST 优先使用该 Node 启动 Service CLI
- **AND** 不得被 PATH 中更早出现的不兼容 Node 覆盖

#### Scenario: 当前环境没有兼容 Node
- **WHEN** `BUILDR_NODE`、PATH 和当前 Agent runtime 可发现位置都没有满足 `engines.node` 的 Node
- **THEN** Project bridge MUST 以非零状态退出
- **AND** 诊断 MUST 说明最低 Node 版本并给出设置 `BUILDR_NODE` 或调整 PATH 的恢复动作
- **AND** MUST NOT 暴露由不兼容 Node 解析 ESM 产生的语法错误作为首要诊断

#### Scenario: 安装本机开发入口
- **WHEN** 维护者运行 Buildr Service 的 `scripts/install-buildr-cli`
- **THEN** 安装链接 MUST 指向 Service `bin/buildr.mjs`
- **AND** 冲突检查 MUST 识别旧 Project package root 与新 Service package root 的 Buildr-managed identity

### Requirement: CLI 与平台 Launcher 必须共享产品身份但保持安装事实独立
Buildr MUST 让 npm CLI、官方平台 launcher 和开发 launcher 共享可比较的产品版本与 App protocol identity，并 MUST 分别报告各渠道的安装来源、source root、runtime 来源和位置。

#### Scenario: Agent 安装 Buildr
- **WHEN** 用户要求 Agent 在受支持主机安装 Buildr
- **THEN** Agent MUST 使用 canonical 入口安装 CLI 与对应 launcher
- **AND** MUST 分别验证命令、图标入口、版本身份和启动能力
- **AND** 任一失败时 MUST 报告部分完成状态和恢复动作

#### Scenario: 只安装 npm CLI
- **WHEN** 调用方显式只安装 npm CLI
- **THEN** `buildr app` MUST 可以启动或复用本机 Web 应用
- **AND** MUST NOT 声称平台 launcher 已安装

#### Scenario: 只安装平台 Launcher
- **WHEN** 普通用户安装携带 runtime 的 release launcher
- **THEN** 用户 MUST 能通过图标运行 Buildr App
- **AND** release launcher MUST NOT 要求 PATH 中存在 `buildr`

#### Scenario: 多渠道同时存在
- **WHEN** CLI、官方 launcher 或开发 launcher 的多个版本同时存在
- **THEN** 诊断 MUST 分开展示来源、版本、位置和运行实例身份
- **AND** MUST NOT 仅根据 PATH 或文件名猜测 App 来源

#### Scenario: 开发者准备 Buildr checkout
- **WHEN** 开发者从 Buildr Service checkout 执行 canonical 开发准备入口
- **THEN** Buildr MUST 将开发 CLI 指向当前 checkout，并安装或更新隔离的 `Buildr Dev` thin launcher
- **AND** MUST 验证 CLI、source root、Node 和 launcher identity 来自同一 runtime 选择

### Requirement: Buildr Skill 必须由目标 Workspace 生命周期投射
Buildr 全局安装 MUST NOT 猜测 Agent runtime destination 或安装 Buildr Skill；Buildr Skill MUST 由目标 Workspace 的 `init`、`sync` 或 `render` 生命周期管理。

#### Scenario: 全局安装尚无 Workspace
- **WHEN** canonical 安装入口完成 CLI 与 launcher 安装，但用户尚未选择目标 Workspace 和 Agent
- **THEN** Buildr MUST NOT 修改任意 Agent runtime Skill 目录
- **AND** MUST 引导用户选择、登记或初始化 Workspace

#### Scenario: 初始化目标 Workspace
- **WHEN** Agent 执行 `buildr init --agent <agent>` 初始化目标 Workspace
- **THEN** Buildr MUST 安装 Workspace 源资产并将 Buildr Skill 首次投射到指定 Agent runtime
- **AND** 最终 doctor MUST 验证投射状态

#### Scenario: 收敛已有 Workspace runtime
- **WHEN** Agent 对已有 Workspace 执行 `buildr sync <agent>` 或 `buildr render <agent>`
- **THEN** Buildr MUST 从该 Workspace 的受管源资产更新或重建指定 Agent runtime
- **AND** 全局 CLI 与 launcher 安装状态 MUST NOT 被该动作隐式改变

### Requirement: 各安装渠道必须拥有明确的更新责任
Buildr MUST 让 npm、平台 installer 和开发 launcher 工具只更新各自拥有的安装，并 MUST 在版本、source root 或 runtime identity 不一致时提供可解释诊断。

#### Scenario: 更新 npm CLI
- **WHEN** registry CLI 执行 `buildr update`
- **THEN** Buildr MUST 只更新同一 npm package
- **AND** MUST NOT 静默覆盖平台或开发 launcher

#### Scenario: 更新官方平台 Launcher
- **WHEN** 用户运行官方 installer 新版本
- **THEN** installer MUST 更新正式 self-contained launcher 并保留 Workspace Registry
- **AND** MUST NOT 覆盖 `Buildr Dev` 或 npm prefix

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
- **AND** MUST 证明 identity 指向 source root、checkout 和受管 Node，并能启动该 checkout 的 Local App

#### Scenario: 验证开发替换流程
- **WHEN** verification 连续安装两个不同 checkout identity 的 development launcher
- **THEN** verification MUST 证明新版本在 staging 通过后才替换旧版本
- **AND** MUST 证明运行中覆盖被阻止、失败可回滚且正式 launcher 不变

### Requirement: 已安装 package 必须包含通用验证 runtime
Buildr npm package MUST 包含 Project v2 declaration parser、显式 capability execution、process executor、被真实 claim 使用的 resource coordinator、transient evidence lifecycle、Task Verification domain/repository/Application/CLI 与 Local App server dependency closure，并 MUST 继续排除 `test/verification`。Package parity MUST 在没有 Buildr 开发 checkout 的普通 Workspace 中执行代表性 command capability、记录 current Result 并 inspect applicability。

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

### Requirement: 已初始化 Workspace 的 Buildr 入口必须消费 Workspace Node identity
Buildr development/installed launcher MUST 在普通 Workspace 命令前解析 Workspace Node 声明并使用对应受管 executable。PATH Node MUST NOT 覆盖已确定 identity；`engines.node` 继续约束无 Workspace context 的 npm 入口。

#### Scenario: 已声明 runtime 可用
- **WHEN** Workspace 已声明 Node 且受管 runtime 可用
- **THEN** launcher MUST 使用声明版本启动 CLI
- **AND** MUST NOT 选择 PATH 中其他版本

#### Scenario: Development thin launcher 使用已解析 runtime
- **WHEN** development identity 绑定的 checkout 具有有效 Workspace Node 声明且 runtime probe 通过
- **THEN** launcher MUST 使用 identity 指定 executable 启动 checkout CLI
- **AND** MUST 将 Node version、runtime path 和 Workspace Node identity 暴露给 status/失败诊断

#### Scenario: runtime 缺失时执行恢复命令
- **WHEN** Workspace 声明存在但 runtime 缺失，命令是 `doctor` 或 `sync`
- **THEN** launcher MAY 使用满足 `engines.node` 的 bootstrap Node 执行诊断或恢复
- **AND** bootstrap Node MUST NOT 成为新的 Workspace identity

#### Scenario: runtime 缺失时执行普通命令
- **WHEN** Workspace 声明存在但 runtime 缺失，命令不是 recovery command
- **THEN** launcher MUST fail closed 并建议 `sync`
- **AND** MUST NOT 从 PATH 选择另一个 Node

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
