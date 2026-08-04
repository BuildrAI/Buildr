## MODIFIED Requirements

### Requirement: task-manager Skill 必须作为 Task Record 的薄管理入口
Buildr MUST交付名为 `task-manager` 的 workspace Skill，并 MUST用精确 routing description 将它限制在 Agent 对正式 Task Record 的创建、按 Task ID 恢复、查看、更新和结束；Skill MUST通过 selected `buildr.task-record/v1` provider 执行，不得成为全局任务 dispatcher。Local App MUST作为同一 Task Record Application 的独立人类客户端，不通过 Skill routing 写记录；任一客户端 MUST NOT直接访问 SQLite、SQL 或 migration scripts。

#### Scenario: 用户明确管理正式 Task
- **WHEN** 用户要求创建正式 Task、查看或修改 Task 顶层事实、按 Task ID 恢复或结束 Task
- **THEN** Agent MUST使用 `task-manager` 并报告实际 operation、Task ID、status 和 effects
- **AND** 后续 Environment、Development、Review、Verification、Git、Finish、Board 与 Retrospective MUST继续由各自专业能力负责

#### Scenario: 用户按 Task ID 继续工作
- **WHEN** 用户或 Agent 提供已有 Task ID 并要求恢复或继续
- **THEN** `task-manager` MUST先 inspect canonical Task Record
- **AND** MUST只从 title、intent、scope、changes、status 和 result 恢复顶层事实，不得从 Task Record 推断运行环境、数据库结构或专业阶段状态

#### Scenario: 人先在 Local App 创建 Task
- **WHEN** 用户在 Local App 创建 active Task，随后要求 Agent 按该 Task ID 继续
- **THEN** `task-manager` MUST inspect 同一 canonical logical Task Record 并核对 intent/scope
- **AND** MUST NOT重新 create、把 Local App 记录视为低权威副本或要求用户重复输入顶层事实

#### Scenario: 普通任务请求
- **WHEN** 用户只提出修复、实现、重构、文档、测试、纯讨论或只读探索
- **THEN** `task-manager` MUST NOT仅因出现“任务”而抢占入口
- **AND** Agent MUST先按现有语义入口判断是否已经形成正式持久交付 Task

#### Scenario: Skill 返回存储细节
- **WHEN** Task action 成功或 blocked
- **THEN** `task-manager` MUST只报告 Application 的领域结果、digest、effects、diagnostic 和 nextActions
- **AND** MUST NOT要求用户编辑 SQLite、运行 SQL、修改 migration ledger 或处理 database path
