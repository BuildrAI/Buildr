## ADDED Requirements

### Requirement: 正式验证必须绑定 Workspace Node identity
Buildr Verification MUST 使用 Workspace Node execution environment 启动 `node`、`npm`、测试和子进程，并 MUST 把 Node identity 纳入 `buildr.verification-run/v1` evidence identity、公开结果和复用条件。

#### Scenario: PATH 前置其他 Node
- **WHEN** Workspace 声明 Node V 且普通 PATH 前方存在 Node 18 或其他版本
- **THEN** affected/Candidate verification 的 CLI、npm、测试与子进程 MUST 使用受管 Node V
- **AND** evidence MUST 记录 Node V identity 与实际 probe

#### Scenario: 复用匹配 evidence
- **WHEN** candidate、policy、assurance 与 Workspace Node identity 均和已通过 evidence 匹配
- **THEN** consumer MAY 复用该 evidence

#### Scenario: Node identity 漂移
- **WHEN** 当前 Workspace Node identity 与已有 evidence 不同、缺失或无法证明
- **THEN** 旧 evidence MUST NOT 可复用
- **AND** result MUST 给出 Node identity invalidation reason 并要求重新收敛和验证
