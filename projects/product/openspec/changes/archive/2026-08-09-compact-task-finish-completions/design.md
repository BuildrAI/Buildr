## Context

Task Finish 已经是固定五阶段执行器，但持久化仍拆成 `task_finish_runs`、`task_finish_completions`、`task_finish_target_leases` 与 `task_finish_transient_artifacts`。正常 cleanup 会先后写 prepared completion、Environment cleanup 后的 completion、Task terminal state、complete completion，再删除 run；同一 Task 的 current、prepared 与 terminal 事实因此跨表并存。实际生产没有 transient artifact metadata writer，而大体量执行诊断已有独立 execution-record 能力规划，本 Change 不接入该 producer。

约束是保持公开 `buildr.task-finish-run/v2`、`buildr.task-finish-result/v2`、CLI、Local App、五阶段、Task Environment cleanup 与 Task Record terminal writer 语义；只改变 Finish 专业 SQLite authority 与内部 repository。

## Goals / Non-Goals

**Goals:**

- 每个 Task 只保留一份 Finish current/terminal authority。
- 总体状态、当前阶段、关键identity与当前失败可直接查询；固定五阶段详情整体受验证，不为暂无consumer的阶段级查询单独建表。
- target mutex 归属同一 run row，具备 token compare-and-set、短 expiry 与续租能力。
- 连续 migration 安全迁移历史 completion/current 状态并删除旧四表。
- Overview 一次 JOIN 即可取得 Finish 摘要；公开读模型保持兼容。

**Non-Goals:**

- 不接入或修改 `task_execution_records` 的 Task Finish producer；该工作继续由 Parent C3 负责。
- 不改变固定五阶段、Git delivery、Task Environment、Development handoff 或 Task Record authority。
- 不建立 Finish history/event/audit store，也不保留长期双写、legacy reader 或兼容表。
- 不把 phase 的 checks、operations、observations 等非查询细节全部列化。

## Decisions

### 1. `task_finish_current` 是唯一专业表和每个 Task 唯一 current/terminal row

主键为 `task_id`，`run_id` 保持唯一。行内保存 schema/status/current phase、run 与 Development/Candidate/Content Target identities、target/carrier/delivery/gate association、current failure、resume、cleanup 和时间字段。进行中 `payload_json` 保存经 Domain 验证的非阶段 run detail；完成时同一行原位替换为 compact terminal completion detail。

稳定总体状态、current phase、identity、时间、当前失败与 association 必须有普通列；`payload_json` 只保留公开结果重建所需但不承担独立查询 authority 的有界结构。repository 写入时从 Domain 对象派生列与 payload，并在同一 `BEGIN IMMEDIATE` transaction 内写后读取校验。

选择原位替换而不是 current + completion 两表，是因为一个 Task 在任一时刻只需要一个 Finish 结论；prepared completion 是 run 的 cleanup 进度，不是第二份专业 authority。

### 2. 固定五阶段整体保存为 `phases_json`

`phases_json` 固定包含 `preflight|prepare|verify|deliver|cleanup` 五项，每项保存 status、attempts、started/completed/duration、input/output identity、failure 以及有界 checks、operations、observations。Domain 必须验证 phase 集合、顺序、允许状态和有界详情，并保证普通列 `current_phase`、current failure 与当前 phase 内容一致。

选择 JSON 而不是阶段表，是因为五个阶段固定、总是随 run 整体 checkpoint，Overview 不按阶段跨 Task 查询。独立行会增加写放大、JOIN 与迁移复杂度，却没有当前 consumer。terminal 时同一列替换为 compact phase summary；缺项、重复 phase 或列/JSON 不一致均拒绝提交。

### 3. Lease 内嵌主行并保持最小字段

主行只增加 `lease_target_identity`、`lease_token`、`lease_expires_at`。owner 已由 `task_id + run_id` 表达；续租就是 token 匹配时更新 expiry，不再单列 heartbeat/acquired owner。partial unique index 保证非空 `lease_target_identity` 只能由一个 current row 占有。

acquire 在 `BEGIN IMMEDIATE` 内读取占有者。未过期且 token/owner 不匹配时 blocked；过期 lease 不能仅凭时钟转交，必须先重观测 owner run 与 target，再以新 token 覆盖。release 与 renew 都使用 token compare-and-set，避免旧进程释放或延长新 owner 的 lease。

选择内嵌而不是独立 lease 表，是因为当前一个 Finish run 同时只交付一个 target，owner 与 lifecycle 已在主行；独立表只会复制 run/task 外键与时间字段。

### 4. Public Result 由单行重建，内部 locator 保持兼容

现有 repository 方法可以保留一轮内部函数签名以缩小调用面，但全部只读写`task_finish_current`；run locator 与 completion locator 仍是逻辑 locator，不对应独立表。current 状态由普通列、`phases_json`和`payload_json`重建完整run，terminal状态重建compact completion；CLI、Terminal Delivery 与 Local App 不感知表结构变化。

Overview 只 `LEFT JOIN task_finish_current` 且不解析 `phases_json`；专业 inspect 从同一行读取并验证完整 phases。

### 5. 连续 migration 迁移可证明数据，无法证明时整体回滚

新 migration 创建单表与索引后按 Task 合并旧数据：

- 只有 run：迁移为 current row，并把 `run_json.phases` 规范化为 `phases_json`。
- 只有 completion：迁移为 terminal/current row，并把 `result.phases` 规范化为 compact `phases_json`。
- run 与 cleanup/prepared completion 同时存在：run 保持 current authority，completion 作为该 run 的 cleanup progress 合并进 payload；typed status 取可恢复 run 状态。
- lease：仅当 task/run 与迁移后的 current row 精确匹配时写入内嵌 lease；不匹配则 migration 失败。
- transient artifact metadata：若存在任何 live row，migration 失败并要求旧 runtime 先完成或清理该 run；不能静默丢失 cleanup ownership。

所有 JSON schema、Task/run identity、五阶段集合、status 与关联必须可验证。写入后比较源/目标 Task 与 run 集合，再删除旧四表；任一步失败由 migration transaction 回滚 schema、data 与 ledger。

不修改 `0007`，只追加下一编号 migration。旧 runtime 打开新数据库时继续由 migration ledger 的 newer-than-runtime 门禁拒绝写入。

## Risks / Trade-offs

- [Risk] 主表列数增加。→ 只列化稳定总体查询、约束和 association 字段；固定阶段整体留在受验证的有界 JSON。
- [Risk] SQLite partial unique index 不会自动忽略过期 lease。→ acquire 在事务内显式重观测与 token fencing，不把 expiry 当自动转移授权。
- [Risk] 历史 payload shape 可能损坏。→ migration fail closed 并完整回滚，不用宽松默认值伪造 terminal proof。
- [Risk] 同时存在 run 与 prepared completion 时合并复杂。→ 只接受同 Task、同 run identity，run 仍是 current，prepared 内容只并入其 cleanup progress。
- [Trade-off] 删除 per-artifact metadata 后 Finish 不再持有逐文件 catalog。→ 当前没有生产 writer；本 Change 保持 carrier/cleanup 必要 locator 在 run payload，未来完整诊断由独立 execution-record owner 承担。
- [Risk] 内部 repository API 兼容会掩盖旧概念。→ 调用面可以阶段性保留函数名，但 SQL、Doctor、测试和 specs 不得继续把 run/completion 当两份 authority，后续可机械重命名而不改变数据模型。

## Migration Plan

1. 添加新 schema migration、fresh/upgrade/rollback/malformed fixtures。
2. 将 repository 写入改为单行原子 checkpoint，并实现 phases JSON 验证与内嵌 lease fencing。
3. 切换 Finish Application、Overview、Terminal Delivery、Doctor/schema inspect 与 tests。
4. 验证不再有旧四表生产 reader/writer 或 schema expectation。
5. 严格验证 Change，完成 current knowledge reconcile，再通过单一 convergence transaction 收敛 canonical specs。

Rollback 只发生在 migration transaction 提交前；提交后旧 runtime 必须拒绝数据库版本，不提供反向 dual-write 或自动降级。

## Open Questions

无。单表边界、总体 typed fields、阶段 JSON、lease 内嵌以及 execution-record producer 不在本 Change 接入均已确认。
