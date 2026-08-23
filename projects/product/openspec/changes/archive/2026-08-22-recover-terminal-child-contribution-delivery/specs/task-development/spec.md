## ADDED Requirements

### Requirement: Task Development 必须拥有终态 Contribution reconciliation evidence
Task Development Application MUST作为 terminal contribution reconciliation 的唯一 writer，保存独立于 Development Receipt 与 immutable handoff 的 closed append-only evidence；该evidence MUST引用既有 terminal Finish association与handoff identity，并 MUST NOT修改或替代原Development Receipt、Candidate、gates、decision、handoff或Finish facts。

#### Scenario: 写入一次恢复 evidence
- **WHEN** 严格恢复前置条件全部满足且同一Child尚无reconciliation
- **THEN** Task Development MUST事务化写入一条内容寻址的reconciliation evidence并写后验证
- **AND** operation result MUST返回identity、proof source、effects与更新后的Parent Coordination projection

#### Scenario: 写入失败
- **WHEN** serialization、constraint、busy、post-read、Plan drift、handoff mismatch或ownership validation任一失败
- **THEN** transaction MUST完整rollback
- **AND** MUST保留原Development、Finish与reconciliation facts

### Requirement: 终态恢复输入必须由 action contract 发现
Task Development / Parent Coordination 恢复入口 MUST提供closed机器可读输入schema、示例和CLI帮助，静态schema MUST区分结构约束与运行态Parent Plan、Task、handoff、Finish及ownership校验；发现操作 MUST零Workspace读取和零写入。

#### Scenario: 查看恢复schema
- **WHEN** Agent在没有执行恢复的情况下请求reconcile-child-delivery schema或example
- **THEN** CLI MUST返回closed Contribution Handoff输入、必需expected Plan、reason与source说明
- **AND** MUST不compose runtime、不访问SQLite或产生effect

### Requirement: 恢复 evidence 不得成为 normal Child 流程替代
Task Development workflow MUST继续要求 active Child 在正式 handoff 中提交 Contribution Handoff；terminal reconciliation MUST只作为已完成交付的异常恢复，不得允许Agent预先省略planned binding、Contribution Handoff、Verification、Completion Review或Finish。

#### Scenario: Agent准备正常Child handoff
- **WHEN** active Child承担Parent Contribution并准备形成current Finish handoff
- **THEN** Task Development MUST仍要求planned binding与同一immutable handoff内的Contribution Handoff
- **AND** Skill MUST NOT建议先完成Task再使用terminal reconciliation
