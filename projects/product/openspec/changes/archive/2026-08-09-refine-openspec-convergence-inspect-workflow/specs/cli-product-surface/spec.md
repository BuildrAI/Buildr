## MODIFIED Requirements

### Requirement: OpenSpec CLI help 不得恢复 Task Finish 的旧 Change authority
Buildr CLI MUST 只把 `openspec converge` 与 `openspec convergence inspect`描述为当前 OpenSpec maintenance 入口，并 MUST NOT 注册或帮助展示 `openspec audit`、`openspec baseline create`或`openspec check`。Task Finish current help MUST 明确 Change convergence、sync 与 archive 在 Development stable Content Target 之前完成，且正常Converge成功后不再要求Inspect。

#### Scenario: 查询当前 OpenSpec 帮助
- **WHEN** 用户查询root或OpenSpec maintenance帮助
- **THEN** CLI MUST展示`buildr openspec converge`与`buildr openspec convergence inspect`
- **AND** Inspect help MUST明确它只读取当前事务Receipt、不会写canonical/Receipt/archive，也不用于归档后长期审计

#### Scenario: 查询 OpenSpec 兼容入口帮助
- **WHEN** 用户查询或调用`buildr openspec audit`、`buildr help openspec baseline create`或`buildr help openspec check`
- **THEN** CLI MUST返回标准unknown-command诊断，并在适用时建议`openspec convergence inspect`或`openspec converge`
- **AND** MUST NOT读取或写入旧baseline、Receipt、canonical spec或archive状态

#### Scenario: 查询 Task Finish 帮助
- **WHEN** 用户查询canonical Task Finish help
- **THEN** help MUST说明Finish只消费current Development Handoff并执行carrier/delivery/cleanup
- **AND** MUST NOT列出OpenSpec command、Change convergence、Inspect、sync或archive为Finish operation

## ADDED Requirements

### Requirement: OpenSpec Convergence Inspect必须提供唯一公共JSON契约
Buildr CLI MUST让`buildr openspec convergence inspect <change> --project <project> --target <workspace> --json`返回`buildr.openspec-convergence-inspect/v1`，并以`passed|not-applicable|recovery-unprovable`表达当前恢复检查结果。Command catalog、topic help、dispatch、unknown-command candidates、JSON registry与验证 MUST从同一当前入口收敛，不得保留`openspecAudit`或`buildr.openspec-convergence-audit/v1`当前注册。

#### Scenario: Inspect适用于当前恢复现场
- **WHEN** active Change存在可读取的当前事务Receipt
- **THEN** CLI MUST返回逐文件分类、disposition、diagnostic和唯一next action
- **AND** status为`recovery-unprovable`时 MUST以非零状态退出

#### Scenario: Inspect不适用于未开始或已终结事务
- **WHEN** active Change尚未写Receipt或Change已经archived
- **THEN** CLI MUST返回`not-applicable`、稳定reason code和空files
- **AND** 该结果 MUST以成功状态退出且不得创建Receipt
