# 收敛 Task Finish 状态表

## 一句话摘要

把 Task Finish 的四张专业状态表收敛为每个 Task 一行的 `task_finish_current`，保持公开五阶段与交付语义不变。

## 背景与问题

当前 run、prepared/terminal completion、target lease 与 transient artifact metadata 分散在四张表中。同一 Task 的 current 与 cleanup 进度需要跨表同步，Overview 和 Terminal Delivery 也要理解多份内部 authority；其中 transient artifact metadata 还没有生产 writer。

## 目标 / 非目标

目标是用一行普通查询字段、受验证的固定 `phases_json` 与有界 detail payload 表达 current 或 terminal Finish 状态，并把 target lease 内嵌到 owner row。连续 migration 安全迁移旧状态后删除旧四表。

本次不接入 Task Finish execution-record producer，不改变固定五阶段、CLI/Local App 结果、Git delivery、Development handoff、Task Environment cleanup 或 Task Record terminal authority。

## 受影响用户或角色

- Agent：继续使用相同 `task finish run|inspect` 与 resume 语义。
- Local App 用户：继续看到相同 current、cleanup pending 和 delivered 结论。
- Buildr 维护者：只维护一个 Finish 专业表、writer 和 terminal association。

## 核心流程

1. 新 run 创建或恢复时，Application 原子写入一行 current state。
2. 每次阶段 checkpoint 原位更新总体查询列、`phases_json` 与有界 detail。
3. deliver 的 target mutex 通过同行 target/token/expiry 字段获取、续租和释放。
4. cleanup 完成后，同一行原位替换为 compact terminal state；Task Record 终态仍由 Task Record Application 提交。

## 关键变化

- 新增连续 migration，把旧四表安全收敛为 `task_finish_current`。
- 状态、当前阶段、关键 identity、当前失败、resume、cleanup、lease 与时间保留为普通列。
- 固定五阶段作为受验证 `phases_json` 整体读写，不新增 phase 表。
- Overview、Terminal Delivery、Doctor/schema inspect 与测试切换到单一 authority。

## 影响 / 风险 / 兼容性

内部 SQLite schema 是破坏性变化，但公开 CLI/HTTP/result schema 保持兼容。历史 identity、phase、lease owner 或 cleanup ownership无法证明时 migration 整体回滚；旧 runtime 继续通过数据库版本门禁拒绝新 schema。

## 验收摘要

- fresh 与连续 migration 最终只存在 `task_finish_current`，旧四表被删除。
- current/terminal checkpoint、phase JSON、lease fencing 和失败回滚均有自动测试。
- Overview 一次 JOIN 取得 Finish 摘要，Local App/CLI 结果不变。
- 代码、Doctor、tests 与 current knowledge 不再把旧四表或 phase 表当 authority。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Workspace store delta](specs/workspace-structured-data-store/spec.md)
- [Task Finish delta](specs/task-finish-execution/spec.md)
- [Overview delta](specs/task-overview-query/spec.md)
- [Local App delta](specs/local-workspace-application/spec.md)
- [Implementation tasks](tasks.md)
