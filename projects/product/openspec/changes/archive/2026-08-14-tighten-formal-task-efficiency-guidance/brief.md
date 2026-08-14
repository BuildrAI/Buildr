# 收紧 Formal Task 执行效率引导

## 一句话摘要

把高频流程边界检查放到 Agent 的当前动作旁，并用精确 CLI 诊断、Planning Review evidence 和最低成本兼容 canary 减少无效往返。

## 背景与问题

已有 Task Development 优化明确了阶段化上下文、verification plan preview 和非门禁效率指标，但真实执行仍出现 Change checklist 越界、converge 指向 canonical Workspace、共享 helper 回归到正式验证才暴露，以及重复解释 `--retry`。这些问题没有新的 authority 缺口，主要是现有规则没有在决策点被 Agent 及时消费。

## 目标与非目标

目标是让 Agent 在写 checklist、选择 execution root、修改共享 helper 和处理 exact invocation 时获得最小且可验证的就近引导，并让 Buildr 提供不会替代 Agent 判断的确定性诊断。

非目标是新增关键词门禁、自动 worktree 选择、通用计时 SLA、Verification retry 状态变化或新的 Task lifecycle store。

## 受影响用户或角色

- 使用 Buildr Skills 执行日常 Formal Task 的 Agent。
- 通过 Planning Review、Retrospective 和 Buildr Web 观察任务质量与效率的人类参与者。

## 核心流程

Agent 按 next executable action 加载直接依赖；写 `tasks.md` 时立即确认每项能否在 archive 前完成；OpenSpec 操作从 Environment Receipt 使用 execution root；共享 helper 改动先检查调用面并运行最低成本既有 canary；稳定 Content Target 后仍执行正式 affected Verification。

## 关键变化

- Planning Review 语义检查 checklist 生命周期边界，但不做关键词匹配。
- converge help 与 not-found 诊断明确 Task execution root，不自动搜索其他 worktree。
- Project Testing guidance 要求共享 helper 的调用面检查和最低充分兼容 canary。
- `--retry` 只在 exact identity 重执行点说明；时间参考只进入复盘解释。

## 影响、风险与兼容性

实现影响 source Skills、CLI registry/diagnostic、contract 与 integration tests。现有 capability versions、bindings、SQLite schema、Execution Record 和 Verification Result 均保持兼容；主要风险是 prose guidance 仍依赖 Agent 执行，通过 contract tests 与 Review evidence 降低漂移。

## 验收摘要

- Change checklist 越界可在 Planning Review 前后被语义发现，合法同名产品实现不误报。
- converge help 清楚表达 execution root，canonical target 误用返回零写入 next action。
- 共享 helper 改动 guidance 能引导选择现有最低成本兼容 canary，且不替代正式 Verification。
- retry 与时间参考不形成重复沟通或自动门禁。

## 技术 artifacts

- [proposal.md](proposal.md)
- [design.md](design.md)
- [delta specs](specs)
- [tasks.md](tasks.md)
