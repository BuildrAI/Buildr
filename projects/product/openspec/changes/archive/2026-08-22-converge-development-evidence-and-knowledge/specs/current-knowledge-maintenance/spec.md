## ADDED Requirements

### Requirement: Current Knowledge 必须按完成结论影响分类
Current Knowledge provider MUST在`reconcile|inspect`结果中区分`aligned|not-applicable|attention|blocked`。只有canonical spec、实现、registry、Brief或current knowledge冲突会造成当前Task错误完成结论时 MUST返回`blocked`；解释性漂移、无关历史债务或不改变当前行为与authority的缺口 MUST返回`attention`并提供portable follow-up摘要。

#### Scenario: completion-critical conflict
- **WHEN** 当前知识与authority冲突会让handoff遗漏必要行为、风险、兼容性或验收事实
- **THEN** provider MUST返回`blocked`、冲突source identities与最小unresolved items
- **AND** consumer MUST阻止handoff但不得阻止无关开发或只读调查

#### Scenario: explanatory drift
- **WHEN** 文档表述陈旧但不改变当前Task行为、authority、风险或完成判断
- **THEN** provider MUST返回`attention`与follow-up摘要
- **AND** consumer MUST允许当前Task继续完成，不得把attention升级为全局ready/blocked

#### Scenario: current tree已对齐
- **WHEN** Brief、受影响current knowledge、terminology与权威facts均对应current tree
- **THEN** provider MUST返回`aligned`或真实`not-applicable`
- **AND** MUST包含tree identity与source identities供Development保存最小disposition

### Requirement: Current Knowledge 不得规定固定研发顺序
Current Knowledge provider MUST允许consumer在实现、Review或Verification前后按需调用`assess|reconcile|inspect`，并 MUST以current tree identity决定结果适用性。Provider MUST NOT把自己的调用顺序、sidecar存在或文档完整度提升为Candidate、Verification或Review authority。

#### Scenario: Verification后发现解释性漂移
- **WHEN** matching Formal Verification已完成后provider发现只构成attention的解释性漂移
- **THEN** Development MAY保存attention并继续handoff
- **AND** MUST不要求重复Verification或改变Candidate generation

#### Scenario: reconcile改变delivery bytes
- **WHEN** provider修订Brief或current knowledge并改变Content Target
- **THEN** consumer MUST重新观察Content Target并使旧Candidate、Verification、Completion与handoff失效
- **AND** MUST不以provider aligned声明复用旧bytes绑定的证据
