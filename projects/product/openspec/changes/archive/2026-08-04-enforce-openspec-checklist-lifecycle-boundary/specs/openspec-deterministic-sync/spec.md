## ADDED Requirements

### Requirement: Convergence transaction 必须在任何写入前门禁 Change checklist
Buildr MUST 在 active Change 的 canonical planning、receipt写入、canonical apply和archive之前，以与Change read model相同的Markdown checkbox语义检查现有`tasks.md`。存在任一未完成checkbox时，convergence MUST返回`blocked`与稳定的checklist progress，且不得写receipt、canonical spec或调用archive；Buildr MUST NOT自动勾选、删除或把归档后Task lifecycle evidence解释为Change task完成。

#### Scenario: Change仍有未完成checkbox
- **WHEN** active Change的`tasks.md`同时包含已完成与未完成checkbox
- **THEN** `buildr openspec converge` MUST返回`change-checklist-incomplete`及`completed`、`total`、`remaining`
- **AND** canonical files、convergence receipt与archive lifecycle MUST保持不变

#### Scenario: Change checklist已经闭合
- **WHEN** active Change的全部checkbox均已完成且其他convergence门禁通过
- **THEN** transaction MUST继续执行确定性planning、validation、apply、confirmation与archive
- **AND** archive后Task Development、Task Finish、Metadata Publication、Environment cleanup与Task terminal evidence MUST由各自authority形成，不得回写archive checkbox
