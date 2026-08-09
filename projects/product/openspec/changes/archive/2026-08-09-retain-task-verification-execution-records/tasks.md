## 1. Verification record正文模型

- [x] 1.1 实现closed Verification body mapper，生成versioned `summary.json`、可选stdout/stderr、有限timeline和diagnostics，并移除持久化禁止字段。
- [x] 1.2 增加mapper的Unit tests，覆盖portable字段、稳定capability边界、target drift、resource diagnostics、secret/绝对路径和closed schema拒绝。

## 2. Formal Task runner接线

- [x] 2.1 在完整调用前校验之后、首次execution副作用之前为matching Task Environment open `verification-execution` record，并保持Task外run transient-only。
- [x] 2.2 实现passed/failed/blocked/cancelled、retry与target drift的terminal seal；不可证明的硬中断保持open，不覆盖current Verification Result。
- [x] 2.3 只有record retained后才精确cleanup transient evidence；seal/attention/cleanup失败保留可恢复现场与portable next action。

## 3. 公开契约与runtime组合

- [x] 3.1 为`buildr.verification-execution/v1`增加additive `executionRecord` operation summary，不暴露SQLite、正文locator或本机持久路径。
- [x] 3.2 更新CLI help、Skill/contract/package runtime closure与JSON schema coverage，使checkout和npm tarball保持一致。

## 4. Development与系统验证

- [x] 4.1 增加Integration/System tests，覆盖formal passed/failed/retry/drift/backpressure/catchable cancellation、Task外transient-only、invalid request零record与seal failure保留transient。
- [x] 4.2 运行受影响的Unit、Integration、System、contract/package parity入口，修复所有由本Change引入的失败。

## 5. 当前认知与收敛准备

- [x] 5.1 更新Brief、技术架构、Buildr Service说明和术语表中“底座尚未接producer”的陈旧事实，并完成术语/knowledge impact核对。
- [x] 5.2 运行`openspec validate retain-task-verification-execution-records --strict`与Change直接验收，确认checkbox、delta和实现一致并达到convergence readiness。
