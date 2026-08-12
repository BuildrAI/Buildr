## MODIFIED Requirements

### Requirement: 随包任务验证能力保持完整可组合
Buildr package MUST 原子交付 `buildr.task-verification/v3` contract、默认 `task-verification` provider、Project `buildr.project-verification/v2` reference/template、Workspace binding、CLI/Application runtime 与全部 supported runtime 投射输入。Package MUST 不再包含 v2 contract、v1 declaration reference、成熟度/三级 assurance/Candidate reuse guidance 或 Task Finish 的独立 verification summary authority。

#### Scenario: Package 声明 task-verification provider
- **WHEN** package static validation 读取随包能力声明
- **THEN** Workspace Skills manifest MUST 声明 installed、enabled 的 `task-verification` provider、`buildr.task-verification/v3` contract 与 binding
- **AND** package include mapping MUST 只投射 v3 contract 和 Project v2 reference/template

#### Scenario: Package 交付测试声明资料
- **WHEN** package static validation 检查 `task-verification` 完整目录
- **THEN** provider MUST 包含 v2 schema reference 和最小初始化模板
- **AND** 资料 MUST 只描述 capability identity、Project/Service scope、invocation、applicability、proves、requiredForDelivery 与按需边界

#### Scenario: Runtime 可发现验证入口
- **WHEN** 临时 Workspace 为任一 supported runtime 完成 sync 或 render
- **THEN** runtime inventory MUST 包含可发现的 v3 `task-verification` Skill
- **AND** description MUST 覆盖直接测试、正式 Task current Result、能力声明、实现完成验证与 coverage gap 意图

#### Scenario: Provider contract 组合验证
- **WHEN** Buildr 运行随包任务 Skills 契约验证
- **THEN** verifier MUST 覆盖 Result closed schema、atomic replacement、current/stale/unknown、transient execution separation、coverage gap、Local App read-only 和 Finish shared consumer
- **AND** verifier MUST 确认 provider 不依赖固定 Git/Environment provider id，不拥有 Candidate、proceed/blocked 或 Task status

#### Scenario: 替换默认验证 provider
- **WHEN** Workspace 安装并绑定兼容的内部 `buildr.task-verification/v3` provider
- **THEN** consumers MUST 通过 binding 发现 provider 而不修改 consumer Skill
- **AND** 默认 provider 在不再被选中时 MUST 可安全卸载

## REMOVED Requirements

### Requirement: 产品验证覆盖分层验证门禁契约
**Reason**: package contract 不再固化 minimal/affected/candidate、requiredAssurance 或 Candidate reuse。
**Migration**: 验证 v3 Result authority、显式 capabilities 与 Product 内部测试计划的独立边界。

### Requirement: 产品验证覆盖 Candidate task metadata 分类
**Reason**: `verification-result-metadata-only` checkbox transition 是旧 Finish lifecycle 优化，不属于 P0.4。
**Migration**: target/declaration identity 变化派生 stale，不保留 transition fixtures 或 executor count policy。

## ADDED Requirements

### Requirement: Package residual gate 必须防止 Task Verification 双 authority
Buildr package verification MUST 静态证明 Result persistence writer 只有 Task Verification Application 一个调用方，CLI 与 Local App 不直接读写 YAML，Task Record/Environment/Review/Finish 不复制 Result fields，并 MUST 拒绝 source、manifest、docs、tests 或 generated package 中仍被默认流程引用的 v2/v1 lifecycle authority。

#### Scenario: 检查唯一 writer
- **WHEN** package verifier 扫描 Product source
- **THEN** `writeTaskVerificationResultPersistence` 的调用方 MUST 精确为 Task Verification Application
- **AND** CLI、Local App 与 Finish MUST 只调用 Application methods

#### Scenario: 检查残留旧 authority
- **WHEN** package verifier 扫描受管 runtime assets、canonical docs 与公开 CLI
- **THEN** 不得存在 `buildr.task-verification/v2`、`project-verification/v1`、requiredAssurance、minimal/affected/candidate Result 层级或 direct verification summary consumer
- **AND** Product 内部测试 profile 中的 `candidate` 名称 MAY 保留，但 MUST 与 Task Verification declaration/Result authority 明确隔离
