## MODIFIED Requirements

### Requirement: Deterministic planner必须提供只读语义就绪预检
Buildr MUST在OpenSpec Change进入apply前提供只读semantic readiness preflight，并复用最终convergence的active conflict detection、planner与projected strict validation。Preflight只证明当前规范语义可执行，不拥有Task Review，也不把Review作为apply许可。

#### Scenario: 当前Change语义就绪
- **WHEN** delta与canonical产生唯一plan、没有active conflict且projected strict validation通过
- **THEN** preflight MUST返回ready、operations/files与零effects
- **AND** next action MUST进入planning identity/apply，并说明Review由Agent独立判断

#### Scenario: 完整MODIFIED省略既有Scenario
- **WHEN** planner确认delta省略canonical Requirement的既有Scenario identity
- **THEN** preflight MUST返回blocked与scenario-omission
- **AND** MUST保留omittedScenarioIdentities且不自动补回或删除

#### Scenario: Rename或identity无法唯一证明
- **WHEN** Requirement或Scenario identity不能唯一解析
- **THEN** preflight MUST返回blocked与identity-conflict及底层code
- **AND** MUST不生成可执行写入资格或Review占位
