## ADDED Requirements

### Requirement: 产品入口 Buildr Skill 路由 Task Retrospective
产品内置 Buildr Skill MUST 在用户明确要求任务复盘时路由到 selected `buildr.task-retrospective/v1` provider，并 MUST 将该入口限制为 terminal Task 的 Agent 执行效率复盘。

#### Scenario: 用户明确要求任务复盘
- **WHEN** 用户要求复盘已完成或已放弃 Task 的执行效率
- **THEN** Buildr Skill MUST 引导 Agent 使用 selected Task Retrospective provider
- **AND** MUST NOT恢复过程 observation、资产候选或 lifecycle gate

#### Scenario: Runtime 找不到 provider
- **WHEN** capability graph 表示 provider 应存在但 runtime 无法发现
- **THEN** Buildr Skill MUST 引导 Agent 检查 builtin、workspace source、binding 和 runtime 投射

### Requirement: 产品入口按 current capability 路由复盘意图
产品入口 Buildr Skill MUST 将明确的 terminal Task 执行效率复盘路由到 `buildr.task-retrospective/v1` selected provider，并 MUST NOT 将 builtin Skill id 当作不可替换入口。

#### Scenario: 路由 Task Retrospective
- **WHEN** 用户明确要求复盘 terminal Task 的 Agent 执行效率
- **THEN** Buildr Skill MUST 使用当前 capability graph 的 v1 selected provider
- **AND** Buildr Skill MUST honor blocked semantics

#### Scenario: 用户替换 provider
- **WHEN** workspace 绑定兼容的内部 v1 provider
- **THEN** Buildr Skill MUST 路由到该 provider而不要求 `task-retrospective` Skill id

## REMOVED Requirements

### Requirement: 产品入口 Buildr Skill 路由任务资产沉淀审查
**Reason**: 过程资产观察与沉淀审查能力已完整退役。
**Migration**: 用户明确的terminal Task执行效率复盘改由“产品入口 Buildr Skill 路由 Task Retrospective”处理。

### Requirement: 产品入口按 capability 路由用户意图
**Reason**: 旧Requirement只路由Task Asset Review v2 observation/finalize语义。
**Migration**: 由“产品入口按 current capability 路由复盘意图”替代。
