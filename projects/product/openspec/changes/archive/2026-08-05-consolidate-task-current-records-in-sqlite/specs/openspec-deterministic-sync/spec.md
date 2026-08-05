## MODIFIED Requirements

### Requirement: Convergence transaction 必须在任何写入前门禁 Change checklist
Buildr MUST 在 active Change 的 canonical planning、receipt写入、canonical apply和archive之前，以与Change read model相同的Markdown checkbox语义检查现有`tasks.md`。存在任一未完成checkbox时，convergence MUST返回`blocked`与稳定的checklist progress，且不得写receipt、canonical spec或调用archive；Buildr MUST NOT自动勾选、删除或把归档后Task lifecycle evidence解释为Change task完成。

#### Scenario: Change仍有未完成checkbox
- **WHEN** active Change的`tasks.md`同时包含已完成与未完成checkbox
- **THEN** `buildr openspec converge` MUST返回`change-checklist-incomplete`及`completed`、`total`、`remaining`
- **AND** canonical files、convergence receipt与archive lifecycle MUST保持不变

#### Scenario: Change checklist已经闭合
- **WHEN** active Change的全部checkbox均已完成且其他convergence门禁通过
- **THEN** transaction MUST继续执行确定性planning、validation、apply、confirmation与archive
- **AND** archive后Task Development、Task Finish、Environment cleanup与Task terminal evidence MUST由各自authority形成，Task current records MUST只写Workspace SQLite且不得回写archive checkbox

## ADDED Requirements

### Requirement: 全部 Requirements 清退必须删除 canonical capability spec
当一个现有 capability 的全部 canonical Requirements 都被同一无歧义 delta 安全删除时，deterministic convergence MUST 将目标建模为 expected absent，而不是生成没有 Requirements 的空 spec。Plan 与 receipt MUST 保存 before/expected existence，projected strict validation MUST 在隔离树中删除目标，canonical applier MUST 原子删除目标文件并在批次失败时恢复 before bytes，observer MUST 只在目标文件确实不存在时确认 expected state。

#### Scenario: 唯一 capability Requirements 全部清退
- **WHEN** delta 对现有 capability 的全部且仅有 Requirements 执行可证明唯一的 REMOVED operations
- **THEN** plan MUST 把 canonical `spec.md` 标记为 expected absent并让隔离投影通过strict validation
- **AND** apply成功后文件 MUST不存在，receipt与observer MUST把absence确认为applied-and-matched

#### Scenario: 删除批次后续写入失败
- **WHEN** canonical applier已删除expected-absent spec但同批次后续文件提交失败
- **THEN** applier MUST从receipt-bound before content恢复被删除spec
- **AND** 整批 MUST NOT返回passed或留下before/expected混合状态

#### Scenario: expected-absent capability 已经不存在
- **WHEN** 同一完整REMOVED delta被重新规划且canonical capability spec已经不存在
- **THEN** planner MUST将该capability保持为expected absent并把每项删除标记为already-applied
- **AND** MUST NOT把它误判为缺少Purpose的新capability创建请求
