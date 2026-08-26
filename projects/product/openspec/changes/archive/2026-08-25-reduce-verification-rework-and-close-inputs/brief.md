# 减少重复验证并生成可执行研发输入

## 一句话摘要

为 Task Development 增加基于 current facts 的 closed mutation input discovery，并把开发期 `Task-affected` feedback 与 Formal Verification 收敛到 plan-first、single-writer 的交接边界。

## 背景与问题

复盘确认开发期 affected 反馈和正式验证可能重复执行；`observe/policy` 只有静态 schema/example，Agent 需要手工组合 Task、Environment、Change 与 declaration 输入，容易在末段才发现约束错误。

## 目标 / 非目标

目标是提供无副作用的 current input discovery、复用同一 Verification Plan/Execution identity，并将 shared consumer coverage 限定为 focused regression/diagnostic。

本次不自动跳过 Formal Verification，不把 transient feedback 变成 Result，不新增持久 authority、数据库迁移或通用 Full Verification gate。

## 受影响用户或角色

- Agent：读取 current input 后执行 Task Development mutation，并区分 feedback 与 Formal Verification。
- Task Development：继续独占 Receipt、policy、Candidate 与 handoff writer。
- Task Verification：继续独占 Formal execution/Execution Record 与 Result reconciliation。
- Buildr Service maintainer：维护 driver contract、Skill 与 focused consumer tests。

## 核心流程

1. matching ready Environment 与 Development Receipt 就绪后，Agent 用 `task-development discover` 取得 `observe/policy` 的 current `inputJson`。
2. Application 在 mutation 写入前再次校验 Task、Change、Environment、declaration 与 identity；discovery 不写入任何 lifecycle fact。
3. 需要 broad affected feedback 时先形成/复核 Verification Plan；正式验证复用同一 plan，局部反馈保持 transient。
4. shared JSON/schema 变更只执行直接 consumer 的 focused regression/diagnostic，不把未知 consumer 升级为通用门禁。

## 关键变化

- 新增内部 response-only `discover` action，返回 `buildr.task-development-current-input/v1`。
- 保留既有 `observe/policy` input 与正式 Verification Result authority。
- Skill 明确 plan-first、exact invocation reuse、feedback non-formal 与 focused coverage 边界。

## 影响 / 风险 / 兼容性

Discovery 是 snapshot，调用后 facts 漂移仍由原 mutation/application fail closed；Plan 与执行时 identity 漂移时重新计划，不复用旧 preview。既有 action、Receipt、Execution Record 与 Result schema 保持兼容。

## 验收摘要

- `discover` 能为 current `observe/policy` 生成 closed input，且零写入。
- current policy 的 explicit overrides 不被默认值覆盖；declaration 无 usable capability 时形成 typed coverage gap。
- 同一正式 Verification request 不因开发/正式阶段切换重复 broad execution；focused feedback 不形成 Result。
- strict validation、convergence preflight、focused regression 与最终 knowledge reconcile 通过。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Development delta](specs/task-development/spec.md)
- [Task Verification delta](specs/task-verification/spec.md)
- [Agent workflow delta](specs/agent-task-workflows/spec.md)
- [Implementation tasks](tasks.md)
