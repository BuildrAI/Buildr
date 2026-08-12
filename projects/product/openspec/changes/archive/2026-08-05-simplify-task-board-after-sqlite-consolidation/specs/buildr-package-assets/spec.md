## MODIFIED Requirements

### Requirement: task-triage 必须条件消费 Task Record capability
Buildr package MUST 为 `task-triage` 提供 optional `buildr.task-record@1` consumer edge，并 MUST 让 Skill source 在 formal execution 分支首次持久写入前调用 selected provider；该依赖 MUST NOT 阻塞纯讨论、只读或 Task 外操作。

#### Scenario: 检查 capability graph
- **WHEN** package verification 检查当前 capability graph
- **THEN** graph MUST 包含 `buildr.task-record@1`、default `task-manager` provider/binding 和 `task-triage` optional consumer edge
- **AND** MUST NOT 给 task-worktree、task-verification、task-finish、task-asset-review 或 git-operations 增加 Task Record consumer edge

#### Scenario: 正式分支 provider 不 ready
- **WHEN** task-triage 已确认即将进入正式持久交付但 Task Record provider 不 ready
- **THEN** execution/write 分支 MUST fail closed 并报告 readiness 与 next action
- **AND** semantic triage result MUST 保持可见

#### Scenario: 旧专业模块继续运行
- **WHEN** 正式 Task 调用当前 worktree、Verification、Task Finish、Asset Review 或 Git 路径
- **THEN** 它们 MUST 继续只维护自己的专业 receipt/result/store
- **AND** MUST NOT 自动回填专业字段到 Task Record

## ADDED Requirements

### Requirement: Package 不得继续发布退役的静态 Task Board
Buildr package、workspace baseline、bootstrap contract、runtime navigation 与 static validation MUST NOT 声明或要求 `task-board` Skill、`buildr.task-board-maintenance/v1` contract、provider、binding 或 HTML template；package check MUST 继续保证其他已声明能力的 manifest-first 完整性。

#### Scenario: 校验当前 package
- **WHEN** Agent 运行 `buildr package check`
- **THEN** Task Board Skill、contract、binding、template 与专属 validation MUST 不在当前 package graph 中
- **AND** 其他 builtin replacement、capability contract 与 provider validation MUST 继续生效

#### Scenario: 构建 runtime 投射
- **WHEN** Buildr 从当前 package 渲染或同步 Agent runtime
- **THEN** runtime MUST NOT 发现 `task-board` 入口或 Task Board capability metadata
- **AND** Task、Parent/Child 与专业 read model 的当前能力 MUST 不受影响
