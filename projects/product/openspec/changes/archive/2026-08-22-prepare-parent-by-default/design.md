## Context

Buildr 已具备完整的 Parent 启动原子能力：Task Record、Task Environment、Task Development、Parent Plan、Planning Review、planning refresh 和 Parent Coordination read model 都有独立 owner。`buildr task next` 也能在已有事实上返回 `prepare`、`begin`、`planning-review`、`refresh-parent-planning` 与 `start-child-contribution`。当前缺口在 Agent workflow：`task-manager` 创建 active Parent 后没有强制把用户的“创建并准备 Parent”意图交给 `task-development`，而现有 `task-development` 只描述顺序，没有要求连续推进与用户可见的唯一停止点。

这次改动只涉及随包 Skills、规范与静态契约验证。Task Record 本身不新增 Parent 类型字段；Parent 仍由采用 Parent Plan 的 Development 事实表达。用户在当前对话给出的目标、架构决定、Contribution Map、依赖、边界和最终验收是创建 Parent Plan 的输入，不复制进 Task Record。

## Goals / Non-Goals

**Goals:**

- 把“创建/准备/拆分 Parent”解释为创建 active Task Record 后的连续专业交接。
- 当 Parent Plan 输入已充分时，Agent 自动完成 Child 前全部准备，不重复询问已知信息。
- 每个动作仍由原 owner writer 完成，并在每步后重新读取 `task next` 或 Parent Coordination current facts。
- 只有真实 blocker、缺失会改变计划语义的信息或需要用户授权的业务决定才停止。
- 到达 `start-child-contribution` 后明确停止，交还首个 Contribution 选择。

**Non-Goals:**

- 不让 `task create` 直接准备 Environment、写 Development、执行 Review 或创建 Child。
- 不新增 `parent start` 聚合命令、数据库字段、事务或第二套 progress authority。
- 不让 `task-manager` 调用其他 Application writer；交接仍由 Agent 执行。
- 不自动选择或创建第一个 Child，不自动完成 Parent。
- 不改变 Parent Plan、Task Record 或 Task Development capability contract major version。

## Decisions

### 1. 以 Skill 交接表达默认完整准备

`task-manager` 在 active Task 创建成功后，根据当前用户意图判断是否是 Parent 创建/准备目标。如果是，必须把 Task ID、canonical Workspace、scope 和当前对话中已知的 Parent 规划输入交给 `task-development`，并继续工作；Task Record result 仍只报告自身 effects。

选择这一方案而不是修改 `task create` Application result，是因为 Task Record 不拥有“用户是否准备把该 Task 作为 Parent Plan 使用”的专业语义。由 CLI 猜测 intent 文本或新增 Parent 标志会把 Development 选择泄漏进 Task Record authority。

### 2. 由 Task Development 持有 Parent 准备循环

`task-development` 收到明确 Parent 准备交接后，先读取 `buildr task next`。对每个 typed next，只加载并调用当前 owner：

- `prepare` → `task-environment`；
- `begin` → retained controller 的 Task Development `begin`；
- Parent Plan 尚未采用且规划输入充分 → `task parent record`；
- `planning-review` → `task-review`；
- `refresh-parent-planning` → `task parent refresh-planning`；
- `start-child-contribution` → 停止准备并报告 eligible Contributions。

每个动作成功后重新读取 current next，不缓存或推测后续结果。Parent Plan 尚未存在时，`task next` 无法从 Task Record 推断 Parent 意图，因此 `record` 由同一次明确 Parent handoff 与已知规划输入触发；一旦 Plan 保存，后续步骤全部由 current typed next 驱动。

选择 `task-development` 而不是 `task-triage` 持有循环，是因为这是 active Parent 从 Development 建立到 current planning gate 的专业准备过程；`task-triage` 负责首次语义判断、Git 基线和创建前交接，保留入口路由职责。

### 3. 信息充分时直接形成完整 Parent Plan

“信息充分”要求能够明确写出 outcome、architecture decisions、至少一个结构化 Contribution 的 objective/directions/boundaries、依赖关系和 final acceptance。用户已提供这些事实时直接 record；只有缺失内容会实质改变 Contribution 切分、依赖或验收语义时才询问。不得创建占位 Contribution、猜测架构决定，或把 Child 实现清单/状态写入 Parent Plan。

### 4. 将 `start-child-contribution` 作为唯一成功停止点

准备成功只在 current read model 返回 `start-child-contribution` 且至少一个 eligible Contribution 时对用户报告“Parent 已准备好”。此时不继续 `observe`、Verification、Candidate、Finish，也不自动选择 Child。若当前没有 eligible Contribution，则报告 Parent Coordination 返回的真实依赖或 planning blocker，而不是宣称准备完成。

## Risks / Trade-offs

- [Agent 可能仅依据“父任务”字样误触发准备] → 仅在用户目标包含创建、准备、拆分或准备到可开发/可启动 Child 的明确语义时自动交接；纯查看、更新顶层字段或只建 todo 不触发。
- [Parent Plan 输入不完整时循环无法继续] → 只询问会改变 outcome、Contribution、依赖、边界或 final acceptance 的最少问题；其他信息后续由 Child 自己持有。
- [多个 Skill 重复描述同一流程而漂移] → `task-manager` 只定义交接条件，`task-triage` 定义入口与创建前语义，`task-development` 定义唯一准备循环；契约测试分别检查边界和关键动作。
- [静态 Skill 改进不能强制所有第三方 Agent 完全遵循] → 通过随包 runtime 投影、触发 description、规范和 contract tests 提高默认一致性，不新增跨 authority 的产品状态机。
