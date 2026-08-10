# 治理 Task Finish 执行诊断产物

## 一句话摘要

正式Task的每一次实际Finish invocation在不改变Finish owner状态机的前提下，通过既有Task Execution Record Application有限期保存受控diagnostics、timeline与output。

## 背景与问题

Task Finish当前以一个`task_finish_current` row承载逻辑run及恢复状态，完整命令诊断只在成功后会清理的transient现场中存在；同一run经过blocked、target race或cleanup resume时，各invocation不能独立追溯。Execution Record底座已经登记`task-finish/finish-diagnostics`，但Finish producer尚未接入。

## 目标与非目标

目标是让每次真正执行的Finish invocation在首次副作用前预留record容量，保存portable summary、固定五阶段timeline、diagnostics与受控stdout/stderr，并只在record retained后清理精确diagnostics transient。

本Change不改变固定五阶段、Delivery Carrier、target lease、resume、Environment cleanup或Task terminal owner，不增加record reader/Inventory、Consumer/Adoption、批量GC、第二Finish Result或SQLite migration。

## 受影响用户或角色

- Agent：能区分同一Finish run的失败、恢复与cleanup invocation，并在record attention时保留可恢复diagnostics现场。
- Workspace维护者：保留固定quota、retention与脱敏边界，同时避免execution record干预Carrier和交付终态。

## 核心流程

1. Application只读校验Task、Environment、Development handoff、target/remote、resume token和no-op。
2. 需要执行时先以独立invocation identity open record；backpressure时不发生Finish副作用。
3. open成功后建立invocation diagnostics transient并执行既有固定五阶段。
4. producer把closed body交给Execution Record Application seal。
5. record retained后精确cleanup diagnostics transient；Finish owner独立保留或清理Carrier和恢复资源。

## 关键变化

- 增加Finish invocation collector与closed body mapper。
- 将Finish Application分成只读plan、record gate和owner execution。
- `task_finish_current`移除attempt diagnostics/history，只保留current与恢复必需owner facts。
- `buildr.task-finish-result/v2`additive增加portable `executionRecord` summary。
- seal failure不回滚或重放已成立的delivery、cleanup或Task terminal事实。

## 影响、风险与兼容性

- 无schema migration；复用现有Execution Record配额、正文Store与retention。
- JSON v2只增加字段，`task finish inspect`继续pure Finish read model。
- hard crash可能留下open record和partial transient，后续owner recovery贡献处理。
- current payload收敛需通过target race、Delivery Adaptation、Doctor与cleanup-pending resume回归证明不丢owner恢复事实。

## 验收摘要

- passed、blocked/resume、failed、target race与cleanup pending形成独立、正确outcome records。
- invalid/no-op不创建record；backpressure时current、remote、Carrier与恢复资源零变化。
- retained后只清理diagnostics transient；seal failure保留transient且不改写Finish终态。
- body与公开JSON不暴露绝对路径、argv、token、credential或SQLite/body locator。
- current/inspect不保存或读取execution record identity/history和完整attempt diagnostics。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Execution Artifacts delta](specs/task-execution-artifacts/spec.md)
- [Task Finish Execution delta](specs/task-finish-execution/spec.md)
- [Public JSON Contracts delta](specs/public-json-contracts/spec.md)
- [Tasks](tasks.md)
