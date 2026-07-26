## ADDED Requirements

### Requirement: Runtime projection 必须提供 task session adoption expectation
Buildr runtime adapter plan 与公开 runtime evidence MUST 提供 task environment 可消费的 adoption expectation，至少包含 adapter identity、runtime source root、projection identity、Rules/Skills activation、允许的 adoption modes 与 activation guidance。该 expectation MUST 描述 Buildr 可证明的投射事实，不得声称目标 Agent 已在当前 session 加载 runtime。

#### Scenario: Session-start Skills 已投射到 task checkout
- **WHEN** Buildr 为 task environment 成功投射一个 Skills activation 为 `session-start` 的 runtime
- **THEN** runtime evidence MUST 返回 checkout-local runtime source root、projection identity 与新 session guidance
- **AND** MUST 将当前 session 是否已加载保持为 unknown，直到 task environment 收到匹配 adoption evidence

#### Scenario: Runtime projection identity 改变
- **WHEN** task environment adoption 后的 sync/render 改变了影响 Rules 或 Skills discovery 的 projection identity
- **THEN** runtime evidence MUST 使既有 adoption receipt 可被确定性识别为 stale
- **AND** MUST 要求按 adapter activation mode 重新采用 runtime

#### Scenario: Filesystem 无法证明 session consumption
- **WHEN** runtime check 只能证明投射内容与期望状态一致
- **THEN** result MUST 报告 projection ready 与 session consumption unknown
- **AND** MUST NOT 仅凭文件存在、content identity 或 checker success 报告 session adopted

### Requirement: Codex runtime evidence 必须保持 path-read 与 session-start 边界
Codex adapter MUST 继续将 Rules activation 声明为 `path-read`、Skills activation 声明为 `session-start`，并 MUST 向 task environment 提供以 environment root 启动新 Codex task/session 的 adoption guidance。

#### Scenario: Codex task environment runtime 准备完成
- **WHEN** checkout-local Codex runtime 已通过 sync 与 doctor
- **THEN** Buildr MUST 报告 Rules 和 Skills 各自的 activation mode、runtime source root 与 projection identity
- **AND** MUST 要求 session-start adoption 才能证明 checkout-local Skills 被任务 session 消费
