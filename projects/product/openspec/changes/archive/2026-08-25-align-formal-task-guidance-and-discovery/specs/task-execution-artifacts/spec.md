## MODIFIED Requirements

### Requirement: Formal Verification stdout 必须默认投影 Execution Record compact summary
Formal `verification run --json` MUST缺省返回 `buildr.long-running-operation-summary/v1`，并 MUST在显式 `--detail full` 时返回既有 canonical Verification execution payload。compact summary MUST从同一 Task Execution Record与 terminal execution facts投影 record/run/invocation/result identity、状态、selected capability阶段摘要、primary failure、transient cleanup与唯一 record inspect pointer；MUST不返回 evidence locator、本机 root/executable、完整 checks、diagnostics或 stdout/stderr。在 pre-admission preparation blocked 且尚无 durable Execution Record 时，compact summary MUST保持`recovery: null`，并在 primary failure 中明确要求对同一 invocation追加`--detail full`取得既有Plan request。

#### Scenario: formal Verification terminal success
- **WHEN** runner已seal matching passed Execution Record并完成或尝试 transient cleanup
- **THEN** 默认 stdout MUST返回 terminal passed compact summary与该 record inspect pointer
- **AND** full execution payload MUST继续存在于受控 evidence/Execution Record正文并可显式读取

#### Scenario: matching active duplicate
- **WHEN** 相同 invocation identity已有 open Execution Record且调用方未显式 `--retry`
- **THEN** runner MUST返回 `terminal: false`、`status: running`、同一 record/run identity与 inspect pointer
- **AND** MUST不启动 capability、新建record或生成新的 transient evidence

#### Scenario: 客户端断连后 producer 已完成
- **WHEN** 调用方未收到 terminal stdout，但 matching Execution Record 已retained
- **THEN** record inspect MUST返回真实 terminal outcome与 compact execution facts
- **AND** 后续普通 invocation MUST复用既有 terminal duplicate语义，不得因 stdout 缺失重复昂贵验证

#### Scenario: preparation blocked 尚无 durable identity
- **WHEN** Formal Verification 在创建 Execution Record 前因 Task Environment preparation blocked 返回
- **THEN** compact summary MUST返回原错误 code、指向同一 invocation `--detail full` 的可操作 message与`recovery: null`
- **AND** full payload MUST继续从既有`admission.recovery.planRequest`返回Agent可原样登记的Plan request
- **AND** compact projection MUST不内联Plan request或创建新恢复 authority
