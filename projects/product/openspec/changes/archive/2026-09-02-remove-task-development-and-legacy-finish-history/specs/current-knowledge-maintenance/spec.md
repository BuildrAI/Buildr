## MODIFIED Requirements

### Requirement: Current Knowledge 必须按完成结论影响分类
Current Knowledge provider MUST在`reconcile|inspect`结果中区分`aligned|not-applicable|attention|blocked`。只有canonical spec、实现、registry、Brief或current knowledge冲突会造成当前Task错误完成结论时 MUST返回`blocked`；结果 MUST直接交给Agent判断，不得写入Development Receipt、统一decision或handoff。

#### Scenario: completion-critical conflict
- **WHEN** 当前知识与authority冲突会遗漏必要行为、风险、兼容性或验收事实
- **THEN** provider MUST返回`blocked`、冲突source identities与最小unresolved items
- **AND** Agent MUST只停止实际依赖该冲突的动作并保留无关工作

#### Scenario: explanatory drift
- **WHEN** 文档表述陈旧但不改变当前Task行为、authority、风险或完成判断
- **THEN** provider MUST返回`attention`与follow-up摘要
- **AND** Agent MUST允许当前Task继续完成，不得把attention升级为全局ready/blocked

#### Scenario: current tree已对齐
- **WHEN** Brief、受影响current knowledge、terminology与权威facts均对应current tree
- **THEN** provider MUST返回`aligned`或真实`not-applicable`
- **AND** MUST包含tree identity与source identities供Agent核对

### Requirement: Current Knowledge 不得规定固定研发顺序
Current Knowledge provider MUST允许Agent在实现、Review或Verification前后按需调用`assess|reconcile|inspect`，并 MUST以current tree identity表达结果范围。Provider MUST NOT把调用顺序、sidecar、文档完整度或自己的结果提升为Candidate、Verification、Review、交付或Task完成authority。

#### Scenario: Verification后发现解释性漂移
- **WHEN** Task Verification后provider发现只构成attention的解释性漂移
- **THEN** Agent MAY保留该结果并继续其他动作
- **AND** MUST不要求重复Verification或创建统一推进状态

#### Scenario: reconcile改变delivery bytes
- **WHEN** provider修订Brief或current knowledge并改变实际内容
- **THEN** Agent MUST重新核对受影响Review、Verification和交付依据
- **AND** MUST不以provider aligned声明复用旧bytes绑定的证据
