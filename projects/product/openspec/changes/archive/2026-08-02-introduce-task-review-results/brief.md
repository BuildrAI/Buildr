# 引入任务审查结果（Task Review Result）

## 一句话摘要

为正式 Task 建立一个 Task Review 能力和 Planning/Completion 两个可选 current Result 槽位，用最小可移植数据记录目标、执行方式、覆盖、findings 与结论，并通过 target identity 派生适用性。

## 背景与问题

Buildr 目前只有一次性的通用 Change review prompt，以及面向长期资产 observation/复盘的 `task-asset-review`。两者都不能形成一份绑定当前方案或完成候选、可跨 Agent 恢复并由未来 Development handoff 引用的轻量 evidence。

Roadmap 已规划 Planning Review 与 Completion Review，但旧设计提前预设了 Result revision、两个结果默认门禁和重复 current 引用。P0.3 需要先把数据与 authority 边界做窄，不进入 Candidate、Review history 或通用状态机。

## 目标与非目标

目标是用同一 `TaskReviewResult` schema 维护两个互不覆盖的可选槽位；由唯一 Application 完成 closed schema 校验、原子写入、digest 和 read model；中断不覆盖 current；目标变化通过 identity mismatch 立即显示 stale；Local App 能查看并发起 Agent Review。

非目标是不实现 Task Development、Candidate generation、Review Run/history、finding lifecycle、审批流、Agent session proof 或 Review engine；不替代 Task Verification；不把 Review 字段写入 Task Record、Environment Receipt 或 Finish Receipt。

## 受影响用户或角色

- 需要审查方案或完成候选，并跨 session 恢复结论的 Agent 与维护者。
- 在 Local App Task 详情查看 Review coverage、findings、结论与适用性的人。
- 未来按 target/method/conclusion 消费 Review evidence 的 Task Development。
- 继续独占验证 execution/evidence 的 Task Verification，以及继续维护资产 observation 的 `task-asset-review`。

## 核心流程

正式 Task 已由 Task Manager 建立并通过 Task Environment 获得实际执行位置。Agent 根据用户、Project policy 或未来 Development 请求，以 `planning|completion` 参数调用同一个 `task-review` Skill；Skill 动态选择审阅对象并形成完整语义结论，随后由 Task Review Application 写入对应 current slot。Local App 和 CLI 只读同一 read model；current target identity 匹配时显示 current，不匹配显示 stale，目标未知显示 unknown。

Task 创建不产生 Review 占位，也不要求两种 Review。未来形成 handoff 时，Development 只冻结实际采用 Result 的 digest、target identity、method 与最小结论，不复制 findings/coverage，也不持续维护第二套 current pointer。

## 关键变化

- 新增一个 `buildr.task-review/v1` capability、一个 `task-review` Skill 和唯一 Task Review Application。
- canonical `.buildr/tasks/<task-id>/reviews/planning.yml|completion.yml` 使用同一 closed `buildr.task-review-result/v1` schema；两个槽位均为 `0..1`。
- v1 只保存 Task/type、opaque target identity、`self|independent-agent|human`、reviewed、uncovered、findings、`ready|changes-required` 结论和系统 completedAt。
- Result 不保存 revision、digest、current 或 applicability；reader 返回 response-only `resultDigest` 并派生 `current|stale|unknown`。
- 只有完整 Review 正常结束后才原子替换同类型文件；中断、无结论或写入失败保持旧 bytes 和 sibling records。
- 公共 CLI 只提供 `task review inspect|record`，不执行 Review、不生成 plan/Candidate identity。
- Local App Task 详情新增只读“审查”页签和 Agent action；不提供 Result 编辑、历史或 finding 工作流。
- Task-scoped Change 审查切到 Planning Review；全局 retained-only Change review 和 `task-asset-review` 保持各自原有 authority。
- 没有旧 Task Review store 需要数据迁移；只切换冲突 route/fixture，并保留未知 sibling 用户数据。

## 影响、风险与兼容性

这是一项新增 capability，并对正式 Task-scoped Change review route 做单次替换。P0.5 之前没有正式 Candidate identity，因此 Completion Result 只有在调用方明确提供 Candidate identity 时才能记录；Local App 可能显示 unknown，这是 fail closed 而不是缺陷。

首版不处理同 Task/type 并发 writer，也不为 future finding/search/policy 预设字段。出现真实直接 UI authoring 或并发需求后再评估 response digest precondition/schema v2。回滚不得删除已经生成的可移植 Result 文件。

## 验收摘要

- 新 Task 不生成占位；Planning 与 Completion 可以分别缺失、单独存在或同时存在。
- 两种类型共用一个 schema/Application/Skill，写一种不会改另一种或其他 Task records。
- Result 无 revision；相同 canonical bytes digest 稳定，目标 mismatch 时 read model 返回 stale。
- 中断、无完整结论与注入写入失败都不覆盖旧 current。
- CLI、package、runtime 与 Local App 使用同一 read model；Task Record/Environment 不出现 Review 字段。
- Task-scoped Change route 只进入 Planning Review；全局普通 review 与 Task Asset Review 不受影响。
- 候选只在 task worktree/临时 Workspace 验证，集成和 retained sync/doctor 后才宣称 P0.3 生效。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specs](specs/)
- [Implementation tasks](tasks.md)
