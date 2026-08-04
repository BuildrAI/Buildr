## ADDED Requirements

### Requirement: Agent 必须通过唯一Metadata Publication Skill组合writers与Git Operations
Buildr workspace MUST安装唯一 `task-metadata-publication` Skill作为用户/consumer发布Task portable metadata的入口；该Skill MUST提供 `buildr.task-metadata-publication/v1`并required消费selected `buildr.git-operations/v1` provider。

#### Scenario: capability graph ready
- **WHEN** package与workspace runtime已同步
- **THEN** capability graph MUST把 `buildr.task-metadata-publication/v1`绑定到 `task-metadata-publication`
- **AND** consumer dependency MUST把 `buildr.git-operations/v1`解析到唯一selected provider

#### Scenario: Git Operations blocked
- **WHEN** required Git Operations binding invalid、unresolved或provider blocked
- **THEN** Metadata Publication MUST停止Git effects并报告next action
- **AND** MUST NOT回退到旧Git route或手写第二条executor

#### Scenario: description routing
- **WHEN**用户要求发布一个Task的portable metadata
- **THEN** `task-metadata-publication` description MUST覆盖该意图
- **AND** `task-finish`、`git-operations`与Buildr产品入口 MUST继续保持各自边界而不竞争同一顶层意图
