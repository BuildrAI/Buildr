## 1. Current input discovery

- [x] 1.1 在 Task Development operation contract、Application、internal driver 与 module runtime port 中增加只读 `discover` action，生成 `observe/policy` 的 `buildr.task-development-current-input/v1` closed `inputJson`，复用 current Task/Environment/Receipt/declaration facts，并保持 mutation 写入前再次校验。
- [x] 1.2 为 `discover` 增加 contract、driver discovery、Application read-only、current policy/default capability/coverage gap 与 stale/blocked 场景测试，证明零 Receipt/applicability/Task/Result 写入。

## 2. Workflow handoff

- [x] 2.1 更新 `task-development` 与 `agent-task-workflows` Skill/contract 指引，要求在 `observe/policy` 前消费 current-input discovery，并将 shared JSON/schema consumer coverage 限定为 focused regression/diagnostic。
- [x] 2.2 更新 `task-verification` Skill/相关 contract tests，明确 plan-first、focused transient feedback、Formal Verification exact plan/invocation reuse 与 Result single-writer 边界；验证不同 target/declaration/capability identity 仍形成新的正式执行。
- [x] 2.3 创建/刷新 Change `brief.md` 与 `.buildr/knowledge-impact.yml`，并在实现稳定后按真实影响 reconcile Service、workflow 与 terminology knowledge。

## 3. 收敛与验证

- [x] 3.1 运行 Change strict validation、focused Task Development/Verification/workflow regression，修复发现的 contract 或兼容问题。
- [x] 3.2 通过 Buildr OpenSpec convergence preflight 与 retained controller 更新 Development planning/implementation facts，完成 current knowledge reconcile，并记录本 Change 的可验证交付结果。
