## Context

当前 Workspace SQLite 已分别保存 `tasks`、`task_development_current`、`task_review_current`、`task_verification_current`、`task_environment_current`、`task_finish_runs` 与 `task_finish_completions`。`task_lifecycle_current` 仍由六类 Application 在专业写入后另开事务投影一份跨模块 JSON；主工作空间现有 62 个 Task、34 个 lifecycle row，Lifecycle JSON 平均约 13 KB，并已有 Environment 投影为 `blocked`、权威 row 为 `ready` 的漂移。

这次重构必须同时满足三类约束：专业 Application 仍是唯一事实 writer；GET/inspect 不重新观察 Git、文件、declaration 或 Environment；已发布用户数据库通过新连续 migration 原子升级，不能修改已登记 migration checksum，也不能静默丢失无法证明的 terminal association。

## Goals / Non-Goals

**Goals:**

- 删除持久化 `task_lifecycle_current` 及其 repository/application/projection writer。
- 把会影响后续业务判断的正式观察保存在拥有它的专业 current row；读取只组合已保存事实、格式化和做保存值之间的一致性诊断。
- 以一次 SQLite 联表读取 Task Overview，避免 N 次 Application/进程调用和第二份聚合存储。
- 保留 Task、Environment、Development、Review、Verification、Finish 的唯一 authority 与现有用户可见语义。
- 对 fresh、旧版本、部分投影、权威冲突和 terminal association 异常提供原子、fail-closed 的升级路径。

**Non-Goals:**

- 不把专业状态列复制进 `tasks`，不建设通用 Task Core、事件流、history、cache、materialized view 或状态机。
- 不让 Review/Verification 拥有“是否被当前 Development 采用”的 authority；该事实继续由 Development Receipt gate 保存。
- 不改变 Candidate、handoff、Finish delivery、Environment probe、Task Record 顶层状态或 Parent/Child 语义。
- 不从外部文件、Git 或旧 lifecycle JSON 重新推断已缺失的专业事实。

## Decisions

### 1. 专业表保存事实，Overview 只做组合读取

`tasks` 保持 Task Record 的 closed schema，不增加 `development_status`、`verification_status` 等列。专业 current 表继续保存完整 Domain payload，并增加仅用于原子保存正式观察或稳定查询的字段：

```text
task_development_current
  task_id
  record_json
  applicability_status
  applicability_json
  observed_at

task_review_current
  task_id
  review_type
  result_json
  target_identity
  outcome
  updated_at

task_verification_current
  task_id
  result_json
  target_identity
  outcome
  updated_at

task_environment_current   # 保持现有 authority
task_finish_runs           # 保持现有 current run
task_finish_completions    # 保持 terminal completion + association
```

Task Overview repository 使用一个 read-only connection 和一条带 planning/completion 两个 Review alias 的 `LEFT JOIN` 查询，Application 再把保存字段组合为兼容 read model。`present`、payload digest、中文状态文案、两个已保存 identity 是否相等等无副作用事实可以读取时计算；不得读取 Git、文件、`verification.yml`、Environment provider 或 transient Finish 目录。

选择该方案而不是把所有状态加入 `tasks`，因为后者仍是第二份同步投影，并会把专业字段演进耦合到 Task Record schema。也不使用普通 SQL View 作为新 authority；repository 中参数化查询已足够，且更便于保持响应 shape 与诊断。

### 2. Development applicability 在 action 中形成并同事务保存

每个合法 Development mutation 先基于该 action 已观察的 Task、Environment、Content Target、declarations 与专业 Result 形成新的 Receipt 和 applicability，再由 Development repository 在一个 `BEGIN IMMEDIATE` transaction 中同时保存 `record_json`、`applicability_status`、`applicability_json` 与 `observed_at`，写后重读验证后提交。任一 serialization、constraint、busy 或 post-read 失败整体回滚。

Development `inspect` 不再调用 Environment、Content Target observer、declaration parser 或 lifecycle reader；它直接返回保存的 Receipt/applicability。调用方要刷新 applicability 时必须执行拥有该观察语义的正式 Development action，不能用 GET 暗中刷新。

选择 Development 单独保存 applicability，而不在 Review、Verification 与 Development 三处复制同一状态，是因为“Result 是否被当前研发目标采用”属于 Development gate。Review/Verification row 只规范化其自身 target/outcome/time；它们的 inspect 可以把调用方显式提供的 identity 与保存 identity 做纯值比较，未提供时返回 `unknown`。

### 3. Terminal association 只从 Finish completion 读取

Finish completion 的 closed `result_json` 已保存 handoff、Candidate、三个 gate association、delivery、cleanup 与完成时间。Terminal Delivery Application 直接读取 `task_finish_completions`，与保存的 Task/Development facts做确定性匹配；current run 只表达 active/blocked/cleanup-pending。Finish 不再 refresh lifecycle runtime 或执行 `projectTaskFinish`。

如果 completed、非 noChange Task 没有可匹配 completion/association，reader 保持 `completed-unproven`；不得扫描 legacy Finish files、Git 或 Environment 补造交付事实。

### 4. 用新连续 migration 原子退役 lifecycle table

新增下一个连续 migration，不修改 `0006_create_task_lifecycle_current.sql` 或任何已登记 script：

1. 为专业 current 表建立 latest schema 与查询字段。
2. Review/Verification 从已通过 Domain 校验的 `result_json` 回填 `target_identity`、`outcome`、`updated_at`，无法形成必填字段时整次失败。
3. Development 仅在同 Task 专业 row 与 lifecycle development snapshot 都存在且 JSON 可用时迁移最后一次 applicability/observedAt；没有安全来源的旧 row 保留 payload并以空保存观察读取为 `unknown`，不伪造 current/stale。
4. Environment 冲突始终以 `task_environment_current` 为准，不从 lifecycle 反向覆盖。
5. 每个 lifecycle terminal association 必须能在同 Task `task_finish_completions.result_json.association` 找到且关键 identity 一致；不匹配时 migration fail closed。匹配时不复制，因为 completion 已是唯一事实。
6. 全部检查通过后才删除 `task_lifecycle_current`。

Migration runner 已为每个 script 提供独立 `BEGIN IMMEDIATE` 与 ledger transaction，SQL 不再嵌套 transaction。任一步失败由 runner 完整 rollback，原 schema、数据和 ledger 保持不变。新 runtime 的显式 `update/sync` 或下一次合法 writable action应用 migration；普通 GET 不迁移。旧 runtime 读取已升级数据库继续返回 `database-newer-than-runtime`。

### 5. 保持公开读取兼容，删除内部 projection contract

现有 Task Development/Review/Verification/Environment/Finish 与 Local App endpoint 的主 JSON 结构尽量保持；缺少旧 Development applicability 时返回稳定 `unknown` diagnostic。新增 Overview read model 只暴露 Task 与专业 current 摘要，不暴露表名、SQL、完整 payload 或数据库路径。为关闭读时路径观察，`task verification inspect`不再接受`--declaration-root`；该参数只用于`record`正式动作，CLI help、随包Skill/contract和文档同步切换。

内部删除 `registerTaskLifecycleRepository`、`registerTaskLifecycleReadModelApplication`、`read/update/inspect/projectTaskLifecycle*`、Finish lifecycle runtime refresh 及 static/package references。Package residual gate 明确拒绝这些 source/runtime symbols 和 `task_lifecycle_current` latest-schema 残留，但保留历史 migration `0006` 作为已发布升级链的一部分。

## Risks / Trade-offs

- [旧 Development row 没有 lifecycle snapshot] → 保留 Receipt，保存观察返回 `unknown`；下一次正式 Development action 原子形成新观察，不从外部世界补算。
- [migration 误删唯一 terminal association] → 删除表前逐 Task 核验 completion association；任何缺失/identity 冲突整次 rollback。
- [专业 action 计算 applicability 后写入失败] → Receipt 与 applicability 由同一 repository transaction 保存，失败不产生半新半旧状态。
- [Overview 联表随字段增长变重] → 只选择 Task 摘要、规范化查询列和必要 JSON，不复制完整 Environment/Finish/专业 Result；SQLite 单库 JOIN 的成本以查询计划和代表性多 Task 测试验证。
- [旧 runtime 无法读取升级数据库] → 保持既有 fail-closed `database-newer-than-runtime`，公开更新流程必须在打开 Local App 前完成 migration。
- [删除内部 Application 影响隐式 consumer] → 全仓 static residual gate、runtime composition、package parity、Local App 与 terminal system tests共同证明调用链已切换。

## Migration Plan

1. 先交付 migration 与 repository 双向测试，在隔离 validation Workspace 覆盖 fresh、每个旧 ledger 起点、完整/部分 lifecycle、冲突与 fault injection。
2. 切换 Development/Review/Verification/Terminal Delivery/Overview readers 与 writers，再删除 projection wiring。
3. 更新 Local App、package assets、current specs/knowledge 与 residual gate，执行 affected delivery verification。
4. Candidate 集成后由 retained runtime 在 canonical Workspace 的合法 writable sync 中应用 migration；随后以 Doctor、Task Overview 与专业页签只读回归确认升级。

Rollback 只允许发生在 migration transaction 提交前。已提交并登记的新 schema 不提供 down migration；需要修正时新增下一条连续 migration，不能恢复旧 lifecycle authority 或改写已登记 checksum。

## Open Questions

无。当前主工作空间数据已证明 Environment 漂移存在，所有 lifecycle terminal association 均有对应 Finish completion；缺失 Development snapshot 的兼容语义固定为保存 payload + `unknown`。
