## Context

Product Candidate runner 已具备 step timeout、进程组和 observed descendant cleanup，但正式 Task Verification 的通用 `process-executor.mjs` 仍直接 `spawn` 并等待 `close`，没有 deadline、cancel signal、进程组、TERM→KILL 或输出边界。Execution Record 会在 execution 前 open，并在 terminal 后 publish body；producer 非正常退出时，open record 没有可回读的当前阶段。Browser dispatcher 又用两个无 timeout 的 `spawnSync`，因此外层卡住时无法区分 web-dist、fixture、browser、assertions 或 cleanup。

本设计只闭合现有 Task Verification、Execution Record 与 Product verification owner 的执行边界。它不建立通用作业平台、监控系统或新 Result authority。

## Goals / Non-Goals

**Goals:**

- 每个正式 command execution unit 在启动前具有 closed deadline，并能在 timeout、取消和异常 cleanup 后形成可解释终态。
- runner 只终止本次创建的进程组和运行期间确认的 descendants，保留其他 Task、开发实例与同名进程。
- open Execution Record 可回读一个有界 current progress snapshot；terminal body 继续保存 closed summary、timeline 与 diagnostics。
- Browser 与 concurrent acceptance 暴露真实 phase、readiness 和资源压力，使失败可定位且调度不互相放大。
- 保持现有 Verification Result、Candidate、显式 retry、Full capacity 与覆盖 authority。

**Non-Goals:**

- 不采集全局 CPU、内存、I/O 或构建持续监控平台。
- 不增加 capability DAG、通用 scheduler、事件历史、日志流服务或第二张执行状态表。
- 不自动重试 timeout/failed capability，不复用跨 Candidate evidence，不放宽 Verification/Finish 门禁。
- 不改变 Browser selector 的功能覆盖、页面行为或 Buildr Web 前端。

## Decisions

### 1. Deadline 属于 planned execution unit，而不是 Agent 临时参数

v3 command invocation 新增可选 `timeoutMs`，closed normalizer 必须为每个 command execution unit解析出确定值；显式值限制为 `1000..1800000`，未声明时使用产品保守默认值 `900000`。provider 产生的 command execution unit必须提交显式 `timeoutMs`。Plan identity包含解析后的 timeout，运行时不得由 CLI flag 或 Agent 临时覆盖。

这样保持现有 v3 declaration 兼容，同时保证 runner 不再收到无界 command。v2 reader只使用同一保守默认值，不向旧声明回填字段，也不扩展 v2 作者模型。Product 的 `product.browser-smoke` 将显式声明适合其真实 build+browser 边界的 timeout。

备选方案是把 `timeoutMs` 设为 v3 必填；这会让现有合法声明立即失效，属于不必要的破坏性迁移，因此不采用。另一个备选是只在 executor 内硬编码统一 timeout；它无法表达真实能力成本，也不能进入 Plan identity，因此不采用。

这项启动前门禁只保护“正式能力不能以无界进程产生无法终结或失真的执行证据”这一结果不变量；放行非法或无法解析的deadline会留下无owner终止边界的进程并可能把未完成执行误报为running或unknown。安全降级是仅阻止该capability启动、返回精确声明诊断并允许修正声明后重试；它不阻止无关开发、只读调查或其他不消费该capability的工作。

### 2. 复用 owned-process primitive，统一正式执行的终止状态机

从 Candidate parallel runner 中提取或下沉共享的 owned-process primitive，正式 executor 和 Product runner复用相同语义：

1. 以独立 process group 启动 root child，并在运行期间采样精确 parent-child lineage。
2. deadline 或 AbortSignal 到达时先发送 TERM，只针对 owned group/descendants。
3. 等待短暂 grace；仍存活时发送 KILL，再有界确认退出。
4. stdio close 另有 deadline，输出使用首尾/总字节有界缓冲并持续生成摘要。
5. 返回 command status、exit/signal、timeout/cancel原因、process cleanup与阶段事实。

单项 check 使用 `passed|failed|timed-out|cancelled`；Execution Record 顶层继续使用兼容的 `passed|failed|blocked|cancelled`：timeout 与 cleanup failure映射为 `failed`，但保留稳定 failure code 和 check status；外部取消映射为 `cancelled`。这样调用方可区分原因，又不扩展顶层 outcome 枚举。

备选方案是按端口、进程名或 Workspace 文本查杀；它可能终止其他 Task 或开发实例，违反 ownership 不变量，因此禁止。

### 3. Execution Record 只保存一份 current progress snapshot

在现有 `task_execution_records` row 增加可空 progress 数据，而不是新增事件表。registered Verification producer 只能在 record 为 open、record/run/invocation/producer identity 全匹配时更新 closed snapshot：

- `capabilityId`、`phase`、`status`；
- `observedAt`、`heartbeatAt`；
- root `pid`、`processGroupId`；
- 已完成/总 capability 数；
- 最后输出的脱敏有界摘要、digest 与原始字节计数。

phase 变化立即更新；heartbeat 最多每 15 秒更新一次；输出摘要不超过 4 KiB，不保存 cwd、env、argv、token、绝对路径或完整 stdout/stderr。每次更新覆盖旧 snapshot，没有 append/history 语义。

现有portable list仍不暴露PID/PGID。只有matching open Verification record的单条detail可返回`openLocalProgress`，明确标记`scope: current-machine`并包含当前PID/PGID；该字段不进入retained body、terminal record或跨机器语义。这样Agent能诊断本机owned process，同时不把机器身份伪装为portable evidence。

terminal seal 与 body publish在同一 authority 内清除 current progress；最终 `summary.json`、`timeline.json`、`diagnostics.json` 继续保存 closed facts。producer 非正常死亡时 open record保留最后 snapshot，Agent 能判断最后阶段但不能把它推断为 terminal outcome；仍按现有 recover 或明确 unknown 授权处理。

备选方案是写增量正文或 sidecar event log；它会复制 Execution Record body authority并扩大 retention/quota，因此不采用。

### 4. Browser dispatcher 使用顺序 phase runner，但每个 phase 异步且有界

Browser capability 仍按 `web-dist → fixture/browser → assertions → cleanup` 的语义顺序运行，不引入 DAG。dispatcher 使用异步 owned-process helper执行 web-dist verifier和isolated browser runner；Browser test通过统一 phase recorder报告 `web-dist`、`fixture`、`browser`、`assertions`、`cleanup` 的起止、耗时与失败。

browser、HTTP server、preview server cleanup均有独立 deadline；cleanup deadline不把已通过断言伪装成完整成功，最终 capability 必须报告 cleanup failure。外层 capability deadline始终兜底并回收 owned descendants。

### 5. Product 资源声明按真实 pressure owner 修正

`concurrent-task-acceptance` 同时创建两套 Task Environment、执行 Verification并启动两个 Preview，因此声明 `workspace-saturating`、`task-lifecycle-heavy` 与 `app-runtime`。这只是压力节流，不表达共享状态锁，也不提高 Full 全局并发。

Preview 启动从固定 10 秒 child kill 改为 readiness-based bounded wait：同时观察 CLI child、instance readiness、health和Environment resource registration；到达总上限后收集进程/health/stdout/stderr摘要，再按 owned-process协议终止。正常快速路径不等待完整上限。

## Testing Strategy

- Unit：v3 timeout schema/default/identity、v2兼容；process state machine 的 TERM/KILL/stdio-close/cancel；progress snapshot bounds、redaction、identity/CAS与terminal clear。
- Integration：真实 child 正常退出、忽略 TERM 后被 KILL、detached descendant回收、其他 Task同名进程保留；正式 Verification open→progress→seal及 producer-loss readback。
- Contract：Plan/公开 JSON closed shape、Product declaration显式 timeout、registry resource claims、Skill/文档指导。
- System：Browser phase success/failure/cleanup timeout；Preview readiness成功与启动不就绪；Candidate调度证明 `concurrent-task-acceptance` 不与冲突资源同时运行。
- Development 使用 focus/affected；只有最终稳定 Content Target 才进入正式 Verification。该策略不把 plan preview 或 focused tests 冒充 Task Verification Result。

## Risks / Trade-offs

- [频繁 heartbeat 增加 SQLite 写入] → 只保存覆盖式 snapshot，15 秒节流并仅在 open record写入。
- [PID 在进程退出后可能复用] → ownership同时绑定run、root process start identity与采样 lineage；KILL 前重新确认实例。
- [默认 timeout 误伤极慢的合法 capability] → 采用 15 分钟保守默认并允许 v3 显式提高到 30 分钟；timeout失败可显式 retry，但不自动重跑。
- [共享 primitive 改动影响 Candidate runner] → 保持现有 Candidate contract，先用 unit/contract parity证明语义等价，再切正式 executor。
- [Browser phase 与外层 capability deadline重复] → phase deadline只提供局部诊断，外层 deadline是最终ownership兜底；两者使用同一取消信号和cleanup结果。

## Migration Plan

1. 扩展 v3 declaration/Plan closed schema、normalizer与兼容 reader；更新 Product declaration和模板/指导。
2. 提取 owned-process primitive并保持 Candidate现有测试通过，再接入正式 executor。
3. 增加 Execution Record progress migration、producer writer与read model；旧rows的progress为absent且继续可读。
4. 迁移 Browser dispatcher、cleanup phase与concurrent acceptance资源/readiness。
5. 运行 focused、affected、strict与正式 Task planning/verification流程；不做数据backfill。

回滚时可以在未形成新 open record 前回退实现与声明；数据库 nullable progress 字段可保留未使用。若已有 open record含progress，旧reader忽略该字段但不得删除或伪造terminal；由新reader恢复或按现有 unknown 授权收敛。

## Open Questions

- 无需用户决定的开放问题；具体默认/phase timeout常量在实现时以本设计范围和测试观测校准，不改变上述上限、ownership与失败语义。
