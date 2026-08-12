## ADDED Requirements

### Requirement: Finish run 必须支持安全自动执行
Buildr MUST 提供 safe execution 入口，在同一持久化 finish run 上自动推进已登记、可预检且授权边界确定的步骤。执行器 MUST 复用现有 attempt、fingerprint、lease、evidence 和 invalidation 语义，不得建立第二套完成状态。

#### Scenario: 正常路径自动推进
- **WHEN** 当前及后续步骤都有匹配的 safe handler、有效 execution binding 和所需授权
- **THEN** executor MUST 依次执行动作并提交结构化 completion，直到完成或到达非自动步骤
- **AND** result MUST 报告实际执行步骤、effects、evidence 和 wall-clock

#### Scenario: 遇到不安全或失败步骤
- **WHEN** handler 未登记、预检失败、identity 漂移、授权不足或动作失败
- **THEN** executor MUST 停止在当前 checkpoint 并返回 blocked/next action
- **AND** MUST NOT 重复已 passed effects 或自动扩大授权

#### Scenario: 并行只读 observation
- **WHEN** 同一步包含多个无依赖且无写副作用的 observation
- **THEN** executor MAY 并行执行这些 observation
- **AND** shared writes MUST 继续受现有 lease 与 fencing 约束
