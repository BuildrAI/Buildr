## REMOVED Requirements

### Requirement: 实现任务采用分层验证门禁
**Reason**: 固定 minimal/affected/candidate 协议属于旧 Verification/Finish lifecycle authority，并提前假设 Candidate。
**Migration**: 使用 `task-verification` v3 根据明确目标和 Project v2 declarations 选择实际适用能力。

### Requirement: 最终 Candidate 任务勾选作为可审计验证结果元数据
**Reason**: checkbox transition、Candidate evidence reuse 与 implementation-changed 分类不属于 P0.4 current Result。
**Migration**: target identity 或 declaration identity 变化后 Result 直接派生 stale；P0.5 另建 Candidate generation。

### Requirement: OpenSpec apply 协调最终验证任务标记
**Reason**: 外部 apply workflow 不应拥有 Candidate verification marker 或 Result reuse authority。
**Migration**: 完成实现任务与记录 Task Verification Result 分离；tasks checkbox 不作为 Result identity 或复用证据。

## ADDED Requirements

### Requirement: task-verification Skill 必须作为语义验证入口
Buildr MUST 交付一个名为 `task-verification` 的 Workspace Skill，并 MUST 通过 selected `buildr.task-verification/v3` provider 工作。Skill MUST 理解正式 Task Intent 与明确 target、读取 Task scope 内 Project v2 declarations、选择适用已有能力、调用 command runner 或执行 bounded Agent operation、提炼 portable facts，并只在完整结论形成后调用 Task Verification Application record。

#### Scenario: 用户要求验证正式 Task
- **WHEN** 用户、未来 Development 或临时 Finish consumer 提供正式 Task 与明确 target identity
- **THEN** Agent MUST 先 inspect existing current Result 和 declarations
- **AND** stale、missing 或目标要求额外能力时 MUST 执行适用能力并形成一份完整 replacement

#### Scenario: 普通一次性测试
- **WHEN** 用户只要求运行一条测试且没有正式 Task 或 target identity
- **THEN** Skill MAY 执行并在会话中报告 transient facts
- **AND** MUST NOT 创建空 Task、伪 target identity 或 Task Verification Result

### Requirement: Skill 必须区分 Capability Declaration、Execution 与 Result
Skill MUST 把 Project declaration 作为已有能力事实，把完整 stdout/stderr、耗时、资源等待和诊断作为 transient Execution Evidence，把 current Result 作为 portable Task fact。Skill MUST NOT 将三者合并成一个 schema，也 MUST NOT 把 execution summary path 写入 Result。

#### Scenario: command execution 成功
- **WHEN** Skill 通过 `buildr verification run` 执行显式 command capabilities
- **THEN** Skill MUST 读取 transient summary 并提炼每项 capability 的 portable facts
- **AND** 全部 consumer 完成后 MUST 请求 cleanup exact execution boundary

#### Scenario: execution 中断
- **WHEN** runner 或 Agent operation 中断且完整结论未形成
- **THEN** Skill MUST 保留已有 current Result
- **AND** MUST 如实报告本次 transient execution 未形成新 current

### Requirement: P0.4 workflow 不得抢占 Development 或其他专业 authority
`task-verification` MUST NOT 创建 Candidate generation、改变 Task Record status、决定 proceed/blocked、接受风险、实现缺失测试、替代 Task Review/Task Environment/业务验收或执行 Metadata Publication。Project policy 或 consumer MAY 决定需要哪些能力，但该决定不得被保存成 Verification lifecycle 状态。

#### Scenario: 存在 coverage gap
- **WHEN** 当前目标缺少能证明所需事实的 capability
- **THEN** Skill MUST 将 gap 写入完整 Result 或会话报告
- **AND** MUST 将“是否继续”留给用户或未来 Task Development

### Requirement: Buildr 产品入口必须路由 v3 Verification authority
Buildr product Skill、task-triage 和相关 builtin descriptions MUST 将测试、验证、能力声明和实现完成验证意图路由到 selected `buildr.task-verification/v3` provider，并 MUST 删除 v2、成熟度晋级、三层 assurance 与 Candidate reuse 的路由文本。

#### Scenario: runtime 发现 Task Verification
- **WHEN** supported Agent runtime 完成 Buildr sync/render
- **THEN** runtime MUST 发现 v3 `task-verification` Skill、contract、Project v2 reference/template 与 binding
- **AND** 不得同时投射 v2 contract 或 v1 reference
