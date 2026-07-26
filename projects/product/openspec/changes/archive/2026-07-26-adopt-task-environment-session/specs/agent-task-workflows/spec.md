## ADDED Requirements

### Requirement: 实现型 workflow 必须在 session adoption 后继续
Buildr 的 task triage、task-worktree 与 OpenSpec Skills MUST 将 Agent session adoption 作为采用 canonical task environment 的完成条件。implementation workflow MUST 在 adoption evidence 为 adopted 后才能创建 Change artifacts、编辑实现、运行构建/测试或产生正式验证 evidence。

#### Scenario: Triage 创建 environment 后交接新 session
- **WHEN** task triage 选择 implementation 并创建新的 canonical task environment
- **THEN** task-worktree provider MUST 返回 task、change、environment、repository set、runtime expectation 与 handoff next action
- **AND** 当前 session MUST 停止 task 写入，直到以 environment root 启动或重新进入的 Agent session 完成 adoption

#### Scenario: 仅改变工具工作目录
- **WHEN** 原 session 只把命令或编辑工具的工作目录切换到 allowed execution root
- **THEN** workflow MUST NOT 将该动作视为 session adoption
- **AND** proposal、实现、构建、测试与正式验证 MUST 保持 blocked

#### Scenario: Adopted session 继续 change-flow
- **WHEN** checkout-local context 返回当前 Agent session adoption 为 adopted
- **THEN** Agent MUST 在同一 environment 的 allowed execution roots 内继续 proposal、apply 与验证
- **AND** Skills 间交接 MUST 携带 adoption evidence identity，而不是只传递 environment path

### Requirement: Workflow 必须遵守 adapter activation mode
Task environment handoff MUST 消费 runtime adapter 的 Rules/Skills activation metadata。对于 `session-start`，workflow MUST 要求新 session 或 runtime host 可证明的等价重新进入；对于 `explicit-reload`，只有 descriptor guidance 与 reload evidence 都存在时才 MUST 允许 reload adoption。

#### Scenario: Codex Skills 在 session start 激活
- **WHEN** Codex task environment 已完成 checkout-local runtime sync
- **THEN** workflow MUST 说明 Rules 可按 `path-read` 发现而 Skills 需要 session start
- **AND** Buildr MUST NOT 承诺当前 Codex session 因 sync 完成而即时重发现 checkout-local Skills

#### Scenario: Runtime 支持显式 reload
- **WHEN** adapter 声明 `explicit-reload`、提供 reload guidance 且 Agent/runtime host 返回匹配的 reload evidence
- **THEN** workflow MUST 允许以 reload mode 完成 adoption
- **AND** 缺少任一项时 MUST 回退为新 session handoff 或保持 blocked
