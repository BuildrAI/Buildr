## ADDED Requirements

### Requirement: 终态 Child Contribution 交付恢复必须由严格证据保护
Buildr MUST 为已 completed、非 no-change 且具有 matching terminal Finish association，但缺少原生 Contribution Handoff 的直接 Child 提供显式 terminal contribution reconciliation；该动作 MUST 绑定 current Parent Plan identity、真实 Parent/Child 关系、既有 immutable Development handoff、Candidate/generation、三个 gate、archived Change facts、完整 Contribution Handoff、reason 与 source，并 MUST NOT从 Task status、Git、文件或 canonical specs 推断交付。

#### Scenario: 恢复真实已交付 Child
- **WHEN** completed Child 的 terminal Finish association 精确匹配没有原生 Contribution Handoff 的 immutable handoff，全部 Change 已 archived，调用方基于 current Parent Plan 显式提交无 ownership 冲突的完整 Contribution Handoff
- **THEN** Application MUST append 一条绑定既有 handoff 与 Plan identity 的 immutable reconciliation evidence
- **AND** MUST保持旧 handoff、Finish terminal payload、Task Record 与 Parent Plan bytes不变

#### Scenario: 缺少正式交付关联
- **WHEN** Child 只有 completed status、Git commit、文件或 archived Change，但没有 matching terminal Finish association与 immutable handoff
- **THEN** reconciliation MUST在零写入状态返回blocked
- **AND** MUST NOT把这些辅助事实升级为 Contribution delivery

#### Scenario: 正常 Child 尝试提前使用恢复
- **WHEN** Child仍为 todo、active、abandoned，或其 matching handoff 已包含原生 Contribution Handoff
- **THEN** reconciliation MUST返回not-applicable或blocked
- **AND** normal bind、handoff与Finish路径 MUST保持唯一常规交付路径

### Requirement: Parent progress 必须消费合法恢复证据且保留来源
Parent Coordination Application MUST优先消费 matching immutable handoff 内的原生 Contribution Handoff，并且仅在原生证明缺失时消费绑定 current Plan references 的 terminal reconciliation evidence；read model MUST返回 proof kind 与适用的 reconciliation identity，仍 MUST动态派生Contribution disposition而不物化progress。

#### Scenario: 恢复证据使 unproven 变为 delivered
- **WHEN** completed Child具有合法 terminal reconciliation，且其中 delivered Contribution仍属于current Parent Plan
- **THEN** Parent read model MUST将该Child标记为delivery proven并将对应Contribution派生为delivered
- **AND** delivery summary MUST标明proof为terminal-reconciliation

#### Scenario: 恢复证据与current Plan不兼容
- **WHEN** Parent Plan reconcile后恢复证据引用的Contribution已不存在或语义不再可匹配
- **THEN** Parent read model MUST不消费该evidence形成delivered结论
- **AND** MUST返回精确diagnostic而不是扫描其他事实修补

### Requirement: 终态恢复必须幂等且拒绝交付 owner 冲突
Terminal contribution reconciliation MUST按Child与规范化evidence identity保持append-only；相同请求重放 MUST返回unchanged，不同请求覆盖既有evidence、或 planned / delivered Contribution已由其他Child绑定或证明时 MUST零写入失败。

#### Scenario: 相同恢复重放
- **WHEN** caller以相同Parent Plan、handoff association、Contribution Handoff、reason与source重复提交
- **THEN** Application MUST返回unchanged与原reconciliation identity
- **AND** MUST NOT新增第二条记录或改写createdAt

#### Scenario: Contribution owner 冲突
- **WHEN** 请求planned或delivered的Contribution已由另一个Child的原生或恢复evidence拥有
- **THEN** Application MUST返回精确owner conflict
- **AND** MUST保持全部Task Development与reconciliation事实不变
