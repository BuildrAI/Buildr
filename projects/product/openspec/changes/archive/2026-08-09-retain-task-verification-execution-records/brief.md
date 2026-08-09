# 保留正式任务验证执行记录

## 一句话摘要

正式Task的每一次command Verification attempt在继续使用transient runner的同时，通过既有Task Execution Record Application有限期保存受控执行历史和诊断。

## 背景与问题

C1已经交付单表execution record metadata、Workspace-local受限正文Store、固定quota/backpressure与retention/cleanup primitive，但尚未接入producer。当前`verification run`的stdout、stderr、耗时、资源等待与target drift只存在于临时目录；cleanup后失败、重试和中断无法解释。

## 目标与非目标

目标是在正式Task execution启动前取得record reservation，一次runner invocation对应一条独立record，并安全保存portable summary、输出、timeline和diagnostics。Task外runner继续transient-only，current Verification Result继续只保存正式专业结论。

本Change不修改SQLite schema，不建立Consumer/Adoption、retry、resource或event/history表，不接Finish、Inventory、批量GC/Doctor，也不持久化Agent invocation。

## 受影响用户或角色

- Agent：可以解释正式Verification的失败、重试、取消和target drift，并在record安全保留后清理transient目录。
- Workspace维护者：通过固定quota、retention和resolution边界避免无界日志与误删。

## 核心流程

1. runner完成参数、Environment、declaration、capability、authorization与execution root校验。
2. 正式Task run生成run ID并open execution record；backpressure时不启动producer。
3. runner执行capabilities并形成transient payload。
4. producer把受控正文交给execution record Application seal。
5. seal retained后精确cleanup transient run；Agent再独立提炼并record current Verification Result。

## 关键变化

- 正式Task runner增加execution record open/seal/cleanup编排。
- 复用`summary.json|stdout.txt|stderr.txt|timeline.json|diagnostics.json` closed正文集合。
- `buildr.verification-execution/v1`兼容增加portable execution record operation summary。
- passed、failed、blocked、cancelled、retry、target drift与可捕获中断具有确定性映射。

## 影响、风险与兼容性

- SQLite和正文Store无migration；配额与retention沿用C1。
- seal失败时formal run不报passed并保留transient现场，避免证据双失。
- 新公开JSON字段为additive；Task外调用保持既有runner和cleanup语义。
- 不可捕获进程死亡保留open record，后续由owner recovery/Doctor贡献处理。

## 验收摘要

- formal passed/failed/retry/drift/backpressure/catchable cancellation均形成正确record和正文。
- invalid request与Task外run不会创建record。
- current Result不增加日志、history或adoption字段。
- secret、绝对路径、token、env、stdin与raw敏感argv不进入持久正文。
- strict OpenSpec、受影响测试、package parity和正式Task验证通过。

## 技术artifacts入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Verification delta](specs/task-verification/spec.md)
- [Task Execution Artifacts delta](specs/task-execution-artifacts/spec.md)
- [Public JSON Contracts delta](specs/public-json-contracts/spec.md)
- [Tasks](tasks.md)
