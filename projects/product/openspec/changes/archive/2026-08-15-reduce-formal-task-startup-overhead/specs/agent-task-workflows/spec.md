## ADDED Requirements

### Requirement: Formal Task 启动必须优先使用 compact entry surface
Buildr内置task-triage与task-development guidance MUST在正式Task创建或恢复后优先读取Task Entry Snapshot，并只加载其current next action所指向的Skill、contract与provider。Agent MUST不把完整capability graph或下游lifecycle Skill列表当作启动依赖表。

#### Scenario: 创建 active Task 后启动
- **WHEN** Agent刚创建或恢复active formal Task
- **THEN** Agent MUST立即通过Snapshot确定Environment前置并准备或恢复Environment
- **AND** MUST不为了未来阶段预读Review、Verification或Finish provider

#### Scenario: next action 改变
- **WHEN** 一次正式动作使Snapshot的typed next发生变化
- **THEN** Agent MUST按新next加载对应action-local contract/provider
- **AND** 之前未成为next的专业能力 MUST不因完整lifecycle预想而提前加载

### Requirement: workflow guidance 必须保留用户调整边界
Buildr guidance MUST把Snapshot `required`解释为不可安全绕过的authority前置，把`recommended`解释为可由用户根据实际情况调整的默认路径。guidance MUST不把wall-clock参考目标、调用次数或recommendation编码为gate、自动推进或成功条件。

#### Scenario: 用户选择合法替代动作
- **WHEN** 用户基于当前事实调整recommended顺序、验证范围或专业provider
- **THEN** Agent MUST通过对应owner contract核验并执行该选择
- **AND** MUST不要求修改Snapshot、伪造next或绕过既有fail-closed authority
