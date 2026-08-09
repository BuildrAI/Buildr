## 1. Domain 与 Development authority

- [x] 1.1 实现 closed Parent Plan、Contribution reference/binding、Contribution Handoff Domain，覆盖identity稳定性、引用闭包、依赖无环、文本/数量边界和非法状态测试。
- [x] 1.2 将Task Development Receipt升级为v3，在现有`task_development_current`整值authority内保存可选Parent Plan/planned Contributions并扩展immutable handoff；保持v2 absent-compatible且不新增SQLite表/backfill。

## 2. Parent coordination Application 与 Task边界

- [x] 2.1 实现Parent Coordination Application的inspect/record/reconcile/final acceptance actions，复用Task Record、Development、Review与Finish Applications，提供expected identity冲突保护和legacy模式。
- [x] 2.2 扩展Task Record/Review/Finish接线与批量read ports，覆盖Child状态不传播、completed无handoff为unproven、superseded abandon、partial residual和Parent显式完成测试。

## 3. Public clients

- [x] 3.1 接入CLI、help/registry与closed public JSON schemas，验证Parent Plan bytes不随Child状态变化、Planning Review applicability和CLI/Application parity。
- [x] 3.2 接入Local App HTTP与`product/buildr-web` Task协调视图，覆盖legacy空态、Child planned/delivered/residual/superseded展示、same-origin/session/expected identity mutation，并重建`web-dist`。

## 4. Agent contracts 与防重复authority

- [x] 4.1 更新Task Manager/Triage/Development/Review/Finish及必要Parent coordination Skill、capability contracts/bindings/package parity，验证Child独立Change、显式reconciliation、无checkbox同步和无第二store/writer。
- [x] 4.2 增加fresh Workspace与连续upgrade、old/new Receipt共存、无历史backfill/单Task migration、无`task_lifecycle_current`替代品、无GET filesystem scan及active Change单owner的Unit/Integration/System/contract测试。

## 5. 当前认知与架构文档

- [x] 5.1 根据最终实现更新technical architecture、Buildr Service说明、Task lifecycle/coordination roadmap与glossary，并在`projects/product/docs/architecture/parent-child-task-coordination-model.md`写完整父子任务模型文档，说明authority、数据流、reconciliation、兼容策略和客户端边界。
- [x] 5.2 收敛Brief/knowledge impact与所有delta specs，运行OpenSpec strict/convergence检查并确认未修改`govern-task-intermediate-artifacts`及任何历史Parent Task/Change。

## 6. 实现验证

- [x] 6.1 运行受影响Quick/Unit/Integration/System、public JSON、CLI/Local App parity与browser smoke反馈，修复全部回归并重建静态产物。
- [x] 6.2 运行完整Product Candidate，读取timing/evidence/cleanup summary，确认fresh/upgrade、Doctor/runtime sync与全部关键验收场景通过并达到archive readiness。
