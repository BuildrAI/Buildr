## Context

`buildr verification run` 当前为每次 command runner invocation 生成 `runId`、执行 checks、观察 target drift，并把 stdout/stderr、timing、resource coordination、Environment/Workspace Node context 与 cleanup reference 写入 provider-owned transient `buildr.verification-execution/v1`。正式 `task_verification_current` 只保存提炼后的 target、declarations、capability facts、coverage gaps 与结论。

C1 已交付单表 `task_execution_records`、Task Execution Record Application 和只接受 `summary.json|stdout.txt|stderr.txt|timeline.json|diagnostics.json` 的受限正文 Store。它在 open 时固定预留16 MiB，在 seal 时脱敏、截断并原子发布正文；本 Change 只负责 Verification producer 接线，不改其 schema、配额或 retention。

## Goals / Non-Goals

**Goals:**

- 每次带合法正式 Task Environment context 的 command runner invocation 对应一条独立 execution record。
- 在 capability、resource coordination 或 target observation启动前完成 record open 和容量 reservation。
- 以 closed、portable、可诊断的 body dictionary保存执行摘要、输出、有限 timeline 与异常诊断。
- 明确 passed、failed、blocked、cancelled、重试、target drift 和可捕获中断的 outcome 边界。
- 只有 execution record成功retained后才清理该run的transient目录；失败时保留可恢复现场。
- 保持 Task 外runner和current Verification Result既有authority。

**Non-Goals:**

- 不修改`task_execution_records`表或增加Consumer/Adoption、retry、resource、event/history表。
- 不把execution record identity写入`task_verification_current`，不让record自动证明正式Result采用了某次attempt。
- 不持久化Environment root、Workspace root、Node executable、lease token、stdin、env或原始敏感命令参数。
- 不处理Finish producer、Inventory/body read、批量GC、Doctor或硬崩溃open-record批量恢复。
- 不把`invocation.kind: agent`接入尚不存在的受控producer adapter。

## Decisions

### 1. 一次runner invocation对应一条record

正式Task context由现有`--environment <task-id> --workspace <canonical-workspace>`确定。runner完成参数、Task Environment、Project/declaration、capability、authorization、execution root与Workspace Node的调用前校验后生成`runId`，并在任何producer execution前调用：

```text
openTaskExecutionRecord(canonicalWorkspace, taskId, {
  owner: "task-verification",
  kind: "verification-execution",
  runIdentity: runId,
  targetIdentity,
  producer: "buildr.verification-command-runner/v1"
})
```

`run_identity`使用执行前生成的`runId`；执行结束后才可计算的`executionIdentity`进入`summary.json`。重试生成新的`runId`，不覆盖旧attempt，也不自动把旧failed record标为recovered。Task外run不open record，继续只产生transient evidence。

替代方案是每个capability一条record；这会让并发runner的统一target observation、wall-clock和resource coordination被拆散，并显著增加quota reservation，因此不采用。

### 2. open位于完整调用前校验之后、首次执行副作用之前

无效参数、缺失declaration、未知capability、非法Agent invocation、execution root越界或授权不足都在open前失败，不留下伪execution record。校验通过后先open；quota不足返回backpressure，checks保持空且不启动resource waiter或process。

open成功后发生的resource等待失败、Environment context失稳或其他未启动capability的运行期阻塞映射为`blocked`。capability assertion/process失败、capability timeout或target drift映射为`failed`；显式取消或可捕获的SIGINT/SIGTERM映射为`cancelled`；全部checks通过且target稳定才为`passed`。不可捕获进程死亡不猜terminal outcome，record保持`open`，供后续owner recovery/Doctor贡献处理。

### 3. Verification producer使用既有五文件closed dictionary

producer提交给Task Execution Record Application的文件集合为：

- `summary.json`（必需）：`buildr.task-verification-execution-summary/v1`，保存run/execution/scope identity、invocation kind、portable target、Project/declaration identity、selected capability与authorization IDs、portable runtime identities、check status/timing和execution outcome。
- `stdout.txt`、`stderr.txt`（有内容时）：按`project/capability`稳定header合并各check输出；不保存raw argv、cwd、env或stdin。
- `timeline.json`（execution启动后必需）：`buildr.task-verification-execution-timeline/v1`，只接受`record-opened|queued|started|finished|target-observed|cancelled|record-sealed` milestone及capability、portable timestamp/status，不成为任意event log。
- `diagnostics.json`（非passed或有诊断时必需）：`buildr.task-verification-execution-diagnostics/v1`，保存失败code、exit/signal、resource ID/status/queue duration、可捕获interruption以及target before/after fingerprint与相对changed paths。

`scopeIdentity`由target identity、Project、declaration identity、已排序capability IDs与invocation kind计算，只用于相关attempt分组，不建立retry或Result adoption关系。`executionIdentity`保留现有结束后digest。正文不复制transient `evidenceReference/evidenceLifecycle`，不保存Project/Environment/Workspace/Node绝对路径；Store仍执行最终版本化redaction和配额截断。

### 4. seal先于transient cleanup，current Result保持独立

runner先形成完整transient payload，再从内存值生成closed body files并seal execution record。只有seal返回`retained`，才通过现有owner-bound cleanup删除精确transient run目录；cleanup结果进入公开operation summary但不写execution record正文。seal或metadata确认失败时不清理transient目录，并返回attention/blocked诊断，避免同时失去两份证据。

Agent仍从`buildr.verification-execution/v1`提炼portable capability facts，再独立调用`task verification record`。current Result schema不增加record IDs、attempt history或日志。Task/target/time上可发现的records只能称为related executions，不能自动声明被Result采用。

### 5. 公开JSON只做additive扩展

`buildr.verification-execution/v1`增加`executionRecord`：Task外run返回`not-applicable`；正式run返回record ID、outcome、lifecycle、body digest/size/truncated、transient cleanup status、portable diagnostic与next action。不得返回SQLite locator、正文locator或database细节。

正式run只有execution record retained且既有checks/target条件通过时顶层`status`才能为`passed`。backpressure在producer启动前返回`failed`和空checks；执行完成但record未安全retained也返回`failed`并保留原check事实。invalid request保持零record。

## Risks / Trade-offs

- [runner结果成功但record seal失败] → 顶层formal run不报passed，保留transient evidence与attention诊断；重试只复用匹配run identity的record。
- [可捕获signal期间异步seal时间有限] → 先停止/收敛child process并保存已有partial output；无法证明seal时保持open，不在signal handler中伪造cleaned。
- [body映射与公开payload重复] → body只保存可恢复诊断，公开payload是当前调用结果；两者共享纯mapping函数和schema tests，current Result仍不复制。
- [一次run选择多个capabilities导致输出较大] → 继续使用C1单文件/record截断和manifest统计，不增加caller可调quota。
- [旧自动化不认识`executionRecord`] → 字段为additive；Task外runner既有字段和cleanup流程保持兼容。

## Migration Plan

1. 增加Verification record body mapper与closed schema validators，不修改SQLite migration。
2. 在现有command runner调用前校验之后接入open，在所有terminal路径接入seal与transient cleanup。
3. 为公开JSON增加additive `executionRecord` summary并更新schema coverage/package parity。
4. 覆盖Task外、formal passed/failed/retry/drift/backpressure/catchable cancellation与seal failure；通过正常OpenSpec convergence和Formal Task Finish交付。

## Open Questions

无。Agent invocation producer、open record批量恢复和公开body read分别留给其专业后续贡献，不在C2扩展。
