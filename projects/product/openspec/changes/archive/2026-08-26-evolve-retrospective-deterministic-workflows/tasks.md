## 1. Retrospective provider guidance

- [x] 1.1 更新builtin `task-retrospective` Skill，使首版复盘从有界执行事实图与既有current报告主动探索确定性流程候选
- [x] 1.2 增加候选closed输入、Owner、停止条件、证据、恢复、保留判断、收益和资产落点要求，并落实Core哲学拒绝边界
- [x] 1.3 增强单份/多份复盘处理：先bounded list收窄、逐项inspect、语义聚类和当前事实重评，再向一人或多人展示完整候选与Task effects并等待明确确认

## 2. Capability compatibility and verification

- [x] 2.1 更新`buildr.task-retrospective/v2` contract最低保证，保持Result/Effects/Authorization/Decision Points、Application、schema、binding与consumer依赖不变
- [x] 2.2 扩展package static与contract tests，验证候选发现、哲学护栏、正确资产落点、共同确认和禁止自动mutation
- [x] 2.3 运行runtime Skill projection与受影响consumer组合验证，确认用户Workspace由正常release/update/sync取得行为且现有Task流程不受阻塞

## 3. Knowledge and convergence readiness

- [x] 3.1 更新Brief、Buildr Service current knowledge与knowledge impact，确认不新增glossary术语或持久化平台
- [x] 3.2 运行OpenSpec strict/preflight、focused与affected验证并修复本Change回归
- [x] 3.3 确认全部checkbox可在Change convergence/archive前完成，且Formal Verification、Completion Review、Finish、自举和Environment cleanup未进入本checklist
