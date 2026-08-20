## MODIFIED Requirements

### Requirement: CI 必须覆盖最低 Node、当前 Node 与 npm Launcher 平台行为
CI MUST 在 `engines.node` 最低支持 Node 与当前 Node 24 上分别安装同一 npm tarball并验证 CLI、`buildr web --no-open`、health/readiness和Host Node identity；每个 hosted Host Node tuple MUST以该 tuple 实际启动 verifier 的绝对 Node executable 作为 authority，同时冻结子进程 PATH，MUST NOT回退读取development checkout的精确Node版本。development checkout jobs MUST另外使用Product声明的精确Node并验证hostile PATH不产生漂移。macOS与Windows Launcher行为 MUST在对应OS runner验证本机wrapper/shortcut lifecycle，但 MUST NOT声称验证SEA、installer、签名或无需Node的平台产品。

#### Scenario: 两个兼容 Host Node
- **WHEN** Candidate 执行最低 Node 与当前 Node jobs
- **THEN** 两者 MUST 消费同一tarball并分别通过普通CLI无HTTP、Web health/readiness与Host installation identity
- **AND** 每个 tuple 的父进程 executable 与子进程 PATH MUST绑定该 runner 实际 Node并输出audit，不得要求等于development `.node-version`
- **AND** tarball MUST NOT 为不同 Node 重新 pack

#### Scenario: development hostile PATH
- **WHEN** checkout PATH首位存在满足`engines.node`但不等于Product精确开发版本的Node
- **THEN** development bridge、Product npm wrapper与self-bootstrap前置检查 MUST拒绝漂移或选择显式提供的精确Node
- **AND** MUST NOT把该Node写入Workspace metadata

#### Scenario: 操作系统 Launcher 验证
- **WHEN** macOS 或 Windows runner 执行 Launcher lifecycle
- **THEN** verifier MUST 从隔离 npm installation 显式 install/status/launch/repair/uninstall 本机投射并验证 ownership
- **AND** MUST 证明普通 npm install 零桌面副作用且 wrapper/shortcut 不复制 Node 或 package

### Requirement: release smoke 必须验证 npm 安装与 Launcher 生命周期
Release smoke MUST 从唯一冻结 npm tarball 安装 Buildr，并 MUST 验证 CLI、Buildr Web、npm update authority 和显式 Launcher install/status/repair/uninstall。它 MUST验证 drift/foreign target fail closed 与 npm package/Workspace data 保留；不得用源码启动或平台 staging 目录替代。Launcher startup MUST使用独立、可审计且明显早于 capability timeout 的wall-clock readiness budget；失败时 MUST在清理临时安装根前保留 launcher log、脱敏 instance、process ownership/存活状态、elapsed/budget和exact Node evidence。

#### Scenario: npm tarball lifecycle
- **WHEN** release smoke 将 tarball 安装到隔离 prefix
- **THEN** `buildr --help`、代表性 CLI、`buildr web --no-open`、health/readiness 和 `launcher install/status/launch` MUST 使用该 prefix 的 Host Node/package entry
- **AND** Launcher health runtime与启动日志 MUST证明子进程 executable、version和PATH首项匹配该Host Node
- **AND** ordinary install/CLI MUST NOT 自动创建 Launcher 或启动 HTTP

#### Scenario: Launcher 未在 readiness budget 内就绪
- **WHEN** Launcher没有在专用wall-clock budget内产生匹配health，或进程提前退出
- **THEN** release smoke MUST fail closed并报告startup label、elapsed、budget、instance path、PID/进程组或不可用原因
- **AND** 已完成phase、launcher log、脱敏instance、process observation与exact Node audit MUST保存在Candidate diagnostics
- **AND** owned process与临时安装根 MUST继续清理，且无需等待外层job timeout

#### Scenario: repair 与 uninstall
- **WHEN** verifier 使 binding 中一个 identity field 漂移后执行 status/launch/repair/uninstall
- **THEN** status/launch MUST fail closed，repair MUST 从同一 formal npm installation 原子恢复，uninstall MUST 只删除 owned Launcher
- **AND** npm package 与 Workspace/user data MUST 保持不变
