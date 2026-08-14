## Context

Formal Verification 在 capability/process 启动前计算 closed `invocationIdentity` 并通过 Task Execution Record Application 原子 open record。现有 transaction 只查询相同 identity 的 `open` row；`retained`、`cleanup_pending`、`cleaned` 或 `attention` row 不参与默认去重，因此相同稳定输入在无 `--retry` 时仍可能重复执行。

当前 identity 已绑定 Task、Project、verification declaration、Content Target、规范化 capability set 与固定 command invocation kind。Execution Record schema、identity 列和查询索引已经存在，本次只改变同一 authority 的选择语义，不新增持久化事实。

## Goals / Non-Goals

**Goals:**

- 相同 invocation 已有 active 或 terminal record 时默认零执行复用。
- 只有显式 `--retry` 才为同一 invocation 创建新 run/record。
- 多条历史 record 的选择在并发 transaction 内 exact、稳定且可测试。
- terminal readback 保留原 outcome/lifecycle，不把失败、阻塞、取消或 attention 改写为通过。
- 保持 Verification Result、Execution Record、Task Development 与 producer evidence 的现有 authority 边界。

**Non-Goals:**

- 不改变 invocation identity 的字段集合，也不把授权、并发度、时间、路径或 run identity 加入 identity。
- 不删除、覆盖、合并历史 record，不为 retry 增加 parent/`retryOf` 数据模型。
- 不延长 GC retention，也不为已被 GC 删除的 tombstone 建立永久幂等表。
- 不改变 resume、cancel、resolution、cleanup、Verification Result record 或 Task Development 消费行为。

## Decisions

### 1. open transaction 统一解析 existing active 与 terminal

Task Execution Record repository 在 `BEGIN IMMEDIATE` 内先保持同一 `runIdentity` 的幂等检查，再对相同 Task、owner、kind、非空 `invocationIdentity` 查询历史：

1. 若存在 `lifecycleStatus=open`，选择 latest active 并返回 `existing-active`；
2. 否则若存在 `retained|cleanup_pending|cleaned|attention`，选择 latest terminal 并返回 `existing-terminal`；
3. 否则预留 quota 并插入首次 record。

active 优先于 terminal，因为它代表同一 invocation 当前仍有 producer ownership；默认调用必须先回读该执行。选择由 repository 原子完成，runner 不做 list-then-open，避免并发竞态。

显式 `--retry` 传入 closed `allowDuplicateInvocation`，只跳过 invocation 历史复用，仍保留同一 run identity 冲突检查、Task active 门禁和 quota/backpressure。

### 2. latest 使用 `(opened_at DESC, record_id DESC)`

exact 查询固定匹配 Task、owner、kind 与 invocation identity。active 与 terminal 各自按 `opened_at DESC, record_id DESC` 取第一条；公开 Task record list 同步使用该顺序。

`opened_at` 表达 run 的创建顺序，适合原始与 retry record 的同组选择；`record_id DESC` 只作为相同时间戳下的确定性 tie-breaker，不声称额外时间语义。原始 record 与所有 retry record 通过相同 `invocationIdentity` 形成一组，各自保留独立 `runIdentity`/`recordId`，不新增父子关系。

### 3. terminal 复用返回非执行 execution envelope

Verification runner 收到 `existing-terminal` 时不观察 target、不取得 resource、不创建 transient evidence、不启动 capability，也不写 Verification Result。它返回现有 `buildr.verification-execution/v1`：

- `checks=[]`、`durationMs=0`、`timingSource=not-started-existing-terminal`；
- `runId`/`run.id`、`invocationIdentity` 与 portable `executionRecord` 来自选中的 row；
- `target.stable`、observation 与 execution identity 保持 `null`，避免把本次零执行伪装成新的证明；
- 仅当 outcome 为 `passed` 且 lifecycle 不是 `attention` 时顶层 `status=passed`；`failed|blocked|cancelled` 或任意 `attention` 返回 `status=failed` 和非零退出；
- next action 指向同一 Task/record 的 inspect，并说明只有显式 `--retry` 才执行新 run。

这只是 Execution Record authority 的 terminal readback，不创建或替代 current Verification Result。Task Development 仍只消费 Task Verification Application 保存的 current Result。

### 4. terminal 集合按现有 domain closed states 定义

active 只允许 `outcome=running` 与 `lifecycleStatus=open`。terminal outcome 是 `passed|failed|blocked|cancelled`；terminal lifecycle 是 `retained|cleanup_pending|cleaned|attention`。`attention` 是 lifecycle 而不是 outcome，必须保留实际 outcome 且整体按失败 readback。当前 domain 没有其他 outcome/lifecycle 状态；未来增加 closed state 时必须同步更新 domain、查询、contract 和测试，不能靠 `!= open` 静默吸收。

## Risks / Trade-offs

- **cleaned tombstone 后续被 GC 删除，永久幂等不可证明** → row 存在时参与复用；被合法 purge 后视为 authority 中不存在。若未来要求永久单次执行，另建有 retention 设计的 Change，不用内存或 CLI 输出补造。
- **历史 nullable identity 不参与复用** → 保持旧 row 可读且不猜测/回填 identity；新 record 已完整写入 identity，无 migration。
- **多个显式 retry 同时 active 时只返回一个 latest active** → 这是 retry 明确允许的并行历史；默认调用按稳定规则选择最新 active，list/inspect 仍可查看全部 records。
- **terminal failed readback 没有重跑 checks** → 保留原失败事实并返回 inspect/retry 选择，避免昂贵副作用和自动把失败变成通过。

## Migration Plan

1. 更新 repository/Application closed input 与 result status，复用现有 column/index/schema。
2. 更新 Verification runner terminal 非执行分支、CLI help 和公开文档。
3. 更新 Skill/v3 contract、current knowledge、delta spec 和分层测试。
4. focused/affected 验证后执行 current knowledge reconcile/inspect 与 OpenSpec convergence。

无需数据库 migration：现有 `invocation_identity`、`opened_at`、`record_id`、outcome 与 lifecycle 已足以完成 exact/latest 选择；nullable legacy row 保持不匹配，不回填也不改写历史。

## Open Questions

无。永久去重、后台 job ownership、自动判定失活 open record与通用跨 owner invocation lineage 均不属于本 Change。
