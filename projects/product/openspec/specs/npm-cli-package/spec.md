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
Buildr 公开 npm package MUST 使用 `@buildr-ai/buildr` identity、`buildr` executable 和指向 `https://github.com/elevenching/Buildr` 的完整 registry metadata。

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
Buildr MUST 让 npm CLI、官方平台 launcher 和开发 launcher 共享可比较的产品版本与 App protocol identity，并 MUST 分别报告各渠道真实的安装来源和位置。

#### Scenario: Agent 安装 Buildr
- **WHEN** 用户要求 Agent 在受支持的 macOS 或 Windows 主机安装 Buildr，且未明确限制安装范围
- **THEN** Agent MUST 使用 canonical 统一安装入口同时安装 CLI 与对应平台 launcher
- **AND** MUST 分别验证 `buildr` 命令、系统图标入口、版本身份和启动能力
- **AND** 任一部分失败时 MUST 报告部分完成状态和精确恢复动作

#### Scenario: 只安装 npm CLI
- **WHEN** 调用方显式选择只安装 npm CLI 作为修复或高级安装动作
- **THEN** `buildr app` MUST 可以启动或复用本机 Web 应用
- **AND** Buildr MUST NOT 声称系统 Applications、开始菜单或桌面 launcher 已安装

#### Scenario: 只安装平台 Launcher
- **WHEN** 普通用户安装携带 runtime 的平台 launcher
- **THEN** 用户 MUST 能通过图标运行 Buildr App
- **AND** launcher MUST NOT 要求或声称 PATH 中存在 `buildr` 命令

#### Scenario: 多渠道同时存在
- **WHEN** CLI、官方 launcher 或开发 launcher 的多个版本同时存在
- **THEN** Buildr 诊断 MUST 分开展示各安装来源、版本、位置和当前运行实例身份
- **AND** MUST NOT 仅根据 PATH 或文件名猜测当前 App 来源

#### Scenario: 开发者准备 Buildr checkout
- **WHEN** 开发者从 Buildr Service checkout 执行 canonical 开发准备入口
- **THEN** Buildr MUST 同时将开发 CLI 指向当前 checkout，并安装或更新隔离的 `Buildr Dev` launcher
- **AND** MUST 分别验证两个入口都来自同一 checkout identity

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
Buildr MUST 让 npm、平台 installer 和开发 launcher 工具只更新各自拥有的安装，并 MUST 在跨渠道版本不一致时提供可解释诊断。

#### Scenario: 更新 npm CLI
- **WHEN** registry 安装的 CLI 执行 `buildr update`
- **THEN** Buildr MUST 只更新同一 npm package 安装
- **AND** MUST NOT 静默覆盖平台或开发 launcher bundle

#### Scenario: 更新官方平台 Launcher
- **WHEN** 用户运行官方平台 installer 的新版本
- **THEN** installer MUST 更新正式 launcher 并保留用户级 Workspace Registry
- **AND** MUST NOT 覆盖 `Buildr Dev` 或改变 npm prefix

#### Scenario: 更新开发 Launcher
- **WHEN** 开发 checkout 执行 canonical launcher 更新入口
- **THEN** Buildr MUST 从当前 checkout 构建 development identity
- **AND** MUST 只切换 development channel 的本机安装

### Requirement: Launcher 发布产物必须接受安装生命周期验证
Buildr product Candidate MUST 验证 macOS 和 Windows launcher 的结构、identity、安装、首次启动、重复更新、回滚与卸载边界。

#### Scenario: 验证平台安装产物
- **WHEN** Product Candidate 构建 launcher 发布产物
- **THEN** verification MUST 证明 bundle 包含匹配版本的 runtime、应用依赖、Web 资源、图标和安装 metadata
- **AND** MUST 证明启动不依赖 development checkout、系统 Node 或 PATH

#### Scenario: 验证开发替换流程
- **WHEN** verification 模拟连续安装两个不同 checkout identity 的开发 launcher
- **THEN** verification MUST 证明新版本在独立 staging 通过后才替换旧版本
- **AND** MUST 证明运行中覆盖被阻止、失败可回滚且正式 launcher 保持不变

### Requirement: 已安装 package 必须包含通用验证 runtime
Buildr npm package MUST 包含 `verification run` 的 policy parser、planner、DAG scheduler、executor、resource coordinator 与 evidence lifecycle dependency closure，并 MUST 继续排除 `test/verification`；package parity MUST 在没有 Buildr 开发 checkout 的普通 Workspace 中执行代表性验证计划。

#### Scenario: Tarball CLI 执行普通 Workspace 验证
- **WHEN** Candidate 将 tarball 安装到临时 prefix，并在独立普通 Workspace 中运行 `buildr verification run`
- **THEN** 命令 MUST 完成 Project policy 解析、并发执行、资源协调和结构化结果输出
- **AND** import graph、命令 cwd 和 evidence reference MUST 不依赖开发 checkout

#### Scenario: Package inventory 遗漏验证依赖
- **WHEN** `verification run` 的任一静态 runtime dependency 未进入 tarball，或 runtime import 指向 `test/`
- **THEN** package check MUST 失败并报告缺失或越界依赖
