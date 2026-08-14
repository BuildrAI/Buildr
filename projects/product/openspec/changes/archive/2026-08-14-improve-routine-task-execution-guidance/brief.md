# 提高日常正式任务执行效率

## 一句话摘要

通过阶段化读取、一次有界 authority source map 和验证计划预览减少日常正式任务的无效往返，同时让 Buildr 保持引导者角色，Agent 保留专业判断，效率指标只用于复盘优化。

## 背景与问题

Buildr 已建立完整正式任务生命周期，但当前 guidance 容易让 Agent 在 proposal 前预读尚未到达阶段的 Skills、重复检索同一 authority，或在不了解 affected 计划时凭习惯追加 broad verification。这些动作不改变正式结论，却增加启动和交接耗时。

## 目标与非目标

- 目标：按 next executable action 渐进装配上下文；首次修改前建立一次相关 source map；优先消费 Project 已有 plan-only/dry-run；在复盘中跟踪效率信号。
- 非目标：不新增 workflow driver、计时器、Result/Receipt 字段或硬性 SLA；不让 Buildr 替代 Agent 判断；不削弱 required Skill、Review、Verification 或 Finish。

## 受影响用户或角色

主要影响执行 Buildr 日常正式任务的 Agent 和维护者；Project 仍拥有测试入口与验证声明，Task Development、Task Verification 及 repository authority 不变。

## 核心流程

Agent 在 triage 阶段只解析当前决策和立即动作所需能力；Task、Environment 与 Development begin 完整后及时进入 proposal。首次修改前建立一次有界 source map，后续按 scope/authority 变化增量刷新。到正式验证节点时，若 Project 已提供计划预览，先读取 affected plan 判断补充反馈，再实际执行或复用 policy 要求的正式 capabilities。

## 关键变化

- `task-triage`、`task-development` 和 `task-verification` 增加阶段化工作引导。
- source map 保持为 Agent 会话内工作方法，不写入新的产品 store。
- plan preview 与正式 Verification evidence 明确分离。
- proposal 启动、重复读取/命令和验证耗时只作为 Task Retrospective 的参考指标。

## 影响、风险与兼容性

本次只修改 packaged Skill guidance、契约测试和当前知识，不改变 capability contract identity、Application、CLI 或 repository，无 migration。主要风险是 Agent 把“按需读取”误解为跳过 required action，或把 preview 误报为验证 evidence；规范和测试会明确禁止两种行为。

## 验收摘要

需要证明三个 Skill 同时表达阶段化读取、单次 source map、计划预览与指标非门禁边界；contract tests 和 OpenSpec strict validation 通过；Buildr Product 当前知识准确记录其既有 changed-test plan 入口，但通用 Skill 不硬编码 Product 命令。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta spec](specs/agent-task-workflows/spec.md)
- [Implementation tasks](tasks.md)
