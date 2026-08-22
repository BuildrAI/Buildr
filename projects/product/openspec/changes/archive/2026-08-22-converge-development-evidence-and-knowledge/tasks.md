## 1. Verification authority reconciliation

- [x] 1.1 将 Task Verification Result 升级为 v2 current writer / v1-v2 dual reader，加入 Candidate 与 closed evidence authority，并保持 SQLite 单一 current slot 和原子整值替换
- [x] 1.2 让正式 Verification execution 在副作用前绑定 current Candidate，并实现只从 matching terminal Execution Record 提炼 facts 的 `task verification reconcile`

## 2. Development evidence aggregation

- [x] 2.1 调整 Development freeze/applicability，使 Candidate 在 stable Content Target 与 policy 后形成，Verification 与 Completion gate随后绑定同一 Candidate
- [x] 2.2 增加 Current Knowledge disposition action 与 handoff 聚合，保证 completion-critical conflict blocked、解释性 drift attention 且不固定执行顺序

## 3. Agent contract and current knowledge

- [x] 3.1 更新 source Task Development、Task Verification、Current Knowledge Skills/contracts与internal workflow contract，明确 reconciliation、Candidate-first和attention边界
- [x] 3.2 收敛 Brief、product/technical architecture、Buildr Service knowledge与glossary，并完成terminology/current knowledge reconcile

## 4. Verification and convergence

- [x] 4.1 增加 domain、Application、CLI/contract与journey测试，覆盖v1兼容、matching reconciliation、claimed success拒绝、Candidate漂移和knowledge attention隔离
- [x] 4.2 运行focused/affected验证，完成OpenSpec strict validation与deterministic convergence/archive readiness
