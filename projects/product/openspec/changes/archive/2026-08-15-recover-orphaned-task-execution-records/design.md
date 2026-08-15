## Context

Verification producer 先在 canonical Workspace 打开 Execution Record，再执行 capability，最后把受控正文发布并 seal。当前 transient `summary.json` 会在 capability 全部结束后、seal 前写入；因此 seal 失败时通常已有可恢复的完整终态证据。但不可捕获的进程退出也可能只留下 open record，没有可证明终态。

相同 invocation 默认优先复用 open record。现有模型没有“原执行结果未知但已停止阻塞”的终态，所以 Agent 只能 inspect 或使用 `--retry` 绕过，不能修复原 record。

## Goals / Non-Goals

**Goals:**

- Agent 能用 provider-owned transient summary 补 seal 原 Verification record。
- 证据不足时不猜结果；只有显式用户授权才能接受 `unknown` 终态。
- 已接受的未知终态不再参与相同 invocation 的 duplicate matching，后续普通 Verification 可创建新 run。
- 所有持久事实继续位于 `task_execution_records` 与既有 body store。

**Non-Goals:**

- 不检测任意 OS 进程、不引入 heartbeat、lease、后台 scheduler 或自动超时。
- 不自动运行 `--retry`，不采用 Verification Result，不修改 Task Finish current。
- 不恢复 Task Finish diagnostics producer；本次只处理 registered Verification producer。
- 不扫描临时目录寻找证据；Agent 必须使用当前 invocation 返回的 summary 路径。

## Decisions

### 1. 单一 recover action，按证据决定分支

新增 `buildr task execution-record recover --task <id> --record <id> [--summary <file>] [--authorize-unknown-outcome]`。

- 提供 `--summary`：Application 验证 owned transient boundary、summary schema、record/run/invocation/target identity、完成时间、checks 与推导 outcome；全部一致时重建既有 closed record body，并用原 outcome CAS seal 原 record。
- 未提供可用 summary：无授权时返回 `authorization-required` 且零 mutation；携带 `--authorize-unknown-outcome` 时才接受原结果不可证明，写入固定 recovery body 并终结原 record。
- `--summary` 与 `--authorize-unknown-outcome` 互斥，调用方不能提交 outcome、files、locator、SQL 或 producer identity。

选择显式 summary 而非临时目录 discovery，是为了保持 ownership 与 effect target 可证明。选择用户授权 flag 而非自动超时，是因为时间不能证明 producer 已结束。

### 2. `unknown` 是真实终态 outcome，不复用错误的失败枚举

扩展 outcome 为 `unknown`。未知处置后的 record 使用：

- `outcome: unknown`
- `lifecycleStatus: retained`
- `resolutionStatus: acknowledged`
- 受控 recovery body 记录授权、原因和原 identity，不包含用户自由文本或路径。

`unknown` 表示原执行结果不可证明，不等于 `failed`、`blocked` 或 `cancelled`。公共 recover result 使用 `status: attention` 提醒 Agent 该记录不能作为 Verification 结论。

Repository 的 terminal duplicate 查询排除 `unknown`，因此它保留历史但不阻塞下一次普通 invocation。GC 把已 acknowledged 的 `unknown` 按失败类 30 天 retention 处理。

### 3. 终态证据恢复只补 record，不重演执行

恢复 Application 从 transient summary 生成与正常 producer 相同的五个 closed body 文件，并复用现有 redaction、quota、manifest、CAS seal 与 transient cleanup。它不调用 capability runner，也不创建新 record。并发原 producer已先 seal 时，相同 outcome 复用 terminal record；不同终态则 fail closed。

### 4. 连续 migration 修改单表约束

新增下一号 migration 重建 `task_execution_records`，仅把 `unknown` 加入 outcome、terminal state 和 resolution CHECK；保留全部 rows、columns、indexes 与 invocation identity。应用前后由 migration ledger、foreign-key check、row readback 和完整测试保护。

不新增 recovery column/table：unknown outcome、acknowledged resolution、body 与 timestamps 已能完整表达该处置。

## Risks / Trade-offs

- [用户在 producer 仍可能 seal 时授权 unknown] → CLI 明示该授权会终结原 record；CAS 保证只有一个终态，后到的 seal 会失败而不会覆盖。
- [临时 summary 被篡改或错配] → 仅接受 owned boundary，并校验全部 closed identity、完成事实和推导 outcome；任一不一致零写入。
- [migration 重建单表] → 使用连续 migration、保留列级复制和 fresh/upgrade/readback 测试；不由 candidate runtime 写 retained canonical Workspace。
- [unknown 不能证明验证成功或失败] → public result 固定为 attention，且不写 Verification Result/Candidate/Finish。

## Migration Plan

1. 在 candidate Validation Workspace 验证 fresh schema 与从 migration 0014 升级后的 rows/readback。
2. 随正常 Buildr delivery 发布 migration 0015；首次合法 retained writer mutation 原子应用。
3. 旧 runtime 读取更高版本数据库继续 fail closed；不提供降级 migration。

## Open Questions

无。
