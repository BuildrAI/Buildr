## Context

Formal Verification 已在任何 capability/process 副作用前通过 Task Execution Record Application 打开 record，结束后把 `summary.json`、`timeline.json`、诊断与受控输出 seal 到同一 authority。Buildr Web 已能按 Task list/detail/body 读取这些 records，但 Agent CLI 只有 Workspace 级 GC；因此终端或工具 session 丢失后，Agent无法重新定位 open/retained execution。

现有 `verification run --json` 还承诺单一 stdout JSON object。通过提前输出半成品 JSON、NDJSON 或把 runner 改成后台 daemon 会破坏兼容性，并额外引入执行 owner、进程恢复和第二状态机。本设计复用现有同步 runner与SQLite authority。

## Goals / Non-Goals

**Goals:**

- Agent 只凭 Task ID 即可列出 Verification records，并按 record ID 读取 compact 终态、耗时、失败与正文文件入口。
- 相同 Task、target、Project/declaration 与 capability set 的 active invocation 默认只能有一个 producer execution。
- 显式 retry 创建独立 run/record，保留失败与重试历史，不覆盖旧事实。
- list/inspect 与重复启动保护都复用现有 Task Execution Record Application 和 SQLite row。

**Non-Goals:**

- 不把同步 Verification 改成后台队列、daemon、可远程控制的 job system或自动续跑系统。
- 不让 execution record 代替 Task Verification Result、Candidate、Development decision 或 transient process owner。
- 不开放任意正文 path、SQLite locator、环境变量或完整敏感命令。
- 不改变 Buildr Web 现有 HTTP read authority，也不在本任务中设计通用跨 owner 去重。

## Decisions

### 1. 在既有 record metadata 中保存 closed `invocationIdentity`

`invocationIdentity` 由规范化 Task ID、target identity、Project code、declaration identity与排序后的 capability IDs生成。它不包含授权表达、并发度、本机路径、run ID、时间或随机数；调用方不能通过改写非scope参数绕过相同验证范围的active保护。

选择持久 closed identity，而不是从 `summary.json` 反推，是因为 active record 尚未 seal 正文；重复检查必须发生在启动 capability 前。该字段通过连续 SQLite migration 加入现有表，不建立新表或新 authority。

### 2. active duplicate 检查由 Task Execution Record Application 原子完成

Verification producer在生成随机 run ID 后，以同一 Application operation提交 `invocationIdentity`。Repository transaction先查询相同 Task/owner/kind/invocation identity 的 `open` record；`attention`已经具有terminal outcome和正文事实，不代表producer仍在执行：

- 默认模式返回 existing active record，producer不取得新的 execution ownership，也不启动 capability；
- `--retry` 明确允许创建新 run/record；
- terminal retained/cleaned history不阻止未来正常验证。

不采用 runner 先 list 再 open 的两步检查，因为并发调用会产生检查—创建竞态。

### 3. `verification run` 保持同步单对象协议

runner不会提前向 stdout 打印 record ID。record 在启动副作用前已持久化，因此 session 丢失后，另一次 Agent 调用可以用 Task ID 执行 `task execution-record list --view verification` 定位最新 open/retained record。这样保留现有 JSON consumer兼容性，也不需要让 CLI process 脱离终端生命周期。

### 4. CLI 只开放 portable list/inspect

- `task execution-record list --task <id> [--view all|verification|finish]` 返回有界 records。
- `task execution-record inspect --task <id> --record <id>` 返回 portable record、available body files，并对 Verification record读取/投影受控 `summary.json` 与适用 `diagnostics.json` 的 compact facts。

inspect不返回正文 locator或本机路径；需要完整受控正文仍由既有 body-file Application能力处理，当前任务不增加任意文件读取CLI。

### 5. 重复启动返回稳定非执行结果

发现 existing active invocation 时，`verification run --json` 返回同一 `buildr.verification-execution/v1` family中的 `status: active`、existing record/run identity、零 checks、零 capability/process effect和明确 list/inspect next action。它不把已有执行误报为 passed/failed，也不自动等待或采用结果。

## Risks / Trade-offs

- **旧 record 没有 `invocationIdentity`** → migration保持字段 nullable；旧记录可读但不参与 active duplicate匹配，新 producer只写新字段。
- **producer不可捕获死亡会留下 open record并阻止默认重启** → Agent先 inspect确认事实；只有明确 `--retry` 才旁路，不自动猜测旧进程已死。后续 resolution/cleanup仍由既有 owner规则处理。
- **并发 retry 可以产生多次执行** → 这是显式 caller选择；每次有独立 run/record并受既有quota/backpressure限制。
- **CLI inspect读取正文增加I/O** → 只读取closed小型JSON文件并使用既有完整性校验和512 KiB响应上限；列表不读取正文。
- **active发布制品Change也修改CLI registry** → 两个Change不修改相同具体Requirement；交付时由Task Finish对最新dev进行机械carrier适配，冲突时保持fail closed。

## Migration Plan

1. 增加连续SQLite migration，为`task_execution_records`添加nullable `invocation_identity`及active lookup索引。
2. 更新domain/repository/Application closed shape，保持旧row读取兼容。
3. 更新Verification producer与JSON contract，再登记CLI list/inspect。
4. 用migration、原子并发、CLI/System和真实session-loss readback fixture验证。
5. 回滚代码时旧binary必须能处理schema前进边界；正式交付遵循现有Buildr package migration兼容门禁，不反向删除column或历史record。

## Open Questions

无。后台执行、open-record失活判定和正文文件CLI若未来有明确需求，应分别建立Change，不能并入本次恢复读模型。
