## ADDED Requirements

### Requirement: 产品验证覆盖 current capability provider resolution
Buildr product verification MUST 覆盖默认 provider、内部 provider 替换、provider 卸载、歧义、版本冲突和 required dependency failure，并 MUST 验证所有 supported runtime adapters 获得一致 binding 语义。

#### Scenario: 默认 providers 完成现有工作流
- **WHEN** a temporary workspace uses package defaults
- **THEN** Git Operations、worktree、task consumers与Task Retrospective MUST resolve to the declared builtin providers
- **AND** existing workspace update、worktree and retained metadata-only finish behavior MUST remain available

#### Scenario: 内部 provider 替换 Git Ops
- **WHEN** a temporary workspace installs one compatible internal `buildr.git-operations@1` provider、binds it and uninstalls `git-operations`
- **THEN** product entry and `task-finish` MUST resolve the internal provider，且 `task-worktree` MUST 继续解析自己的独立 provider
- **AND** render and doctor MUST identify the internal provider without restoring `git-operations` or any removed legacy capability

#### Scenario: Required provider 缺失或有歧义
- **WHEN** a test removes the only compatible required provider or leaves multiple unbound providers in the nearest scope
- **THEN** doctor MUST report `blocked` with `missing_provider` or `ambiguous_provider` reason、affected consumers、candidates and nextActions
- **AND** runtime render MUST retain affected consumers with blocked safety guidance and retain unrelated Skills

#### Scenario: Runtime adapters 接收相同解析结果
- **WHEN** Buildr renders the same scope for each supported Agent adapter
- **THEN** every adapter MUST project equivalent capability status、selected provider and provenance
- **AND** adapter-specific paths MUST NOT change provider resolution

#### Scenario: Transitive provider dependency 被阻断或成环
- **WHEN** selected provider 的 required dependency blocked，或 capability graph contains a required cycle
- **THEN** product verification MUST confirm blocked readiness propagates to every affected upstream consumer
- **AND** doctor MUST report root cause without hanging or selecting an arbitrary edge

### Requirement: Package residual gate 防止 Task Review 与 Retrospective 双 authority
Buildr package verification MUST 区分 Task Review、普通 Change review 与 Task Retrospective，并 MUST 拒绝任何第二个正式 Task Review writer/store、按类型拆分的 capability、Task Record/Environment Review 字段或绕过 Application 的 Task-scoped review route。

#### Scenario: Task Retrospective 保持独立
- **WHEN** package 同时包含`task-review`与`task-retrospective`
- **THEN** capability graph MUST显示不同contract identity、provider、store与consumer purpose
- **AND** 两者 MUST不互写 Result 或互为 lifecycle dependency

#### Scenario: Task-scoped route 仍使用普通 Change review
- **WHEN** Local App 或 Agent action 在明确 Task context 下仍生成不记录 Planning Result 的旧通用 Change review prompt
- **THEN** residual gate/browser contract MUST 失败

#### Scenario: sibling records 受到写入影响
- **WHEN** Task Record、Environment、Task Review或Task Retrospective repository写入同一Workspace SQLite
- **THEN** 专项 fixture MUST证明每个writer只替换自己的精确current row并保留其他专业records

### Requirement: Package 原子交付 Task Retrospective 第一版
Buildr package MUST 原子交付 `buildr.task-retrospective/v1` contract、默认 provider、内部 driver、workspace binding、产品入口路由以及 Local App 只读投影，并 MUST 不建立任何 lifecycle consumer dependency。

#### Scenario: Package 安装 Task Retrospective
- **WHEN** Buildr 初始化或同步 workspace
- **THEN** package MUST 安装 v1 contract 与完整 `task-retrospective` Skill
- **AND** default binding MUST 指向该 provider

#### Scenario: Package 校验第一版边界
- **WHEN** Agent 运行 package check 或产品 affected verification
- **THEN** verifier MUST 检查 contract、provider、binding、driver、SQLite migration/repository、Local App read-only route 和 Result closed schema
- **AND** verifier MUST拒绝history、自动采集、公共CLI、写UI或lifecycle gate

### Requirement: Package 完整退役当前 Task Asset Review 能力
Buildr package 与 active product source MUST 删除 `task-asset-review` provider、全部 capability contract versions、binding、helper、templates、consumer requirements、routing 和专项 mutation tests；历史 archives 与用户 `.buildr/asset-review/` 数据 MUST不在退役范围内。

#### Scenario: 新 workspace 不再安装旧能力
- **WHEN** Buildr 初始化或同步 workspace
- **THEN** runtime MUST不包含`task-asset-review` Skill、contract或binding
- **AND** doctor MUST不报告该能力的ready、degraded或blocked状态

#### Scenario: 升级 workspace 保留旧 observation 数据
- **WHEN** update/sync 前 canonical Workspace 存在`.buildr/asset-review/`文件
- **THEN** package operation MUST不读取、迁移、覆盖或删除这些文件
- **AND** `.gitignore` MAY继续保留旧目录排除规则

## REMOVED Requirements

### Requirement: 产品验证覆盖 capability provider replacement
**Reason**: 旧Requirement包含Task Asset Review optional degradation场景，退役后不应保留为current验证承诺。
**Migration**: 由“产品验证覆盖 current capability provider resolution”替代，并保留其他provider resolution场景。

### Requirement: Package residual gate 必须防止 Task Review 双 authority
**Reason**: 旧Requirement以Task Asset Review作为独立authority与目录型sibling store，已经不符合SQLite Retrospective边界。
**Migration**: 由“Package residual gate 防止 Task Review 与 Retrospective 双 authority”替代。

### Requirement: Package 原子交付任务资产观察 v2
**Reason**: 过程 observation 与 finalize 增加默认 Agent 工作量，已由更窄的 terminal Task Retrospective 第一版替代。
**Migration**: 删除 package 资产和 active bindings，不读取、迁移或删除旧 `.buildr/asset-review/` 数据。
