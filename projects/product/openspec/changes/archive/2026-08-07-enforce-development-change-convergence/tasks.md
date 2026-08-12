## 1. Task Development 门禁

- [x] 1.1 让 Task Development 复用 Task Record Change read model，核验每个 `converged` disposition 的当前 working copy 已归档。
- [x] 1.2 让 `observeCurrent` 在 inspect、freeze、decision 与 handoff 路径重验 Change lifecycle，并以稳定诊断阻止 active、missing、unavailable 或漂移事实。

## 2. 契约与 Agent 使用边界

- [x] 2.1 更新 Task Development capability contract 与随包 Skill，明确 pending、converged、code-only 和 Task Finish 非职责边界。
- [x] 2.2 更新直接受影响的 Product 当前认知与 Change Brief，不新增第二 authority 或空文档。

## 3. 验证与收敛

- [x] 3.1 增加 Application/集成测试，覆盖 Task Environment archived + retained active、active伪报converged、resolver不可用及归档后漂移。
- [x] 3.2 运行受影响 Task Development、Task Record/Change Resolver、contract 与静态验证，修复回归。
- [x] 3.3 完成 current knowledge inspect、OpenSpec strict validation 和 deterministic convergence/archive readiness 检查。
