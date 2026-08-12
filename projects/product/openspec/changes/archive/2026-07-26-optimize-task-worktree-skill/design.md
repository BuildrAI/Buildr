## Context

当前 `task-worktree` 已正确实现 `buildr.task-worktree-lifecycle/v2`，但 4,780 个非空白正文字符中，创建流程、候选交接和 Guardrails 重复了 contract 的稳定保证。此次只改变随包 provider 的表达方式，不改变 CLI、contract、manifest 拓扑或 consumer 行为。

## Goals / Non-Goals

**Goals:**

- 把 description 收敛为单句 routing index。
- 用职责、决策、生命周期、协作交接、授权与停止条件组织正文。
- 消除重复规则并明确复用、artifact 收敛、单 Agent ownership 和 canonical 路径语义。
- 通过现有静态与组合测试证明 capability identity、version、provider 和 binding 不变。

**Non-Goals:**

- 不修改 `buildr.task-worktree-lifecycle/v2` contract。
- 不改变 `buildr worktree create/context` 行为。
- 不把 Git integration、Candidate policy 或完整 Task Finish 编排移入本 Skill。
- 不清理 workspace 中保留的 v1 compatibility contract/binding。

## Decisions

1. **contract 保留稳定协作事实，Skill 只保留操作决策。** 相比继续逐字段复述 contract，这能减少双重 authority；正文仍保留直接触发时必须知道的五项不变量。
2. **用决策表代替分散的默认/例外语句。** 表格明确 create、reuse、none、blocked，并声明 Project 规则和用户授权的优先级。
3. **用一个生命周期序列代替创建、使用和 Guardrails 的重复段落。** 每一步只声明输入、动作和停止条件。
4. **保留发布 worktree 特例，但并入 retention/cleanup 决策。** 该行为已是 canonical requirement，不能因瘦身删除。
5. **description 不暴露 doctor/sync 实现细节。** doctor/sync 属于创建入口和 Core transition invariant，不是首次 routing 条件。

## Risks / Trade-offs

- **[压缩后遗漏安全条件]** → 用 v2 contract、canonical specs 和静态测试逐项建立保留清单。
- **[文字调整改变既有语义]** → 保持 capability major version、manifest 和 CLI 不变，并对关键 MUST/停止条件做前后对照。
- **[runtime 与产品包源不同步]** → 实现和验证先发生在 task checkout；集成后再由主 workspace 执行 Buildr sync。
