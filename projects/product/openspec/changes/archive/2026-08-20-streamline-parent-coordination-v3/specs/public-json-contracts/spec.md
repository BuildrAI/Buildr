## ADDED Requirements

### Requirement: Parent Coordination 必须只发布单一 v3 紧凑结果
Buildr MUST 让全部 Parent coordination action 与业务错误返回 `buildr.parent-coordination-result/v3`，并 MUST 在同一结果中只保留一份 Plan、work item、binding、next action 与最终验收 readiness 表达。v2 MUST 在本版本终止，不得保留 alias、compatibility adapter 或按入口返回不同 major。

#### Scenario: Agent读取大型Parent
- **WHEN** Agent通过checkout或npm package运行任一`task parent` action并请求JSON
- **THEN** payload MUST声明`buildr.parent-coordination-result/v3`
- **AND** checkout、npm与HTTP MUST返回同一字段语义且不包含v2重复字段

#### Scenario: v2消费者迁移
- **WHEN** 消费者从v2升级到v3
- **THEN** migration MUST要求使用`plan`、顶层`contributions`、`prerequisitesSatisfied`、`startup.next`与`boundContributions`
- **AND** MUST不提供继续请求v2的开关或fallback
