## ADDED Requirements

### Requirement: Task Finish 必须消费仅工作区Task的正式研发交接
Task Finish MUST把workspace-only Task形成的current immutable Development handoff与Project/Service Task handoff等同作为入口authority，并继续执行`preflight → prepare → verify → deliver → cleanup`五阶段。Finish MUST不解释空declarations、workspace coverage gap或风险语义，也 MUST不补跑Verification、重新freeze Candidate或降低Completion Review与proceed门禁。

#### Scenario: workspace-only handoff完成五阶段交付
- **WHEN** workspace-only Task已经以current Content Target、policy、`not-passed` Verification Result、明确风险接受、Completion Review、Candidate和Development handoff满足全部入口门禁
- **THEN** `task finish run` MUST消费同一handoff完成carrier preparation、equivalence、delivery、remote readback和Environment cleanup
- **AND** Result MUST报告`formalVerificationExecutions: 0`并保持原Candidate generation与gate关联

#### Scenario: workspace gap未处置时拒绝Finish
- **WHEN** workspace-only Task缺少current Candidate、Completion Review、proceed decision或Development handoff
- **THEN** Task Finish entry readiness MUST继续返回`task_finish.development_handoff_not_current`
- **AND** environment或delivery ready MUST不绕过Development缺口
