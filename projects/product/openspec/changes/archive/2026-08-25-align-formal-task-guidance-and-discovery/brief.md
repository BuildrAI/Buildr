# 对齐正式任务操作指导与发现能力

## 摘要

修复 Formal Verification、Task Environment Plan 与 Parent Acceptance 三个既有交接点的操作断层，让 Agent 能从产品返回的同源事实继续工作而不试错或重复动作。

## 背景与问题

Verification 在 preparation admission 阻塞且尚无 durable Execution Record 时，默认 compact 输出不能携带 Plan request；Environment Plan record 又缺少输入发现；Parent 已记录 current Acceptance 后，Parent startup next 仍可能遮蔽 Development 的后续动作。

## 目标与非目标

目标是提供唯一的 compact → full 安全降级、同源 Plan request schema/example，以及 Acceptance 后正确的 typed next 组合。非目标是新增 recovery authority、store、gate、自动推进、Receipt 字段或 capability/schema major。

## 受影响角色与核心流程

受影响角色是执行正式 Task 的 Agent。核心流程为：preparation blocked 时对同一 Verification invocation追加`--detail full`读取`admission.recovery.planRequest`；形成 Environment Plan input 前读取`plan record --schema|--example`；Parent Acceptance current 后继续消费顶层`task next`中的 Development 动作。

## 关键变化

- compact preparation failure 保持`recovery: null`并明确 full 降级路径。
- Plan record 公开零副作用、与 normalizer 同源的 schema/example。
- Parent startup 在 current Acceptance 后不再返回`accept-parent`。
- 三个随包 Task Skills 与聚焦回归测试同步上述行为。

## 影响、风险与兼容性

改动为兼容扩展，不改变现有持久化或 writer authority。主要风险是调用方误把 full 当默认输出或把 startup `next: null`当流程终止；Skill 与 Task Entry 组合测试分别约束这两点。

## 验收摘要

验证 compact 不内联 Plan request且指向 full；schema/example 可在没有Task ID或Workspace读取时返回并通过真实 normalizer；current Parent Acceptance 后顶层 Task Entry 保留 Development typed next；相关 unit、integration 与 contract 测试通过。

## 技术入口

- `src/verification/application/verification-application.mjs`
- `src/task/domain/task-environment-plan.mjs`
- `src/task/interfaces/cli/task-environment.mjs`
- `src/task/application/parent-coordination-application.mjs`
- `src/task/application/task-entry-snapshot-application.mjs`
- `resources/workspace/skills/buildr/task-{verification,environment,development}/SKILL.md`
