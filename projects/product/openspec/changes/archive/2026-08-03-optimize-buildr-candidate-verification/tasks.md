## 1. 审计与契约

- [x] 1.1 完成 Candidate step 的 keep / migrate / delete 审计，确认每项主要证明事实、执行场景和替代 owner
- [x] 1.2 为单一 delivery capability、全局 owner 扩展、Browser 单一 owner和完整回归 membership 增加失败优先的 contract/planner tests

## 2. 验证编排实现

- [x] 2.1 在 `verification.yml` 建立唯一 required `product.delivery`、显式 `product.full-regression` 和条件化必需 Browser capability
- [x] 2.2 从 Candidate registry 删除重复 Browser steps 与失效 resource/group，把 Release Git convergence 迁到 Release，并把 repository onboarding 收敛为 affected/focus
- [x] 2.3 让 changed planner 在全局验证 owner 变化时由同一 plan 扩展为 full，并保持 Quick、changed、focus、Candidate 和 Release 兼容入口
- [x] 2.4 删除 registry 中重复的 `orchestrationScenarios` 分类 authority，清理不再被消费的配置

## 3. 指导与当前认知

- [x] 3.1 更新 `project-testing` 与 `task-verification` 指导，明确成本、范围、验证目标与声明边界
- [x] 3.2 同步 Product 规则、验证实践、release checklist、Brief 与 Buildr Service current knowledge
- [x] 3.3 执行 current knowledge 与 terminology reconcile，确认没有第二套政策或失效说明

## 4. 验证与收敛

- [x] 4.1 运行 Unit/contract、代表性 affected/full plans、Browser 和 Release 专项，修复 owner、路径或兼容问题
- [x] 4.2 对冻结目标运行唯一 delivery capability；若同一 plan 已扩展为 full，则用 contract 证明 `test:candidate` profile parity 而不重复执行，并记录总耗时、最慢阶段、失败和 evidence cleanup
- [x] 4.3 主动审查最终 diff、删除结论和 OpenSpec/current knowledge 一致性，并修复全部高价值 finding
