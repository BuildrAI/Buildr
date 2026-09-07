## MODIFIED Requirements

### Requirement: Task 生命周期核心必须归属 Task 模块的明确技术分层
Buildr MUST将Task Record、Review、Verification Result、父任务协调查询、Worktree 与 Task-scoped Change/Preview 读取归入`src/modules/task`。Task Overview、Task Environment、Task Development、旧Finish、Retrospective Application与其他退役模块 MUST不存在；通用 OpenSpec MUST归入`src/modules/openspec`而不是Task内部。

#### Scenario: 检查生产源码归属
- **WHEN** 架构验证扫描Task实现
- **THEN** 每个保留能力 MUST只有一个owner
- **AND** MUST不存在Overview descriptor、Repository、Application、HTTP contribution或旧`src/task`入口
- **AND** Task MUST只通过 OpenSpec 公开 query/application capability 读取通用规范事实
