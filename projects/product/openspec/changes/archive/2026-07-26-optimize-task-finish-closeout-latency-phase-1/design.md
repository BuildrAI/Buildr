## Context

Task Finish 的持久化 run 已解决 session 依赖、重复副作用和目标分支竞态，但 CLI 目前只领取/记录步骤，步骤内部仍由 Agent 手工组织命令。最近一次正常收尾中，大部分额外耗时来自 OpenSpec delta 逐项失败、pre/post-sync 顺序返工、lease 到期、错误 cwd/入口/selector，以及验证完成后的遗留进程。该阶段需要在现有状态机上增加确定性 helper 和证据，而不是提前建设完整 executor。

## Goals / Non-Goals

**Goals:**

- 让 OpenSpec convergence 在真实写入前一次暴露全部可静态识别的不兼容问题，并以 receipt 驱动严格顺序。
- 让长动作可以安全续租，同时只在真实共享写临界区持有 lease。
- 让每个 finish step 使用可预检的执行计划，明确 command、cwd、入口和 selector。
- 让 Candidate/affected runner 回收自身进程组，避免验证结束后留下 task-owned server。
- 让 finish run 可报告阶段 wall-clock、重试和浪费成本，并允许晚期信号再次进入 asset review。
- 以功能测试证明正常路径不发生上述返工；5–7 分钟是第一阶段运行目标，不设置依赖机器性能的硬失败阈值。

**Non-Goals:**

- 不实现能够自行推理和执行所有 provider action 的完整 Task Finish executor。
- 不进行跨步骤激进并行调度，不追求约 3 分钟的第二阶段目标。
- 不改变 OpenSpec 上游 CLI 或外部 `openspec-*` Skills。
- 不要求新 Agent session，也不修改 runtime discovery/loading/activation 机制。

## Decisions

### 1. 在现有 run 中增加结构化 execution plan 与 timing

每次领取 step 时可以提交结构化 command plan。Buildr 只验证绝对/已解析入口、允许 cwd、参数和可选 npm script/verification selector 是否存在，并把规范化计划纳入 fingerprint/evidence；第一阶段不代替 Agent执行命令。run 为每次 attempt 保存 claimed、completed、blocked、duration 和 retry attribution，inspect 返回聚合 timing。

相比立即增加 `task finish run`，该方式先消除确定性输入错误，同时保持 Buildr 不成为 Agent 的边界，并为第二阶段 executor 提供稳定输入模型。

### 2. OpenSpec convergence 使用单一 helper 和阶段 receipt

新增 helper 先静态扫描全部 delta requirement/scenario，再运行隔离 archive rehearsal。通过后产生包含 change、delta digest、canonical digest、OpenSpec executable/version 的 receipt；后续 pre-sync/canonical sync/post-sync 必须按相同 identity 推进。helper 不允许在 canonical 已进入 post-sync 状态后刷新 pre-sync baseline。

静态扫描只聚合确定可验证的问题，OpenSpec CLI 仍是最终 archive compatibility authority；这避免复制完整 OpenSpec merge engine。

### 3. Lease 采用显式 renew 与窄临界区

保留 fencing identity，增加同一 run/step/attempt/token 的 `renew`。续租只能延长当前仍有效且 identity 匹配的 lease，不能复活已过期或被接管的 lease。执行计划声明 shared mutation boundary；只读准备阶段不持 lease，进入写临界区才领取。

相比无限 TTL，这既避免正常长动作过期，也不让崩溃 holder 长期阻塞其他 run。

### 4. 验证 runner 拥有并清理自己的进程组

每个 verification step 在支持的平台使用独立进程组。step 结束或 runner 异常退出时，仅终止该组仍存活的 descendants，并记录 cleanup 状态；Windows 使用已声明的子进程清理策略。不得按端口、名称或宽泛进程匹配清理。

### 5. Asset review 支持 late finalize

保留正式 assurance 后的首次 finalize；archive、integration 或 cleanup 出现新的 observation 时，run 将 asset review 标记为 stale 并在 cleanup 完成前增加 `asset-review-late` checkpoint。provider 仍独占资格审查与人类决定，Task Finish 只传递“存在新 observation revision”的事实。

### 6. 性能目标采用可观测 SLO

run 汇总 happy-path wall-clock、workflow checks、formal assurance、blocked/retry 和 attributable waste。第一阶段验收要求新增功能测试中无无效重跑，并通过实际 finish rehearsal 观察 5–7 分钟目标；不因共享 CI 或机器负载单独判失败。

## Risks / Trade-offs

- [静态 delta 扫描可能遗漏 OpenSpec 内部语义] → 仍运行真实隔离 archive rehearsal，并将静态结果定位为前置聚合诊断。
- [进程组清理误伤] → 只清理 runner 自己创建的进程组，禁止名称、端口和 workspace 范围扫描。
- [续租掩盖卡死动作] → renew 要求未过期 owner identity，并记录次数与总持有时间；失效仍 fail closed。
- [late finalize 增加一步] → 只有 observation revision 在首次 finalize 后变化时触发，否则确定性跳过。
- [execution plan 增加调用参数] → 保持可选兼容；旧 consumer 继续工作，但无法获得 plan preflight 保证。

## Migration Plan

1. 扩展 v1 finish run 的兼容读取，为新增 attempt timing、plan 和 lease renewal 字段提供默认值。
2. 增加 helper、CLI 参数和测试，同时更新随包 Task Finish Skill/contract contribution。
3. 更新 canonical specs 前仅维护 delta；Task Finish 时按 guard 顺序同步和归档。
4. 若发现兼容问题，可停止使用新增可选 plan/renew 能力；旧 inspect/advance/resume 行为保持可用。

## Open Questions

无。完整 executor、跨步骤并行和约 3 分钟 SLO 在第二个 Change 设计。
