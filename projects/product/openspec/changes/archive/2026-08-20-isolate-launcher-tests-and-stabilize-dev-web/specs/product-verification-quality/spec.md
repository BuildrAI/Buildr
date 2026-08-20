## MODIFIED Requirements

### Requirement: CI 必须覆盖最低 Node、当前 Node 与 npm Launcher 平台行为
CI MUST 在 `engines.node` 最低支持 Node 与当前 Node 24 上分别安装同一 npm tarball并验证 CLI、`buildr web --no-open`、health/readiness和Host Node identity；每个 hosted Host Node tuple MUST以该 tuple 实际启动 verifier 的绝对 Node executable 作为 authority，同时冻结子进程 PATH，MUST NOT回退读取development checkout的精确Node版本。development checkout jobs MUST另外使用Product声明的精确Node并验证hostile PATH不产生漂移。普通 affected/full/Candidate verification MUST使用无界面、隔离的Launcher逻辑路径；macOS与Windows平台 Launcher行为 MUST由对应OS runner上的显式平台启动入口集成（Platform Launcher Integration）验证本机wrapper/shortcut lifecycle，该集成 MUST不打开默认浏览器、不显示系统通知，且 MUST NOT声称验证Browser Use、SEA、installer、签名或无需Node的平台产品。

#### Scenario: 两个兼容 Host Node
- **WHEN** Candidate 执行最低 Node 与当前 Node jobs
- **THEN** 两者 MUST 消费同一tarball并分别通过普通CLI无HTTP、Web health/readiness与Host installation identity
- **AND** 每个 tuple 的父进程 executable 与子进程 PATH MUST绑定该 runner 实际 Node并输出audit，不得要求等于development `.node-version`
- **AND** tarball MUST NOT 为不同 Node 重新 pack

#### Scenario: development hostile PATH
- **WHEN** checkout PATH首位存在满足`engines.node`但不等于Product精确开发版本的Node
- **THEN** development bridge、Product npm wrapper与self-bootstrap前置检查 MUST拒绝漂移或选择显式提供的精确Node
- **AND** MUST NOT把该Node写入Workspace metadata

#### Scenario: 普通验证不调用平台GUI
- **WHEN** affected、full或Candidate默认步骤验证npm Launcher
- **THEN** verifier MUST直接使用隔离数据根执行无界面Launcher逻辑，并设置no-open与no-notify边界
- **AND** MUST NOT调用macOS LaunchServices、Windows Explorer/shortcut GUI、系统通知或默认浏览器

#### Scenario: 操作系统 Launcher 验证
- **WHEN** macOS 或 Windows runner 显式执行Platform Launcher Integration
- **THEN** verifier MUST 从隔离 npm installation 显式 install/status/launch/repair/uninstall 本机投射并验证 ownership
- **AND** MUST 证明普通 npm install 零桌面副作用且 wrapper/shortcut 不复制 Node 或 package
- **AND** launch MUST使用隔离Web Data Root、no-open和no-notify，不得留下浏览器标签页或系统弹窗

### Requirement: release smoke 必须验证 npm 安装与 Launcher 生命周期
Release smoke MUST 从唯一冻结 npm tarball 安装 Buildr，并 MUST 验证 CLI、Buildr Web、npm update authority 和显式 Launcher install/status/repair/uninstall。默认 release smoke MUST直接执行无界面Launcher入口，不得调用平台GUI或默认浏览器；显式Platform Launcher Integration MAY复用同一tarball与lifecycle，但 MUST作为独立调用和结果存在。两者 MUST验证 drift/foreign target fail closed 与 npm package/Workspace data 保留；不得用源码启动或平台 staging 目录替代。Launcher startup MUST使用独立、可审计且明显早于 capability timeout 的wall-clock readiness budget；失败时 MUST在清理临时安装根前保留 launcher log、脱敏 instance、process ownership/存活状态、elapsed/budget和exact Node evidence。

#### Scenario: npm tarball lifecycle
- **WHEN** 默认release smoke将tarball安装到隔离prefix
- **THEN** `buildr --help`、代表性CLI、`buildr web --no-open`、health/readiness和无界面`launcher install/status/launch` MUST使用该prefix的Host Node/package entry
- **AND** Launcher health runtime与启动日志 MUST证明子进程 executable、version和PATH首项匹配该Host Node
- **AND** ordinary install/CLI MUST NOT自动创建Launcher、启动HTTP、打开默认浏览器或显示系统通知

#### Scenario: Launcher 未在 readiness budget 内就绪
- **WHEN** Launcher没有在专用wall-clock budget内产生matching health，或进程提前退出
- **THEN** release smoke MUST fail closed并报告startup label、elapsed、budget、instance path、PID/进程组或不可用原因
- **AND** 已完成phase、launcher log、脱敏instance、process observation与exact Node audit MUST保存在Candidate diagnostics
- **AND** owned process与临时安装根 MUST继续清理，且无需等待外层job timeout或显示系统弹窗

#### Scenario: repair 与 uninstall
- **WHEN** verifier使binding中一个identity field漂移后执行status/launch/repair/uninstall
- **THEN** status/launch MUST fail closed，repair MUST从同一formal npm installation原子恢复，uninstall MUST只删除owned Launcher
- **AND** npm package与Workspace/user data MUST保持不变

#### Scenario: 显式平台入口验收
- **WHEN** 维护者或对应OS runner显式选择Platform Launcher Integration
- **THEN** verifier MUST通过真实`.app`或shortcut启动同一隔离安装，并验证平台入口可执行及健康实例复用
- **AND** 该结果 MUST独立于默认release smoke，且 MUST NOT打开浏览器、显示通知或声称完成Browser Use测试
