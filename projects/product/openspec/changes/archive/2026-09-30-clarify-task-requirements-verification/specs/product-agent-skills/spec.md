## ADDED Requirements

### Requirement: 实现完成阶段必须指引登记任务验证报告
产品内置的 `openspec-apply-change` 贡献与 `task-finish` 指引 MUST 明确：Agent 在实现完成、交付或任务完成（`completed`）之前，把当前已执行且仍适用的检查经 Task Verification 登记为正式报告；`completed` 之后不再写入，Agent MUST NOT 在完成任务后补救同一份报告。

#### Scenario: apply 阶段指引登记时点
- **WHEN** Agent 在 `openspec-apply-change` 完成实现且相关检查已执行
- **THEN** apply 指引 MUST 要求在同一 active 阶段登记任务验证报告
- **AND** MUST 说明 `completed` 后报告槽位锁死、无法补登

#### Scenario: finish 指引保持登记顺序
- **WHEN** Agent 收尾任务且存在已执行而未登记的检查
- **THEN** `task-finish` 指引 MUST 在 `task complete` 之前完成验证报告登记
- **AND** MUST NOT 引导 Agent 先把任务置为 completed 再补登记
