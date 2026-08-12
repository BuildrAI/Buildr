## ADDED Requirements

### Requirement: 测试建设与 Task Verification 必须使用独立入口
Buildr product Skill、task-triage 和 builtin descriptions MUST 将测试框架设计、测试分层、编排策略和为实现任务开发测试的意图路由到 `project-testing`；将 Project 能力声明、已有能力执行、transient evidence 和 current Task Verification Result 路由到 selected `buildr.task-verification/v3` provider。两个 Skill MAY 在同一任务中先后使用，但 MUST NOT 互相维护状态、声明 provider dependency 或接管对方 authority。

#### Scenario: 实现完成后补充测试再验证任务
- **WHEN** Agent 完成功能实现，需要先开发项目测试，再形成正式 Task Verification Result
- **THEN** Agent MUST 先使用 `project-testing` 按项目约定补充适量测试
- **AND** 测试入口稳定并已由 Project 声明后 MUST 使用 `task-verification` 选择和执行 capability

#### Scenario: runtime 发现两个独立 Skill
- **WHEN** supported Agent runtime 完成 Buildr sync 或 render
- **THEN** runtime MUST 同时发现 `project-testing` 与 `task-verification`
- **AND** `project-testing` MUST 不提供 Task Verification capability binding 或 Result authority
