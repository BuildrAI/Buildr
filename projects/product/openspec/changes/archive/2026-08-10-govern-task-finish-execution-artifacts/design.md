## Context

Task Finish 以同一 `task_finish_current` row 管理一个逻辑 Finish run，并可在 target race、Delivery Adaptation、retained Doctor 或 cleanup 阻塞后使用产品 token 恢复。当前每次 `task finish run` 都会把新的 phase attempt 叠加到该 current run，阶段 checks、operations、observations 与 2 KiB 命令预览随 current checkpoint 保存；更完整的命令输出只在 run-owned transient 现场中存在并随成功 cleanup 删除。因此一个逻辑 run 的多次 invocation 既不是独立历史，也不能在 cleanup 后解释执行过程。

C1 已交付唯一 Task Execution Record Application、`task_execution_records` metadata authority、五文件 closed body Store、固定 16 MiB reservation/backpressure 与 retention；其 v1 已登记 `task-finish/finish-diagnostics`。C2 已将 Verification invocation 接入同一底座并建立“open 在副作用前、seal retained 后清理 transient”的 producer 模式。本 Change 只接入 Finish producer，不修改底座 schema、quota 或 retention。

## Goals / Non-Goals

**Goals:**

- 每个实际执行的 Task Finish CLI invocation 对应一条独立 `finish-diagnostics` record；同一逻辑 Finish run 的 resume invocation 使用新 identity。
- 在调用前校验和 no-op 判断后、任何 Finish current/Carrier/target/recovery 副作用前完成 quota reservation。
- 通过 provider-owned invocation transient files 收集完整受控 output、五阶段 timeline 与 diagnostics，再映射到既有 closed body dictionary。
- execution record 的失败不覆盖或回滚 Finish owner 已成立的 delivery、cleanup、Task terminal 或 current facts。
- `task_finish_current` 收敛为当前阶段、timing、关键 identity、当前 failure/resume/cleanup 与恢复所需 owner facts，不保存 attempt history、execution record 关联或完整 diagnostics。
- execution record retained 后只清理精确 invocation diagnostics transient；Delivery Carrier 与其他恢复资源仍由 Finish owner 按原有边界清理。

**Non-Goals:**

- 不修改 `task_execution_records` schema、正文文件集合、配额、retention、resolution 或 cleanup Domain。
- 不增加 execution record list/read CLI、Local App、Inventory、Doctor、批量 GC、Consumer/Adoption 或 retry relation。
- 不把 record ID、status、history、body locator 或 quota 状态写入 `task_finish_current`。
- 不让 execution record seal 成为第二个 Finish terminal authority，也不因 seal 失败重做 push、Doctor、Environment cleanup、Carrier cleanup 或 Task completion。
- 不改变固定五阶段、Delivery Carrier、target lease、resume token、Delivery Adaptation 或 retained self-bootstrap 语义。

## Decisions

### 1. Invocation identity 与逻辑 Finish run identity 分离

Application 在完成参数、Task/Environment/Development handoff、target/remote 与 resume token/no-op 校验后生成 `finishInvocationId`，并用它作为 execution record `runIdentity`：

```text
openTaskExecutionRecord(workspace, taskId, {
  owner: "task-finish",
  kind: "finish-diagnostics",
  runIdentity: finishInvocationId,
  targetIdentity: contentTargetIdentity,
  producer: "buildr.task-finish-runner/v1"
})
```

稳定 `finishRunId`、invocation ordinal、handoff/Candidate 与 target refs 只进入 seal 后正文。首次 invocation 可以在 record open 后创建 Finish run；resume invocation 读取既有 run 并产生新的 record。这样 record identity 不依赖尚未发生的 current mutation，也不会把同一 run 的恢复覆盖成一次 attempt。

替代方案是以 `finishRunId` 作为 record identity；幂等 open 会把 resume 覆盖到同一 row，无法保留 target race 和后续恢复，因此不采用。

### 2. 将 Application 拆成只读调用规划与 record-gated 执行

`task-finish-application` 先形成只读 invocation plan：解析 current Development handoff、ready Environment、target/remote、existing Finish current、resume token 与 completed/no-op。invalid request、stale handoff、invalid token 和 completed/no-op 在此返回，不创建 record 或 transient。

对于需要执行的 plan，Application 先 open record。backpressure 或 identity conflict 直接返回 portable blocked summary；除调用前所需的只读 target/remote 校验外，不得创建/替换 Finish run、作废旧 failure、创建 Carrier、获取 lease、启动执行期 target observation/mutation 或写 transient。open 成功后才建立 diagnostics transient 与调用既有五阶段 executor。现有“handoff 变化时丢弃旧 failed run/Carrier”的动作也必须移到 open 之后并记录为本 invocation operation。

### 3. invocation-local collector 是 producer evidence authority

每次 open 成功后建立 `.buildr/transient/task-finish/diagnostics/<finish-invocation-id>/`。collector 在阶段开始/结束和命令完成时写 provider-owned、identity-bound 文件；它只接受固定阶段、稳定 operation ID、timestamp/status、stdout/stderr bytes 与 portable failure/output facts，不接收 raw env、stdin、token、cwd 或 argv。

seal mapper 从 collector 与 invocation result 生成现有五个 closed body 文件：

- `summary.json`：`buildr.task-finish-execution-summary/v1`，包含 invocation/run/ordinal、handoff/Candidate/Content Target、target/Carrier portable identity、phase status/timing、Finish outcome 与 cleanup disposition。
- `timeline.json`：`buildr.task-finish-execution-timeline/v1`，只包含 `record-opened|run-opened|phase-started|phase-finished|finish-stopped|record-sealed` 及固定 phase/portable status。
- `diagnostics.json`：`buildr.task-finish-execution-diagnostics/v1`，保存 current invocation 的 failure code/class/operation、target race、adaptation、Doctor、cleanup、cancellation与 record attention；不保存绝对 locator 或 recovery token。
- `stdout.txt`、`stderr.txt`：按固定 phase/operation header 合并命令输出；不持久化 raw argv、cwd、env、stdin、remote credential 或 resume token。

正文 Store 继续执行最终版本化 redaction、closed filename、4 MiB 单文件与 16 MiB record 截断。collector transient 是 seal 前恢复源，不是长期 authority，也不写入 `task_finish_current`。

### 4. `task_finish_current` 与 execution diagnostics 各自只保存 owner facts

Finish current 保留固定 phase status/timing、current primary failure、run/handoff/Candidate/Content Target、Carrier/target/lease、delivery readback、resume、cleanup、terminal association和完成效率。phase attempt 的 checks、operations、observations、stdout/stderr preview 与旧 failure history不再作为 current payload持久化；执行中的下游阶段若需要事实，必须从明确的 top-level Finish owner 字段读取，而不是从 diagnostics record反向恢复。

`task finish inspect` 继续只读该 compact current/terminal read model，不查询 records。execution record 的发现和正文读取由父计划后续 Inventory/Body Read 贡献负责。

### 5. Finish outcome 与 record outcome 独立组合

record outcome 映射为：Finish `complete` → `passed`；`blocked|cleanup_pending` → `blocked`；terminal product failure → `failed`；被有界捕获并完成 partial seal 的取消 → `cancelled`。不可捕获进程死亡保持 record `open`。

seal retained 后才调用 diagnostics owner 的精确 cleanup。seal、metadata post-read 或 cleanup 失败只更新公开 `executionRecord` operation summary：

- `retained`：record 完整保留，并报告 transient cleanup `cleaned|attention`。
- `attention`：无法证明 retained，保留 transient 并提供 owner recovery next action。
- `blocked`：open backpressure，Finish execution 未启动。
- `not-opened`：invalid/no-op 路径，没有 record。

如果 Finish 已完成远端交付、Task Environment cleanup、Carrier cleanup 或 Task terminal transition，seal failure 仍返回 Finish `status: complete` 加 `executionRecord.status: attention`；不得把已成立 owner truth 改写为 blocked/failed，也不得重放不可逆动作。对于本来 blocked/failed 的 Finish，原状态同样保持不变。

### 6. 两类 transient cleanup 完全分离

invocation diagnostics transient 只由 record producer 在 retained 后精确删除。Delivery Carrier、lease、adaptation 与 Finish recovery transient 只由 Finish owner按既有 phase/resume/cleanup规则管理：blocked/resume 必须保留所需资源，successful Finish必须继续清理这些资源。任一方不得因另一方失败扩大 cleanup target，execution record retention也不得延长Carrier生命周期。

## Risks / Trade-offs

- [open 已成功但进程硬崩溃] → record 保持 `open`，collector partial transient 保留；本 Change 不伪造 outcome，交由后续 owner recovery/Doctor 贡献处理。
- [Finish 完成后 seal 失败] → 用户看到 complete 加 attention；后续 record recovery不得重放 Finish。这样牺牲“所有成功都有 retained record”的强一致性，换取不建立第二 terminal authority。
- [current payload 收敛影响 resume] → 逐项识别下游真正需要的 owner facts并提升为已有 top-level 字段；测试覆盖 target race、Delivery Adaptation、Doctor 与 cleanup_pending resume，禁止从 record反向重建。
- [完整命令输出包含敏感信息] → collector拒绝 raw invocation metadata，mapper先去除禁止字段，正文 Store再执行最终 redaction/truncation；transient使用 owner-bound目录和精确cleanup。
- [同一 Finish run 多条 records 增加容量] → 沿用每条16 MiB reservation、Task/owner 256 MiB 与Workspace 2 GiB backpressure；不自动清理旧 unresolved record。

## Migration Plan

1. 增加 Finish invocation collector、closed body mapper与 operation summary，不修改 SQLite migration。
2. 将 Task Finish Application重构为只读 plan、record open gate、五阶段执行、seal、diagnostics cleanup，保持CLI参数和fixed phases不变。
3. 收敛 current phase payload并验证所有 owner recovery字段仍可独立恢复。
4. 更新JSON schema/docs/current knowledge，覆盖checkout与package runtime parity。
5. 完成受影响测试、strict OpenSpec validation与convergence；回滚时整项回滚producer接线，既有 execution record底座和 Finish current数据均无需迁移。

## Open Questions

无。Inventory/body read、open-record recovery、批量 cleanup与Consumer/Adoption由父任务后续贡献单独决定。
