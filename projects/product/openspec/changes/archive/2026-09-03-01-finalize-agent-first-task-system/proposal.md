## Why

任务系统的主要专业模块已经完成智能体优先重构，但 Task Overview 仍重复聚合已有事实，Task Record 仍保存并暴露交付代理与派生重复字段，Task Record 写入的并发保护也未完全一致。与此同时，`task-manager` Skill 把确定性 Task Record 操作与父任务协调混在一起，形成了“一模块一个 Skill”的错误暗示。

这一步用于完成最后一次有界收敛：只保留不可替代的任务业务事实和真正需要智能体判断的 Skill，让当前规范、代码、SQLite、接口、Buildr Web 与测试重新一致。

## What Changes

- **BREAKING** 删除独立 Task Overview Application、Repository、HTTP `/tasks/:taskId/overview`、DTO、Buildr Web client 和专属测试；任务目标与结果直接由 Task Record detail 展示，Review 与 Verification 继续通过各自 inspect 读取。
- **BREAKING** 收窄 Task Record：删除 `result.noChange`、SQLite 行级 `schema_version`、Record 内派生 `childTaskIds` 及无消费者的重复查询字段；保留唯一 Task identity、目标、scope、Change、Parent、显式父任务身份、状态、结果摘要、更正历史与复盘摘要。
- 所有 Task Record mutation 除 create 外都必须提交已观察 `recordDigest`；终态更正历史从本次起补全 scope、Change 与父任务身份，既有缺失字段不补造。
- 自举激活只消费完成状态、Project scope、明确交付 ref 与真实 Git 结果，不再把 Task Record 字段当作交付证明。
- 统一使用“父任务协调（Task Parent Coordination）”，不再把当前能力称为“父子任务管理”；本 Change 暂不删除、新增或重命名任务相关 Skill，也不调整 Skill capability provider 模型。
- 删除无运行时消费者的 `terminal_contribution_reconciliations` 表、旧 Contribution Handoff/Planned Contribution 辅助实现及专属测试；`legacy_parent_plan_json` 仅保留明确历史展示，不参与当前父身份或完成观察。
- 收紧剩余 Task professional HTTP response schema，并从唯一 schema 源重新生成后端与 Buildr Web DTO。
- 收敛 CLI 帮助、Buildr Web 文案、canonical specs、当前认知、架构文档与术语表；不修改归档 Change，不恢复已删除模块。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-record`: 收窄持久字段和 read model，统一 mutation 并发保护，移除交付代理并补全未来更正历史。
- `task-overview-query`: 退役独立 Overview 能力，保留 Task detail 与独立专业 inspect。
- `parent-child-task-coordination`: 统一为父任务协调语义，移除旧 Contribution/Handoff 当前模型和历史对当前完成判断的影响。
- `task-professional-http-contracts`: 删除 Overview operation，并为剩余专业 GET 返回 closed response schema。
- `task-lifecycle-core-module-architecture`: 从 Task 模块图移除 Overview，保留 Record、Review、Verification 与父任务协调查询。
- `workspace-structured-data-store`: 通过连续 migration 删除 Task Record 冗余列和无消费者的旧贡献协调历史表。
- `task-closeout-orchestration`: 自举与收尾只使用真实交付 ref/Git 事实，不从 Task Record 推导交付。

## Impact

- Buildr Service：Task Domain/Application/Persistence、Bootstrap 模块注册、CLI/HTTP、SQLite migration、自举脚本与测试。
- Buildr Web：Task 详情读取、结果展示、父任务协调术语、专业 API client 与生成 DTO。
- Product：canonical specs、current knowledge、架构/流程/术语说明、验证 owner 清单。
- SQLite：保留 Task、Review、Verification、Parent、Retrospective 业务事实；明确删除已获授权的旧贡献协调 2 行历史，不建立备份、双读或替代表。
