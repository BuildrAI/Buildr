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
从支持的 npm registry 安装的 Buildr package MUST 支持 `buildr update check` 同时检查 `latest` 与 `next`，并支持 `buildr update --track stable|candidate` 更新同一 package identity；所有动作不得隐式维护 Workspace。

#### Scenario: 检查 registry 更新
- **WHEN** registry 安装的 CLI 运行 `buildr update check --json`
- **THEN** Buildr MUST 通过现有 npm update authority 一次查询同一 package identity 的 `dist-tags.latest` 与 `dist-tags.next`
- **AND** Buildr MUST NOT 修改 package、Workspace 或 Agent runtime

#### Scenario: 更新 registry package
- **WHEN** registry 安装的 CLI 运行 `buildr update --track stable|candidate` 且所选轨道存在可安全安装的新版本
- **THEN** Buildr MUST 更新承载当前 executable 的 package到本次观测的精确版本
- **AND** Buildr MUST 保持安装 prefix、registry 与 scope
- **AND** Buildr MUST NOT 执行 workspace sync 或 doctor

#### Scenario: registry update 回归验证
- **WHEN** 产品验证构造包含 GA 与 RC 版本的临时 registry 或等价隔离 fixture
- **THEN** verifier MUST 证明 installed executable 能同时检查两个轨道并分别更新到用户选择的精确版本
- **AND** verifier MUST 证明更新动作没有修改测试 Workspace，后续显式 sync 才完成 Workspace reconcile

### Requirement: 公开 registry package identity 必须稳定
Buildr 公开 npm package MUST 使用 `@buildr-ai/buildr` identity、`buildr` executable 和指向 `https://github.com/BuildrAI/Buildr` 的完整 registry metadata。

#### Scenario: 检查准备发布的 package
- **WHEN** 维护者运行 package check 或 `npm pack --json`
- **THEN** package name MUST 是 `@buildr-ai/buildr`
- **AND** repository、homepage 和 bugs MUST 指向 canonical GitHub repository
- **AND** `publishConfig.access` MUST 是 `public`
- **AND** package MUST 声明用于发现 CLI、Agent workspace 和开发工具的 keywords

### Requirement: npm 版本必须映射明确 dist-tag
Buildr release automation MUST 将 prerelease 版本发布到 `next`，将稳定版本发布到 `latest`，并 MUST 拒绝 tag 与 package version 不一致或版本类型与目标 dist-tag 不一致的候选。

#### Scenario: 发布 0.1.0 RC
- **WHEN** package version 是 `0.1.0-rc.1` 且 Git tag 是 `v0.1.0-rc.1`
- **THEN** release automation MUST 选择 npm dist-tag `next`

#### Scenario: 发布 0.1.0 正式版
- **WHEN** package version 是 `0.1.0` 且 Git tag 是 `v0.1.0`
- **THEN** release automation MUST 选择 npm dist-tag `latest`

#### Scenario: tag 与 package version 不一致
- **WHEN** release tag 去除 `v` 后不等于 `package.json#version`
- **THEN** release automation MUST 在 npm publish 前失败

#### Scenario: dist-tag 版本类型不匹配
- **WHEN** 稳定版本准备发布到 `next` 或 prerelease 准备发布到 `latest`
- **THEN** release automation MUST在公开 mutation 前失败

### Requirement: 开发 checkout 必须从 Buildr Service package root 运行并保留 Project bridge
Buildr MUST 将 `projects/product/services/buildr` 作为 development checkout 的 npm package root，并 MUST 保留 `projects/product/buildr` 作为稳定且唯一的 checkout 开发 CLI 入口；source discovery、诊断和 self-bootstrap 必须识别二者属于同一 Product checkout。Project bridge MUST只使用Product checkout声明的精确开发Node启动Service CLI；package `engines.node`继续只表达npm正式安装的Host Node兼容范围。机器默认PATH中的`buildr` MUST保留给npm installation，canonical development preparation、self-bootstrap和release preparation MUST NOT创建、覆盖或要求该入口绑定development checkout。

#### Scenario: 从 Service package root 打包
- **WHEN** 维护者从 `projects/product/services/buildr` 运行 `npm pack`
- **THEN** tarball MUST 使用既有 `@buildr-ai/buildr` identity 和 `bin/buildr.mjs`
- **AND** package inventory MUST 只包含 Service root 内声明的发布文件

#### Scenario: 从 Project bridge 启动开发 CLI
- **WHEN** 用户运行 `projects/product/buildr <command>`，且`BUILDR_NODE`或受控PATH候选提供Product声明的精确开发Node
- **THEN** bridge MUST使用该精确Node并从`projects/product/services/buildr`启动CLI
- **AND** CLI MUST 从该 Service root 解析 package identity、runtime dependencies 和交付资产
- **AND** 输出的 development checkout source MUST 关联当前 workspace 和 Product Service

#### Scenario: 显式选择开发 Node
- **WHEN** 用户通过 `BUILDR_NODE` 指定可执行Node
- **THEN** Project bridge MUST只在其版本精确等于Product声明时启动Service CLI
- **AND** 不兼容或仅满足`engines.node`但版本不精确的override MUST fail closed

#### Scenario: 当前环境没有兼容 Node
- **WHEN** `BUILDR_NODE`、PATH和当前Agent runtime可发现位置都没有Product声明的精确Node
- **THEN** Project bridge MUST 以非零状态退出
- **AND** 诊断 MUST 说明精确版本并给出设置 `BUILDR_NODE` 或调整 PATH 的恢复动作
- **AND** MUST NOT选择另一个兼容版本或暴露由不兼容Node解析ESM产生的语法错误作为首要诊断

#### Scenario: 安装本机开发入口
- **WHEN** 维护者运行 canonical development preparation、self-bootstrap 或 release preparation
- **THEN** Buildr MUST通过当前retained checkout的`projects/product/buildr`与同一精确开发Node执行命令
- **AND** MUST NOT创建、覆盖、删除或要求PATH中的默认`buildr`指向development checkout

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

### Requirement: npm tarball 必须使用宿主 Node 且排除平台运行时
`@buildr-ai/buildr` npm tarball MUST 使用满足 `engines.node` 的宿主 Node 运行完整 Buildr application payload，并 MUST 提供 CLI、`buildr web` 与本地 Launcher 管理能力。Tarball MUST NOT 包含 Node executable、Product Node、SEA、已生成 `.app`、`.pkg`、`.msi`、shortcut、installer metadata 或平台签名材料。

#### Scenario: 检查 npm inventory
- **WHEN** verifier 对唯一 `npm pack` tarball 检查文件清单和可执行文件
- **THEN** tarball MUST 包含 runtime bundle、payload manifest、Web dist、migrations、package baseline、Launcher 管理代码、生产依赖与许可证
- **AND** MUST NOT 包含 Node executable、已生成 Launcher、installer toolchain、`buildr-web` source、Vite toolchain、测试、fixtures、source maps 或开发依赖

#### Scenario: 在宿主 Node 安装运行
- **WHEN** tarball 安装到隔离 prefix 并由任一满足 `engines.node` 的 Host Node 执行
- **THEN** `buildr --help`、代表性 CLI、`buildr web --no-open`、health/readiness 与显式 Launcher lifecycle MUST 正常
- **AND** 普通非 Web CLI 与普通 npm install MUST NOT 启动 HTTP listener 或创建图形入口

#### Scenario: 不兼容宿主 Node
- **WHEN** npm consumer 使用不满足 `engines.node` 的 Node
- **THEN** installation 或 Launcher MUST fail closed并报告受支持范围
- **AND** MUST NOT下载Product Node或从PATH选择其他Node掩盖不兼容

### Requirement: npm CLI 与本机 Launcher 必须共享安装身份
Buildr MUST 将 npm package 作为唯一正式产品 installation，并 MUST 让 CLI 与本地图形 Launcher 共享同一 npm installation identity、Buildr version、protocol identity、`applicationPayloadDigest`、Host Node executable、package entry 和 npm prefix。Launcher MUST 是可重建投射，不得成为平台 installation、复制 payload 或建立独立更新事实；来源 MUST 由 formal npm origin、payload binding 与 ownership receipt 证明，不得根据 PATH 或文件名猜测。Development checkout MUST只拥有显式 Project bridge 与隔离的 `Buildr Web Dev` Launcher，不得创建第二个机器默认 CLI installation。

#### Scenario: 安装 npm Buildr
- **WHEN** 用户通过 npm 安装 `@buildr-ai/buildr`
- **THEN** 用户 MUST 能运行完整 CLI 与 `buildr web`
- **AND** 普通安装 MUST NOT 自动创建 Applications、Start Menu、SEA、Product Node 或 installer

#### Scenario: 显式安装图形 Launcher
- **WHEN** 用户从可验证 npm installation 执行 `buildr web launcher install`
- **THEN** Buildr MUST 创建只引用同一 Host Node 与 package entry 的本机 Launcher，并将公开动作固定为 `web`
- **AND** Launcher MUST NOT 复制 Node、Buildr package、源码、payload 或 `node_modules`

#### Scenario: 多个 npm installation 同时存在
- **WHEN** 不同 prefix 或 Host Node 的多个 npm Buildr 同时登记
- **THEN** status MUST 分别展示 installation 与 Launcher ownership identity、version、path、runtime、protocol/payload identity
- **AND** 同一版本或 executable 文件名相同 MUST NOT 导致 lifecycle 合并或 target 覆盖

#### Scenario: 开发者准备 Buildr checkout
- **WHEN** 开发者从 Buildr Service checkout 执行 `npm run install:development`
- **THEN** Buildr MUST只将 `Buildr Web Dev` 绑定当前 checkout 和 development runtime
- **AND** MUST NOT创建或覆盖默认 PATH CLI、npm installation 或 npm-owned `Buildr Web` Launcher

### Requirement: npm 与 development 安装必须拥有明确更新责任
Buildr MUST 让 npm 与 development 只更新各自拥有的 installation，并 MUST 在版本、source root、Host Node、package entry、prefix 或 ownership identity 不一致时提供可解释诊断。当前产品 MUST NOT 声明 platform installer 更新渠道。

#### Scenario: 更新 npm CLI 与已安装 Launcher
- **WHEN** registry CLI 成功更新相同 prefix 的 `@buildr-ai/buildr`
- **THEN** Buildr MUST 只更新该 npm package，并对已存在且 ownership 匹配的 Launcher 原子刷新 binding
- **AND** 从未显式安装 Launcher 时 MUST 保持零桌面副作用

#### Scenario: 更新开发 Launcher
- **WHEN** 开发 checkout 执行 canonical launcher 更新入口
- **THEN** Buildr MUST 只切换 development channel 的 checkout/runtime identity
- **AND** MUST NOT 修改 npm prefix 或 npm-owned Launcher

### Requirement: npm Launcher 投射必须接受生命周期验证
Buildr Product Candidate MUST 验证 npm-owned macOS 与 Windows Launcher 的 binding、结构、显式安装、启动、更新刷新、漂移阻断、repair 与 ownership-safe uninstall。Launcher MUST 使用已登记 npm Buildr，MUST NOT self-contained 或依赖 development checkout。

#### Scenario: 验证 macOS 本机 Launcher
- **WHEN** Candidate 从隔离 npm prefix 显式安装 `Buildr Web.app`
- **THEN** verification MUST 证明 Bundle 不含 Node、Buildr package、payload 或独立 runtime，并只使用 absolute Host Node 与 package entry 启动 `web`
- **AND** 普通 npm install MUST NOT 创建该 Bundle

#### Scenario: 验证 Windows 本机 Launcher
- **WHEN** Candidate 从隔离 npm prefix 显式安装 Start Menu `Buildr Web` shortcut
- **THEN** verification MUST 证明 shortcut target/arguments 精确绑定 Host Node、package entry 与 `web`
- **AND** MUST NOT 通过 PATH、`.cmd` shim 或另一个 prefix 查找 Buildr

#### Scenario: 验证漂移与卸载
- **WHEN** Host Node、entry、package root、payload、prefix 或 ownership receipt 漂移，或用户执行 launcher uninstall
- **THEN** 启动/status MUST fail closed 并给出 repair，uninstall MUST 只删除 matching ownership 的 Launcher 投射
- **AND** npm package、Workspace Registry、SQLite、日志和 Workspace data MUST 保留

### Requirement: npm package 与 Launcher 必须共享同一 Buildr Web 负载
Buildr npm package MUST 包含 application payload 中 Buildr Web 运行所需的正式 Web dist；development checkout MUST 使用当前 checkout 对应的已验证正式 dist。development CLI、已安装 npm CLI 与 npm-owned Launcher 启动 `buildr web` 时 MUST 托管行为一致的 Buildr Web shell。Launcher MUST 引用 package 内资源而不是包含第二份 Web dist，且所有入口 MUST NOT 要求 `buildr-web` 源码或 Vite toolchain。

#### Scenario: 检查 packed Web dist
- **WHEN** verification 检查唯一 `npm pack` tarball
- **THEN** package MUST 包含服务 shell 所需的精确 payload Web dist 并报告 `applicationPayloadDigest`
- **AND** package MUST 包含 Launcher 管理代码但 MUST NOT 包含已生成 `.app`、shortcut、Node 或平台 installer

#### Scenario: npm Launcher 启动 Web
- **WHEN** 用户打开由当前 npm installation 显式生成的图形 Launcher
- **THEN** Launcher MUST 使用已绑定 Host Node 与 package entry 执行 `web` 并服务 package 内同一 Web dist
- **AND** MUST NOT形成 source-tree hosting、CLI-only 分支或独立 Launcher 业务实现

#### Scenario: package build 消费 buildr-web 输出
- **WHEN** 维护者或 CI 构建 npm application payload
- **THEN** 构建 MUST 只消费已进入 `buildr` authority 的正式 Web dist
- **AND** npm pack 与 Launcher install MUST NOT 需要 `projects/product/services/buildr-web` 或重建前端资源

### Requirement: npm发行版运行时不得依赖development准备事实
npm安装的Buildr CLI、Launcher与`buildr web`其产品启动、package entry和Web静态负载 MUST只消费已安装package、安装回执、兼容Host Node及随包`web-dist`，并 MUST NOT读取Product源码`preparation.yml`、development Environment Receipt、源码`node_modules`、源码TypeScript或要求用户设置`BUILDR_NODE`。Workspace命令 MAY且在其既有契约要求时 MUST读取目标用户Workspace的Rules、Project declarations、runtime projection与其他权威资产；这些目标Workspace输入 MUST NOT被误判为Product development依赖。

#### Scenario: 用户在普通Workspace运行发行版CLI
- **WHEN** 用户通过npm installation执行`buildr doctor`、`sync`、`update`或其他发行版命令
- **THEN** CLI MUST从安装回执与package entry使用兼容Host Node启动
- **AND** MUST不查找Product checkout的精确development Node或源码依赖，但doctor与sync仍 MUST按各自契约读取目标Workspace authority

#### Scenario: 用户运行发行版Buildr Web
- **WHEN** 用户执行npm installation的`buildr web`或已验证Launcher binding
- **THEN** runtime MUST托管该package携带的`web-dist`
- **AND** MUST不安装Buildr Web源码依赖、运行源码TypeScript/Vite或读取Task preparation closure

#### Scenario: 发行资产泄漏源码依赖
- **WHEN** npm tarball或Launcher smoke发现入口需要`BUILDR_NODE`、Product checkout、源码`node_modules`或源码TypeScript
- **THEN** Candidate或发布验证 MUST将其判为发行缺陷并失败
- **AND** MUST不把设置环境变量或安装源码依赖作为用户恢复动作
