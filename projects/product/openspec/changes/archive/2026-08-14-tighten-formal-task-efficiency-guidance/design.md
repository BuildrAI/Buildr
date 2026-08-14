## Context

前两个效率优化已经让 Task Development 支持按阶段加载、compact read model、verification plan preview 和 terminal invocation 复用，但复盘显示 Agent 仍会在动作边界处套用旧习惯。现有产品数据模型和 authority 已足够；本 Change 只在能跨 Agent 复用的 CLI 诊断、Skill guidance、Planning Review evidence 与测试选择规则上补强，不新增任务状态或自动决策器。

## Goals / Non-Goals

**Goals:**

- 让 Agent 在写 `tasks.md`、调用 converge、修改共享 helper 和决定 exact invocation 重执行时，就近执行最小检查。
- 让 CLI 和 Review evidence 清楚区分 canonical Workspace、Task execution root、语义审查与机械关键词检查。
- 让低成本 focused regression 更早发现兼容回归，同时保留 Formal Verification 的 repository authority。
- 保持效率指标只用于复盘，不驱动 gate 或自动范围收缩。

**Non-Goals:**

- 不增加 checklist AST/关键词规则、自动 worktree 搜索、Agent 计时状态机或统一耗时 SLA。
- 不改变 `--retry`、invocation identity、Execution Record、Verification Result 或 Task Development Candidate 语义。
- 不新增 capability version、binding、数据库字段或 migration。
- 不以 focused canary 替代 affected Formal Verification。

## Decisions

### 1. 用动作就近 guidance 纠正 Agent，不增加新的流程 authority

在 OpenSpec propose/apply source Skills 中增加一条即时问题：每个 checkbox 是否能在 Change archive 前完成。Planning Review 对真实 checklist 做语义审查并把实际覆盖对象写入现有 `reviewed/uncovered/findings`；Application schema 不变。

不采用关键词硬门禁。实现 Candidate、Verification 或 Finish 产品能力的 Change 可以合法出现这些词，机械匹配会产生误报，也会把 Agent 判断错误转化为 Buildr 的错误确定性。

### 2. converge 明确消费 Environment execution root

CLI help 将 `--target` 表达为 `<task-execution-root>`。active Change 在 target 中不可见时，诊断要求从 Environment Receipt 使用 `execution.workdir`；命令保持零写入，不从 canonical Workspace、其他 worktree 或目录扫描自动猜测。

这种设计同时保留两个边界：Task/Review/Verification/Development authority writer 继续使用 canonical Workspace，Change 内容与 converge 使用 Environment execution root。

### 3. 共享 helper 使用“调用面 + 一个既有 canary”的 focused regression

Project Testing guidance 要求先枚举共享 helper 的调用 action，再从已有 tests 和 changed-plan reasons 中选取能够覆盖旧公共行为、且成本最低的一个兼容 canary。只有影响无法由该 canary界定时才扩大 focused 范围；最终 affected Formal Verification 不变。

不在 verification planner 中自动生成新的必跑 gate。planner reasons 是选择依据，不是 Result evidence，也不能可靠替代 Agent 对公共诊断顺序和兼容契约的判断。

### 4. `--retry` 只在 exact identity 决策点说明

Task Verification guidance 保留显式 retry 的产品语义，但只在 Agent 准备重执行 exact invocation 或解释复用结果时说明一次。Content Target、declaration 或 capability set 已变化时，按新 identity 正常执行，不重复播报“未传 `--retry`”。

### 5. 时间参考由复盘上下文校准，不固化为产品阈值

12–18 分钟是当前团队对这类窄 Buildr 自举任务的复盘标尺。Skill 只要求把团队/用户给出的参考值作为评估背景，并保持非门禁；不把该数字写入 Result、Application 或通用默认值。

## Risks / Trade-offs

- [Skill guidance 仍依赖 Agent 正确执行] → 用精确 contract tests、Planning Review evidence 和 CLI 诊断覆盖高频失误点，不扩展为通用推理器。
- [active Change not found 时无法给出唯一 worktree 路径] → 只提示读取 matching Environment Receipt，不扫描或自动选择多个 Task 环境。
- [单个 canary 可能不足以覆盖未知影响] → 要求先检查调用面；无法证明最低充分范围时扩大 focused tests，正式 affected Verification始终保留。
- [时间参考随任务类型变化] → 只在 Retrospective 中由人和 Agent结合实际复杂度解释，不设全局阈值。

## Migration Plan

无数据 migration。实现通过现有 package source、runtime projection 和 contract tests 交付；若诊断或 guidance 造成不兼容，可回退对应文本/CLI诊断而不转换任何持久状态。

## Open Questions

无。
