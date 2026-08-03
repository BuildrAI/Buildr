## 1. Current Result Authority

- [x] 1.1 实现 `buildr.task-verification-result/v1` closed domain model、portable fields 与 current/stale/unknown applicability
- [x] 1.2 实现 `.buildr/tasks/<task-id>/verification.yml` Repository 的原子整值替换、rollback 与唯一 writer guard
- [x] 1.3 实现 Task Verification Application inspect/record、Task/Project scope resolution、declaration identity 观察与 stable operation JSON

## 2. Capability Declaration 与 Execution

- [x] 2.1 将 Project declaration parser/doctor/template/Product `verification.yml` 迁移到 `buildr.project-verification/v2`
- [x] 2.2 将 production runner 迁移为显式 capability + target identity 的 transient `buildr.verification-execution/v1`
- [x] 2.3 删除声明级 plan/DAG lifecycle authority；把 Product-only DAG scheduler 留在 `test/verification/`，按真实 claim 保留资源与 execution cleanup

## 3. Shared Consumers

- [x] 3.1 新增 `task verification inspect|record` CLI、help、command registry 与公开 JSON family
- [x] 3.2 在 Local App Task 详情新增 Verification 只读投影、refresh 与受限 Agent prompt
- [x] 3.3 将 Task Finish verify 迁移为同一 Application reader/补齐 adapter，并删除 required assurance/summary 输入

## 4. Runtime Assets 与 Canonical Knowledge

- [x] 4.1 以 `buildr.task-verification/v3` 原子替换 contract、Skill、reference/template、manifest/binding 与 Buildr routing
- [x] 4.2 更新 Verification/CLI/JSON/Skill contract 文档、Product current knowledge、术语与 Roadmap P0.4 状态，删除旧 authority 说明
- [x] 4.3 评估并 reconcile current knowledge sidecar，确保 canonical specs 与 Change delta 可在 Finish 收敛

## 5. Verification 与 Review

- [x] 5.1 增补 domain/repository/Application/CLI/Local App/Finish、declaration/execution/resource/package parity 测试与 legacy absence guard
- [x] 5.2 运行 focused tests、package/static checks、OpenSpec strict/convergence audit 与 Product Fast 验证并修复所有回归
- [x] 5.3 完成 Task Planning/Completion Review，处理 findings，并形成可供 Task Finish 消费的 current Verification Result
