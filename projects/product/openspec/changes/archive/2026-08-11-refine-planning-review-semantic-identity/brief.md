# 收敛 Planning Review 的语义身份

## 一句话摘要

Buildr 为正式 Task 的 OpenSpec 计划提供统一、确定性、保守失败的语义身份，避免执行进度和归档路径触发无意义的重复审查。

## 背景与问题

当前 Task Review 只比较调用方提供的 target identity，本身边界正确；但 OpenSpec consumer 没有生成该 identity 的统一能力。Agent 只能手工摘要 proposal、design、spec、tasks 和 Brief，导致 checkbox 完成态等非语义事实改变 target，同时在归档后又要人工判断是否沿用旧值。这既增加工具调用和 token 消耗，也可能错误复用已经不适用的 Planning Review。

## 目标

- 基于 Task Intent/scope 与关联 OpenSpec 规划语义生成唯一 target identity。
- 让 proposal、update、apply 与 converge/archive 使用同一 resolver。
- 保持 checklist 状态、active/archive 路径、mtime、Brief 与 workflow evidence 不影响 identity。
- 不可解析时明确 blocked，不以 raw digest、Git ref、时间或旧结果回退。

## 非目标

- 不改变 Task Review Result、Development Receipt 或 SQLite schema。
- 不提供任意 Markdown 的自然语言等价判断。
- 不新增公共 CLI、cache、history 或第二 writer。
- 不把实现进度、测试结果或交付载体纳入计划语义。

## 受影响用户或角色

- 执行正式 Buildr Task 的 Agent：不再手工拼接 planning target。
- 审查 Task 方案的人：Review 只在目标、范围、spec、关键任务、风险或决策变化时失效。
- Buildr 维护者：获得可测试的 identity authority 与 fail-closed 诊断。

## 核心流程

1. OpenSpec artifacts 达到 apply-ready。
2. Agent 调用 Task Planning Identity internal driver。
3. Application 通过 Task Record、matching Environment 和 Task-scoped Change Resolver读取语义内容。
4. 成功时返回 aggregate target 与稳定 planning nodes；Agent更新Development planning并执行/inspect Planning Review。
5. update或archive后再次调用；target相同则复用Review，不同则重审，blocked则停止。

## 关键变化

- 新增 response-only Task Planning Identity Domain/Application/internal driver。
- 新增 OpenSpec Markdown closed normalization 与 tasks checkbox 无状态化。
- 更新 Task Development、Task Review 与 OpenSpec sidebar consumer 指引。
- 增加 active/archive等价、语义变化、unsupported structure和package投射测试。

## 影响、风险与兼容性

- 首次采用新 resolver 时，旧手工 target 不迁移，需要对当前计划重新审查一次。
- 规范化只处理当前受支持的 OpenSpec 结构；未知结构会保守 blocked。
- 不新增依赖、数据库迁移或公共命令，旧 Result/Receipt 保持可读。

## 验收摘要

- checkbox、归档路径和时间变化不改变 target。
- Task Intent/scope、Requirement/Scenario、关键任务、风险或决策变化必然改变 target。
- 缺失/未知结构不返回 target。
- resolver 零写入，consumer 不再要求 Agent 手工摘要。

## 技术 Artifacts 入口

- `proposal.md`
- `design.md`
- `specs/task-planning-identity/spec.md`
- `specs/agent-task-workflows/spec.md`
- `specs/task-development/spec.md`
- `specs/buildr-package-assets/spec.md`
- `tasks.md`

