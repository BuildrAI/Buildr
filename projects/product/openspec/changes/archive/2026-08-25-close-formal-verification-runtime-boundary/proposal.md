## Why

正式验证（Formal Verification）已经要求“有界执行”和 owned descendant cleanup，但当前通用 command executor 仍会无期限等待子进程 close、在内存中累计输出，Browser dispatcher 也以无 timeout 的同步子进程串行执行。能力卡住、取消或 producer 失联时，Buildr 无法稳定区分 timeout、cancelled 与 cleanup failure，也不能说明最后停在哪个能力和阶段，导致人工查进程、接受 unknown 或重复运行昂贵验证。

## What Changes

- 为 Project verification command invocation 增加声明式执行时限，并由正式 runner 在启动前解析为 closed execution unit；缺失、非法或越界的时限在启动前失败。
- 让正式 command executor 建立本次运行专属的进程组与 descendant ownership，执行 TERM → 有界等待 → KILL → 退出确认，只清理本次 owned process。
- 将 timeout、cancelled、process cleanup failure 与普通 command failure 分开记录；在同一 Execution Record authority 中保存一个有界 current progress snapshot，包含当前 capability/phase、heartbeat、PID/PGID 和最后输出摘要，不建立事件流或第二状态平台。
- 将 Buildr Web Browser dispatcher 改为异步 owned runner，分别记录 web-dist、fixture、browser、assertions、cleanup 的开始、结束、耗时与诊断，并为浏览器、server 与 preview cleanup 设置独立有界收敛。
- 修正 `concurrent-task-acceptance` 的 `task-lifecycle-heavy`、`app-runtime` 资源声明，并把 Preview 固定 kill 改为 readiness-based bounded timeout。
- 保持 Full capacity=1、验证覆盖、Candidate/Result authority 与显式 retry 规则不变；不静默重试，不采集全局 CPU/内存/I/O 作为门禁。
- 本变更不包含破坏性变更；现有 v2 declaration reader 保持只读兼容，新增时限只扩展 v3 作者模型。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `project-test-capabilities`: v3 command invocation 增加有界 execution deadline，并明确 legacy v2 不回填新字段。
- `task-verification`: 正式 command execution 必须有界终止、区分 timeout/cancelled/cleanup failure，并只清理 owned processes。
- `task-execution-artifacts`: open Verification record 增加同 authority 的有界 current progress snapshot，terminal seal 后清除 current progress 并保留 closed timeline/diagnostics。
- `product-verification-quality`: Product runner、Browser 和 concurrent acceptance 的资源、phase timing、readiness timeout 与 failure diagnostics 要求收敛。
- `buildr-web-browser-verification`: Browser dispatcher 与 browser/server/preview cleanup 必须异步、有界并保留阶段诊断。
- `agent-task-workflows`: Agent 读取 running/timeout/cancelled/cleanup failure 时只消费同一 Execution Record 和显式 recovery，不重复启动验证。

## Impact

- Product declaration/schema：`projects/product/verification.yml`、Project verification v3 parser/normalizer/JSON schema、声明模板与 Task Verification 指引。
- 正式执行：`src/verification/infrastructure/process-executor.mjs`、capability runner、resource coordinator、Verification Application 与 Execution Record projection/recovery。
- Product harness：`test/verification/browser-selector-dispatcher.mjs`、Browser smoke cleanup、`concurrent-task-acceptance`、registry/resource contracts 与 timing evidence。
- 验证：Unit 覆盖 timeout/cancel/TERM→KILL/ownership/progress；Integration 覆盖正式 Verification seal/recovery；System 覆盖 Browser 阶段、Preview readiness 与并发资源调度。
- 无新增外部依赖、远端系统或发布副作用。
