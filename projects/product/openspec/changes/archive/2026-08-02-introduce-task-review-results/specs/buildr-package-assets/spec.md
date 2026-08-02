## ADDED Requirements

### Requirement: Package 必须原子交付 Task Review authority
Buildr package MUST 原子交付 `buildr.task-review/v1` contract、默认 `task-review` Skill、Task Review Domain/Application/repository、CLI/JSON、Local App Review API/Web assets、Task-scoped Planning Review route、workspace binding、runtime source mappings 与专项验证。任一 identity、version、provider、path、schema、binding 或 Application client 接线不一致时 package check 与 doctor MUST fail closed。

#### Scenario: 安装或更新 workspace assets
- **WHEN** Buildr package 安装、更新或同步支持 Task Review 的 workspace
- **THEN** workspace Skills manifest MUST 登记 `buildr.task-review@1`、enabled/installed/optional 的 `task-review` provider 和 default binding
- **AND** runtime projection MUST 包含同一 contract/Skill identity，不得创建 planning-review/completion-review 两个 provider

#### Scenario: package/runtime parity
- **WHEN** Task Review 从 source checkout、package checkout 或 npm tarball 执行
- **THEN** 三者 MUST 产生等价的 persisted Result、operation JSON、CLI help、Local App read model 和 target applicability

#### Scenario: Task Review 资产不完整
- **WHEN** contract、Skill、manifest/binding、Application/CLI、JSON registry、Local App route 或 tests 任一缺失/漂移
- **THEN** package check/doctor MUST 报告 blocked，MUST 不把 capability 描述为 ready 或正式生效

### Requirement: Package residual gate 必须防止 Task Review 双 authority
Buildr package verification MUST 区分 Task Review、普通 Change review 与 Task Asset Review，并 MUST 拒绝任何第二个正式 Task Review writer/store、按类型拆分的 capability、Task Record/Environment Review 字段或绕过 Application 的 Task-scoped review route。

#### Scenario: task-asset-review 保持独立
- **WHEN** package 同时包含 `task-review` 与 `task-asset-review`
- **THEN** capability graph MUST 显示不同 contract identity、provider、store 与 consumer purpose
- **AND** Task Finish 的 asset observation dependency MUST 保持指向 `task-asset-review`

#### Scenario: Task-scoped route 仍使用普通 Change review
- **WHEN** Local App 或 Agent action 在明确 Task context 下仍生成不记录 Planning Result 的旧通用 Change review prompt
- **THEN** residual gate/browser contract MUST 失败

#### Scenario: sibling records 受到写入影响
- **WHEN** Task Record、Environment 或 Task Review repository 写入同一 `.buildr/tasks/<task-id>/` 目录
- **THEN**专项 fixture MUST 证明每个 writer 只创建或替换自己的精确 owned path，并逐字节保留其他专业 records

### Requirement: 候选 Task Review authority 必须在 retained cutover 前保持隔离
Task worktree 中新增的 Task Review Skill、CLI、Application 或 runtime assets MUST 只在该任务验证工作区和临时 Workspace 中验证；它们 MUST NOT 写 retained Workspace 的 Review Result、替换正式 runtime 或宣称 selected authority 已切换。只有候选集成、retained source sync/render/doctor 和真实 E2E 成功后，P0.3 authority 才 MUST 被报告为生效。

#### Scenario: 自举候选执行验证
- **WHEN** candidate CLI/Skill 在 Task Environment 中接受测试
- **THEN**测试 MUST 使用 task worktree 内 fixture/临时 Workspace 和候选 runtime
- **AND** retained/peer Task records、Review Results、runtime 与主 checkout MUST 保持不受影响
