## ADDED Requirements

### Requirement: Task Development 必须在稳定目标后优先消费正式验证计划
当 Content Target current 且 verification policy 尚未 current 时，Task Development 的推荐下一步 MUST 指向先形成并复核 closed Formal Verification Plan，再从该 Plan 派生 policy 输入；只有 policy current 后才推荐 freeze Candidate。该推荐 MUST保持为可替代工作流，不得自动 prepare、写policy、freeze或执行验证，也不得阻止无关开发与有界非正式反馈。

#### Scenario: 稳定目标尚无policy
- **WHEN** active Task 的Planning gate与Content Target current，但verification policy missing或stale
- **THEN** `task next` MUST推荐由Task Verification先执行plan-and-derive-policy
- **AND** MUST不先推荐freeze或自动执行任何mutation

#### Scenario: Agent选择合法降级路径
- **WHEN** current Plan暂不可用但Agent仍在既有授权和安全边界内继续无关开发、focused feedback或声明默认policy发现
- **THEN** Buildr MUST不把Plan-first推荐升级为通用许可门禁
- **AND** 未形成matching Formal Verification authority前不得声称正式验证完成

### Requirement: Task Development policy discovery 必须消费Task Verification的closed投影
Task Development discover MUST允许调用方提供按有效Project完整覆盖的closed Formal Verification Plan documents，并 MUST只通过Task Verification Application取得Plan-derived policy input。它 MUST返回selected capabilities、coverage gaps、空默认overrides、response-only not-selected disposition与Plan/declaration identities；MUST不把Plan、preparation或not-selected摘要写入Development Receipt。

#### Scenario: current Plans完整覆盖Task
- **WHEN** 每个有效Project均提供identity、target、declaration和capability current的task-delivery Plan
- **THEN** discover MUST返回可直接交给policy writer的closed输入，并把Plan selected capability设为required
- **AND** MUST确定性列出current declaration中可用于task-delivery但未被Plan选择的capability

#### Scenario: Plan集合不完整或陈旧
- **WHEN** Project缺失、重复，或任一Plan的closed identity、target、declaration、capability不匹配current facts
- **THEN** discover MUST零写入失败并返回精确diagnostic
- **AND** MUST不回退猜测selected capability或静默使用旧policy

