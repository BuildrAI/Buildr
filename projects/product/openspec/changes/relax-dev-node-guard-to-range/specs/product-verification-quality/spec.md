## MODIFIED Requirements

### Requirement: CI 必须覆盖最低 Node、当前 Node 与 npm Launcher 平台行为
CI MUST 在 `engines.node` 最低支持 Node 与当前 Node 24 上分别安装同一 npm tarball并验证 CLI、`buildr web --no-open`、health/readiness和Host Node identity；每个 hosted Host Node tuple MUST以该 tuple 实际启动 verifier 的绝对 Node executable 作为 authority，同时冻结子进程 PATH，MUST NOT回退读取development checkout的Node版本。development checkout jobs MUST另外使用Product声明的版本供给Node，并验证供给版本优先于PATH上其他满足范围的候选。普通 affected/full/Candidate verification MUST使用无界面、隔离的Launcher逻辑路径；macOS与Windows平台 Launcher行为 MUST由对应OS runner上的显式平台启动入口集成（Platform Launcher Integration）验证本机wrapper/shortcut lifecycle，该集成 MUST不打开默认浏览器、不显示系统通知，且 MUST NOT声称验证Browser Use、SEA、installer、签名或无需Node的平台产品。

#### Scenario: 两个兼容 Host Node
- **WHEN** Candidate 执行最低 Node 与当前 Node jobs
- **THEN** 两者 MUST 消费同一tarball并分别通过普通CLI无HTTP、Web health/readiness与Host installation identity
- **AND** 每个 tuple 的父进程 executable 与子进程 PATH MUST绑定该 runner 实际 Node并输出audit，不得要求等于development声明版本
- **AND** tarball MUST NOT 为不同 Node 重新 pack

#### Scenario: development hostile PATH
- **WHEN** development checkout 的 PATH 首位存在满足开发 Node 范围但不等于 Product 声明版本的 Node，且声明版本经由 `BUILDR_NODE` 或 `NVM_DIR` 显式供给
- **THEN** development bridge、Product npm wrapper与self-bootstrap前置检查 MUST 优先选择显式供给的声明版本，MUST NOT 让 PATH 候选覆盖供给版本
- **AND** 实际选择的 Node 可执行文件与版本 MUST 进入身份或审计记录，MUST NOT 把未供给的 PATH Node 写入 Workspace metadata

#### Scenario: 普通验证不调用平台GUI
- **WHEN** affected、full或Candidate默认步骤验证npm Launcher
- **THEN** verifier MUST直接使用隔离数据根执行无界面Launcher逻辑，并设置no-open与no-notify边界
- **AND** MUST NOT调用macOS LaunchServices、Windows Explorer/shortcut GUI、系统通知或默认浏览器

#### Scenario: 操作系统 Launcher 验证
- **WHEN** macOS 或 Windows runner 显式执行Platform Launcher Integration
- **THEN** verifier MUST 从隔离 npm installation 显式 install/status/launch/repair/uninstall 本机投射并验证 ownership
- **AND** MUST 证明普通 npm install 零桌面副作用且 wrapper/shortcut 不复制 Node 或 package
- **AND** launch MUST使用隔离Web Data Root、no-open和no-notify，不得留下浏览器标签页或系统弹窗

### Requirement: Agent 面向 Product 验证必须从 repository-owned wrapper 启动
Buildr Product 的 Project 测试地图、当前验证说明与 Candidate 操作指引 MUST 将 `tools/development/run-development-npm` 或等价 repository-owned wrapper 作为 Agent 首选入口，并 MUST 在该入口内选择满足开发 Node 范围的 Node（声明版本优先）后再调用 npm script。裸 `npm run` MAY 保留为已激活正确 Node 环境中的兼容入口，但 MUST NOT 成为 Agent 默认执行指引。

#### Scenario: Agent 执行完整 Candidate
- **WHEN** Agent 在 Product checkout 中执行完整 Candidate，且系统 PATH Node 与 `.node-version` 不同
- **THEN** 文档和运行入口 MUST 引导同一次调用通过 repository-owned wrapper 启动 `test:candidate`
- **AND** 全部后代 Node/npm PATH MUST 绑定该 wrapper 选定的实际 Node

#### Scenario: Project 测试地图提供命令
- **WHEN** Agent 从 `verification.yml` 选择 Buildr 测试体系
- **THEN** Agent MUST 原样执行声明的 wrapper `argv` 与 `cwd`
- **AND** MUST NOT 将它简化为系统 PATH 上的裸 `npm`、`node` 或等价命令
