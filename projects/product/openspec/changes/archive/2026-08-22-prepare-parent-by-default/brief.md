# Parent Task 默认完整准备

## 一句话摘要

让 Agent 在创建 active Parent Task Record 后，默认继续完成 Child 前的全部专业准备，并只在真实 blocker 或可选择首个 Contribution 时停下。

## 背景与问题

Buildr 已具备 Task Environment、Task Development、Parent Plan、Planning Review、planning refresh 和 Parent-aware `task next`，但内置 Skills 仍可能把 Task Record 创建成功当作用户目标完成。结果是 Parent 只有顶层记录，没有目标、架构决定、Contribution Map、依赖与最终验收的 current 规划，也没有准备到 `start-child-contribution`。

## 目标与非目标

目标是为“创建/准备/拆分 Parent”建立稳定的跨 Skill 自动交接：`task-manager` 创建记录后交给 `task-development`，后者持续消费 current next 并调用各专业 owner，直到 Child 前停止点。

非目标是不修改 Task Record writer 边界，不新增一键 `parent start` 聚合写命令，不自动创建 Child、执行 Parent 普通实现或完成 Parent。

## 受影响用户或角色

- 要求 Agent 创建并拆分 Parent Task 的 Buildr 使用者。
- 组合 Task Record、Environment、Development、Review 与 Parent Coordination 的 Agent。

## 核心流程

Agent 在创建 active Parent Task Record 后，若当前用户目标包含准备 Parent，则立即交接 `task-development`。后者准备 matching Environment、建立 Development，在信息充分时记录完整 Parent Plan，完成 Planning Review 与 planning refresh，并在每步后重新读取 current next。只有真实 blocker 才向用户请求决定；`start-child-contribution` 返回后展示 eligible Contributions 并等待用户选择。

## 关键变化

- `task-manager` 明确 active Parent 创建后的自动交接条件。
- `task-development` 明确 Parent 默认准备循环、已知信息复用和唯一成功停止点。
- `task-triage` 明确创建前语义与创建后连续推进，不把 record created 冒充 ready。
- contract tests 固化 owner 分离、blocker 和 Child 前停止语义。

## 影响、风险与兼容性

改动只影响随包 Agent Skills 与工作流规范，不改变 CLI、SQLite、capability contract、专业 Application 或现有 Parent 数据。主要风险是“Parent”意图误判和规划输入不足；前者以明确创建/准备/拆分语义限定，后者只对会改变协调语义的必要信息询问最少问题。

## 验收摘要

- active Parent 创建成功后自动交接，不提前返回。
- 信息充分时形成完整 Parent Plan 并推进到 current Planning Review/refresh。
- 每步调用 typed next 指定 owner，不跨 authority 写入。
- 只有真实 blocker 中断；到达 `start-child-contribution` 后展示 eligible Contributions 且不自动创建 Child。

## 技术 Artifacts 入口

- `proposal.md`
- `design.md`
- `specs/agent-task-workflows/spec.md`
- `tasks.md`
