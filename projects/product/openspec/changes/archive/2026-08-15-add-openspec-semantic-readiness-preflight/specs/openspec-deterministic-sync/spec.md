## ADDED Requirements

### Requirement: Deterministic planner必须提供只读语义就绪预检
Buildr MUST 在 OpenSpec Change 进入 Planning Review 前提供只读 semantic readiness preflight，并 MUST 复用最终 convergence 使用的 active conflict detection、`createConvergencePlan` 与 projected strict validation。Preflight MUST读取当前 delta、canonical specs、全部 active Change observations 和 OpenSpec executable/algorithm identity，但 MUST NOT检查实现期 checklist、创建 Convergence Receipt、写 canonical、确认 actual Project或执行archive。

#### Scenario: 当前Change语义就绪
- **WHEN** delta 与当前 canonical 可产生唯一 plan、没有 active Requirement conflict，且完整 expected Project 通过绑定 executable 的 strict validation
- **THEN** preflight MUST返回`ready`、同一 planner 产生的operations/files与`effects: []`
- **AND** MUST不创建sidecar、canonical mutation或archive状态

#### Scenario: 完整MODIFIED省略既有Scenario
- **WHEN** planner确认delta省略当前canonical Requirement中的既有Scenario identity
- **THEN** preflight MUST返回`blocked`与`scenario-omission` category
- **AND** MUST保留planner的Requirement和`omittedScenarioIdentities`诊断，不得自动补回或删除Scenario

#### Scenario: Rename或identity无法唯一证明
- **WHEN** Requirement或Scenario identity重复、rename目标被占用、ADDED identity已有不同内容或其他identity不能唯一解析
- **THEN** preflight MUST返回`blocked`与`identity-conflict` category及底层planner code
- **AND** MUST不生成可执行写入资格

### Requirement: 语义就绪结果必须绑定当前完整观察
Preflight MUST 产生稳定`readinessIdentity`，绑定change、project、plan identity、delta digest、canonical before facts、按确定顺序排列的全部active Change id/delta observation，以及OpenSpec executable/algorithm identity。任一输入变化后旧结果 MUST视为陈旧；`converge` MUST始终重新读取当前事实、重新规划和重新验证，并 MUST NOT接受preflight结果作为apply授权。

#### Scenario: Preflight后canonical或active Change变化
- **WHEN** ready结果形成后canonical spec、delta、active Change set/content、executable或algorithm identity发生变化
- **THEN** 再次preflight MUST产生不同readiness identity或不同状态
- **AND**最终converge MUST基于变化后的事实重新检查而不得复用旧ready

#### Scenario: 输入保持不变
- **WHEN** 相同规范化delta、canonical、active Change observations、executable与algorithm identity重复执行preflight
- **THEN** 结果 MUST产生相同readiness identity、plan identity、operations和blocker分类
- **AND**duration等非identity运行数据 MUST不影响identity
