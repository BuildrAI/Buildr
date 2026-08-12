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
