## REMOVED Requirements

### Requirement: terminal delivery association 必须与 Review current applicability 分离
**Reason**: Review Result 不再参与Development Handoff、Finish association或终态adoption判断。
**Migration**: 旧association保留在Finish历史payload；Review页面只展示Review Application保存的结果。

#### Scenario: 旧adoption状态不再投影
- **WHEN** completed Task同时存在Review Result与旧Finish association
- **THEN** Review read model MUST只返回保存的Review Result
- **AND** MUST不返回adopted-at-delivery

## ADDED Requirements

### Requirement: Task Review read model 必须独立于 Development 与 Finish
Task Review Application和Buildr Web GET MUST只读取Task Review current rows及Task identity。它们 MUST NOT读取Development Receipt、Candidate、Handoff、Finish association或Terminal Delivery projection。

#### Scenario: 没有Development的Task
- **WHEN** active或terminal Task存在Review Result但没有Development Receipt
- **THEN** Review inspect MUST正常返回两个slot
- **AND** MUST NOT产生Development missing diagnostic

#### Scenario: completed Task存在旧Finish association
- **WHEN** 旧Finish payload包含Review gate digest或target identity
- **THEN** Review页面 MUST不显示adopted-at-delivery或gate disposition
- **AND** 旧值只在Finish历史详情中保留
