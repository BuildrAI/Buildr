## MODIFIED Requirements

### Requirement: 重复生命周期验证必须声明唯一主 owner
Buildr Product MUST 为development checkout onboarding、init行为、checkout/package parity、Task lifecycle、并发Worktree/Preview组合和安装后release lifecycle声明不同的主verifier；多个verifier MAY经过相同命令，但 MUST NOT重复持有同一happy-path结果作为主要证据。

#### Scenario: 验证 development checkout onboarding
- **WHEN** repository onboarding verifier 在干净 Git checkout运行
- **THEN** verifier MUST 使用满足Product最低版本要求的实际development Node执行checkout内显式`projects/product/buildr` Project bridge，并证明development entry identity与development update source
- **AND** verifier MUST 完成真实sync、development-only Launcher activation和最终Doctor，同时证明PATH默认`buildr`与`buildr.cmd`未被读取、创建、覆盖或删除
- **AND** verifier MUST NOT安装development PATH CLI，也不得重复持有完整init或npm tarball release lifecycle

#### Scenario: 验证 init 行为
- **WHEN** init onboarding verifier 运行
- **THEN** verifier MUST 持有 unsupported adapter、source-only、完整 init、幂等、冲突和恢复提示契约
- **AND** verifier MUST 使用 checkout CLI 而不承担 tarball 安装证明

#### Scenario: 验证 checkout 与 package 一致性
- **WHEN** CLI package parity verifier 运行
- **THEN** verifier MUST 比较 checkout 与同一 candidate tarball 的代表输出和一个代表 mutation 结果
- **AND** verifier MUST NOT重跑Task Record、Task Review Result、Task Verification Result或双Worktree组合生命周期
- **AND** verifier MUST NOT 将单侧初始化成功作为独立发布证据

#### Scenario: 验证安装后发布生命周期
- **WHEN** release tarball smoke 运行
- **THEN** verifier MUST 独占安装后 init、sync、doctor、optional uninstall 和最终 doctor 的发布生命周期证据

### Requirement: Candidate CI 必须最小化串行前置与无效制品依赖
Buildr Candidate CI MUST 在不合并 evidence owner 的前提下复用 preflight 与 artifact runner setup，并 MUST 只让真实 artifact consumers等待和下载候选制品；互相隔离的 Windows Workspace/Task primary owners MUST 按资源压力拆成多个有界 shard。

#### Scenario: Candidate bootstrap 成功
- **WHEN** dev→main 或手工 Candidate run 启动
- **THEN** 一个bootstrap job MUST在同一checkout、满足Product最低版本要求的实际development Node与依赖上先完成`preflight-macos`再完成`artifact-macos`
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
