# Completed no-change Task 的 Environment cleanup

一句话摘要：让合法完成且确认无代码变更的正式 Task，在 Git checkout 干净且 HEAD 未漂移时由 Task Environment 唯一 owner 安全清理环境。

## 背景与问题

无代码协调 Task 可以用 `completed + noChange=true` 结束，但现有 cleanup 只接受 Delivery evidence 或 abandon。结果是 Task terminal 已成立，Environment checkout、分支与资源却无法释放，候选版恢复任务已经实际触发该缺口。

## 目标与非目标

目标是补齐 no-change terminal disposition 到 Environment cleanup 的安全交接，并保留 dirty/HEAD drift 的 fail-closed 边界。非目标是不改变 Task Record schema、Task Finish、abandon 或发布事务，也不允许调用方伪造 no-change proof。

## 受影响用户或角色

- 执行无代码协调 Task 的 Agent：完成后可以通过标准 cleanup 释放 Environment。
- 发布或其他协调流程的维护者：不再需要把无代码 Task 伪装成有 Delivery 的任务。
- Git provider：继续承担 checkout/branch/HEAD/clean 的独立技术证明。

## 核心流程与关键变化

Task Environment Application 读取 current Task Record；精确命中 `completed + noChange=true` 时生成内部 cleanup disposition。Git provider 随后验证 checkout clean 且 HEAD 等于 Environment evidence 冻结值，通过后才删除 Task-owned worktree、分支与 evidence；任一漂移都保留现场并返回明确诊断。

## 影响、风险与兼容性

公共 CLI 参数不变，普通完成与 abandon 路径不变。主要风险是误把 no-change 声明当作源码删除证明；通过 provider 的 clean 与 exact HEAD 双重检查规避。旧 Environment 若存在 HEAD 漂移会保持 blocked，需要先交付或处置新增提交。

## 验收摘要

- active Task cleanup 仍被拒绝。
- completed no-change 且 clean/HEAD unchanged 时 cleanup cleaned。
- dirty 或 HEAD drift 时 fail closed。
- completed non-no-change 且无 Delivery evidence 时仍被拒绝。
- focused、fast、formal affected verification 均通过，delta 经 strict/preflight/converge 归档。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/task-environments/spec.md`
- `specs/cli-product-surface/spec.md`
- `tasks.md`
