## MODIFIED Requirements

### Requirement: 重复生命周期验证必须声明唯一主 owner
Buildr Product MUST 为 development checkout onboarding、init 行为、checkout/package parity、Task lifecycle、并发 Task Environment 和安装后 release lifecycle 声明不同的主 verifier；多个 verifier MAY 经过相同命令，但 MUST NOT 重复持有同一 happy-path 结果作为主要证据。

#### Scenario: 验证 development checkout onboarding
- **WHEN** repository onboarding verifier 在干净 Git checkout运行
- **THEN** verifier MUST 使用Product声明的精确development Node执行checkout内显式`projects/product/buildr` Project bridge，并证明development entry identity与development update source
- **AND** verifier MUST 完成真实sync、development-only Launcher activation和最终Doctor，同时证明PATH默认`buildr`与`buildr.cmd`未被读取、创建、覆盖或删除
- **AND** verifier MUST NOT安装development PATH CLI，也不得重复持有完整init或npm tarball release lifecycle

#### Scenario: 验证 init 行为
- **WHEN** init onboarding verifier 运行
- **THEN** verifier MUST 持有 unsupported adapter、source-only、完整 init、幂等、冲突和恢复提示契约
- **AND** verifier MUST 使用 checkout CLI 而不承担 tarball 安装证明

#### Scenario: 验证 checkout 与 package 一致性
- **WHEN** CLI package parity verifier 运行
- **THEN** verifier MUST 比较 checkout 与同一 candidate tarball 的代表输出和一个代表 mutation 结果
- **AND** verifier MUST NOT 重跑 Task Record、Task Review Result、Task Verification Result 或双 Task Environment 生命周期
- **AND** verifier MUST NOT 将单侧初始化成功作为独立发布证据

#### Scenario: 验证安装后发布生命周期
- **WHEN** release tarball smoke 运行
- **THEN** verifier MUST 独占安装后 init、sync、doctor、optional uninstall 和最终 doctor 的发布生命周期证据

### Requirement: CI 必须覆盖最低 Node、当前 Node 与 npm Launcher 平台行为
CI MUST 在 `engines.node` 最低支持 Node 与当前 Node 24 上分别安装同一 npm tarball并验证 CLI、`buildr web --no-open`、health/readiness和Host Node identity；development checkout jobs MUST另外使用Product声明的精确Node并验证hostile PATH不产生漂移。macOS与Windows Launcher行为 MUST在对应OS runner验证本机wrapper/shortcut lifecycle，但 MUST NOT声称验证SEA、installer、签名或无需Node的平台产品。

#### Scenario: 两个兼容 Host Node
- **WHEN** Candidate 执行最低 Node 与当前 Node jobs
- **THEN** 两者 MUST 消费同一tarball并分别通过普通CLI无HTTP、Web health/readiness与Host installation identity
- **AND** tarball MUST NOT 为不同 Node 重新 pack

#### Scenario: development hostile PATH
- **WHEN** checkout PATH首位存在满足`engines.node`但不等于Product精确开发版本的Node
- **THEN** development bridge、Product npm wrapper与self-bootstrap前置检查 MUST拒绝漂移或选择显式提供的精确Node
- **AND** MUST NOT把该Node写入Workspace metadata

#### Scenario: 操作系统 Launcher 验证
- **WHEN** macOS 或 Windows runner 执行 Launcher lifecycle
- **THEN** verifier MUST 从隔离 npm installation 显式 install/status/launch/repair/uninstall 本机投射并验证 ownership
- **AND** MUST 证明普通 npm install 零桌面副作用且 wrapper/shortcut 不复制 Node 或 package

### Requirement: Candidate CI 必须最小化串行前置与无效制品依赖
Buildr Candidate CI MUST 在不合并 evidence owner 的前提下复用 preflight 与 artifact runner setup，并 MUST 只让真实 artifact consumers等待和下载候选制品；互相隔离的 Windows Workspace/Task primary owners MUST 按资源压力拆成多个有界 shard。

#### Scenario: Candidate bootstrap 成功
- **WHEN** dev→main 或手工 Candidate run 启动
- **THEN** 一个bootstrap job MUST在同一checkout、Product精确development Node与依赖上先完成`preflight-macos`再完成`artifact-macos`
- **AND** job MUST 分别上传两份 shard evidence与一个不可变 Candidate artifact

#### Scenario: Preflight 失败
- **WHEN** bootstrap 中 cheap preflight 返回非零状态
- **THEN** artifact 构建和全部下游 verification shard MUST 不启动
- **AND** stable `Candidate gate` MUST 聚合为失败

#### Scenario: Windows shard 不消费 artifact
- **WHEN** `workspace-lifecycle-windows`、`task-workflow-windows` 或 `fresh-build-windows` 启动
- **THEN** workflow MUST NOT 下载或向 runner声明 Candidate artifact目录
- **AND** `runtime-windows` 与其他真实消费者 MUST 继续使用同一 bootstrap artifact

#### Scenario: Workspace 与 Task owner 并行
- **WHEN** Candidate 在资源受限 CI profile运行 Windows Workspace/Task验证
- **THEN** Workspace lifecycle owners与Task workflow owners MUST 位于独立 runner shard并可并行
- **AND** 每个 runner内部的`workspace-saturating`容量 MUST保持一
- **AND** 两个 shard 的 primary step并集 MUST 等于旧完整 owner集合减去已正式退役的 stale owner，且不得重复

## REMOVED Requirements

### Requirement: Host Node 与 Workspace Node runtime role 必须分别验证
**Reason**: Workspace Node runtime role被删除，Candidate不再构造或比较该identity。
**Migration**: npm验证只证明Host Node installation；development验证单独证明Product精确checkout Node。

#### Scenario: npm CLI 与 Launcher runtime role
- **WHEN** Candidate验证npm CLI与Launcher
- **THEN** verifier MUST只核验formal Host Node installation identity，不得构造Workspace Node role
