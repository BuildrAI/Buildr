## ADDED Requirements

### Requirement: 多Project Current Knowledge必须按Project完整聚合
Task Development MUST只接受精确覆盖Task有效Project集合的Current Knowledge dispositions。每个Project disposition MUST绑定Project、current Content Target、`aligned|not-applicable|attention|blocked`、summary、source identities与bounded unresolved items；顶层Current Knowledge状态 MUST由完整Project集合确定性派生，且 MUST不复制知识正文。

#### Scenario: 每个Project均形成disposition
- **WHEN** 多Project Task的每个有效Project均提供绑定同一current Content Target的Current Knowledge result
- **THEN** Development MUST按Project排序保存最小disposition集合并形成Task级identity
- **AND** 非blocked的完整集合 MAY满足handoff的Current Knowledge前置

#### Scenario: 缺少一个Project
- **WHEN** Current Knowledge输入遗漏任一有效Project
- **THEN** Development MUST拒绝记录Task级current disposition并列出缺失Project
- **AND** MUST不让单Project aligned结果代表整个Task

#### Scenario: 任一Project blocked
- **WHEN** 任一Project disposition为blocked且包含completion-critical unresolved items
- **THEN** Task级Current Knowledge MUST为blocked并阻止handoff
- **AND** 其他Project aligned MUST保持可见但不得覆盖该blocker

### Requirement: Candidate必须绑定policy而非持久化Formal Plan集合
Task Candidate MUST继续绑定current verification policy identity，Formal Plan documents与Plan identities MUST保持transient且不得进入Candidate、Development Receipt或Verification Result。Formal execution MUST在各Project Execution Record内绑定Plan；Development MUST通过Result对policy required capabilities与coverage gaps的完整覆盖决定Verification gate是否可用。

#### Scenario: Result缺少policy required fact
- **WHEN** records均绑定合法Project Plans但Result缺少current policy中的required capability fact
- **THEN** Development MUST保持Verification coverage incomplete并阻止proceed/handoff
- **AND** MUST不因Plan本身ready或其他Project通过而满足gate

#### Scenario: 不同Plan产生相同完整policy facts
- **WHEN** Project Plan identity变化但current Candidate、target、declaration和policy required facts仍由matching terminal authority完整覆盖
- **THEN** Development MUST只按current Result与policy coverage判断gate
- **AND** MUST不建立第二Plan store或把Plan identity加入Candidate
