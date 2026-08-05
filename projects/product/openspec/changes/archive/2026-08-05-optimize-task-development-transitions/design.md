## Context

当前 `task-development-driver.mjs` 静态导入完整 composition root，但实测 module load 约 60–70ms、`createRuntime()` 约 2–3ms，完整 `inspect` 约 0.7–0.8s。此前 7.36 秒数据把外层工具调度算入产品进程，并引用了不存在的 `dist/task-development-driver.mjs`，不能作为实现基线。

真实重复发生在单次 Application operation 内：Task Development、Task Record、Review、Verification 与各 repository 会多次确认同一个 canonical Workspace；每次确认都会观察 Git checkout。各 repository 也会反复读取并校验同一组 migration scripts。Local App 会长期复用 runtime，因此不能使用无失效机制的进程级 Workspace 状态缓存。

## Goals / Non-Goals

**Goals:**

- 让内部 driver 可选输出产品进程内、可归因的 module load、runtime composition、Application execution 与 serialization 计时。
- 只在一次同步 Application operation 内复用 canonical Workspace 判定，并复用不可变的 package migration assets。
- 保持 Task Development 的 Application authority、SQLite transaction、Receipt schema 与 fail-closed 诊断不变。
- 用结构性调用次数和结果等价测试防止重复观察回归；以多次实测报告改善，不设置机器相关的硬毫秒门禁。

**Non-Goals:**

- 不提供公共 Task Development CLI，不把多个 lifecycle transition 合并成批量写操作。
- 不引入 daemon、跨进程缓存、常驻 writer、第二 repository、锁服务或新状态平台。
- 不跨 operation 缓存 Task Record、Environment、Review、Verification 或 Development read model，不弱化每次 operation 对 current facts 的重新观察。
- 不承诺绝对 2–3 秒阈值；当前产品进程本身已经低于该范围。

## Decisions

### 1. 使用显式 operation scope，而不是 runtime 生命周期缓存

Workspace SQLite infrastructure 提供同步的 `withWorkspaceStructuredStoreOperation(targetRoot, operation)`。Task Development Application 的每个公开 action 在该 scope 内执行；scope 只缓存本次 action 已成功确认的 canonical root，并在 action 返回或抛错时立即释放。

选择 operation scope 是因为 Local App 的 runtime 可以长期存活。进程级 `Map<root, valid>` 可能在 Git checkout 或 Workspace identity 变化后继续返回陈旧结论；operation scope 的生命周期与一次 currentness 判断一致，不跨 action 复用事实。

### 2. 复用 owner Application 已形成的 operation snapshot

Task Record `inspect` 与 Task Environment `inspect` 在operation scope内按canonical root、Task ID和输入identity memoize。缓存值只能来自各自owner Application的完整read model；Task Development与其他consumer仍调用owner Application，不直接读取其repository。mutation、不同输入和scope外调用不复用。

这避免同一Task Development action先为Task/change context探测Environment、随后又为execution context重复完整probe。一次同步action采用同一组current inputs是明确snapshot语义；下一个action会重新观察。

### 3. 只缓存不可变 package migration assets，不共享 SQLite connection

默认 package migrations 在模块加载后按内容读取、排序和校验一次；测试或显式传入的自定义 migration root 继续每次读取。SQLite connection、transaction 和 repository read model仍由原调用方打开、关闭和校验，不在不同 Application 之间共享。

这比 connection pooling 更克制：可以消除确定性静态文件重复读取，同时不改变 transaction、busy、close 或并发 writer 语义。

### 4. 计时通过 opt-in `--profile` wrapper 输出

默认 driver stdout 继续保持现有 `buildr.task-development-operation-result/v1`。只有显式 `--profile` 时，driver 动态导入 composition root，并输出 `buildr.task-development-driver-profile/v1` wrapper，包含原始 `result` 与 response-only `timing`：`moduleLoadMs`、`compositionMs`、`applicationMs`、`serializationMs`、`totalMs`。

选择 opt-in wrapper 而不是给现有 operation result 追加字段，避免改变 Skill 与测试对默认 JSON shape 的依赖。计时不写 Receipt、SQLite 或其他长期状态。

### 5. 性能回归以结构性上限为主

测试证明一次 Task Development action 只建立一个 operation scope，同一 scope 对相同 canonical root 只执行一次 Git checkout observation；同时验证 scope 外会重新观察、异常后不会泄漏缓存。基准测试多次执行真实 driver，报告中位数或样本范围，但不把 CI 抖动变成功能失败。

## Risks / Trade-offs

- [Risk] operation scope 使用隐式同步上下文，未来异步化后可能越过生命周期边界 → scope 明确拒绝 Promise 返回值；若 Application 未来异步化，必须改用显式 context 参数或 AsyncLocalStorage 并重新评审。
- [Risk] 同一action内并发外部writer改变Task或Environment → operation snapshot只代表action开始后由owner Application确认的inputs；Buildr现有单active writer约束不变，后续action必须重新观察。
- [Risk] package migrations 在长寿命进程中发生磁盘替换 → Buildr 更新后本就需要启动新产品进程；自定义 migration root 不缓存，测试与修复路径仍能观察变化。
- [Risk] 只缓存 canonical 判定不能消除全部 SQLite open/close → 本次先交付已证明且低风险的重复成本；connection/session 复用留到有独立 transaction 设计与证据时再评估。
- [Trade-off] `--profile` 使用动态 import，默认路径保持静态 import 的简单性；profile 路径会有少量测量代码开销，但能准确区分 module load 与 Application execution。
