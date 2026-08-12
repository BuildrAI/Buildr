# 补强 Project Testing 测试质量指导

## 一句话摘要

在现有测试分层与编排模型上补齐案例推导和有效性自证，使 Agent 不仅选对测试层级，也能写出能够捕获目标错误的最低充分测试。

## 背景与问题

`project-testing` 已能按真实项目事实区分测试意图、执行边界、成本、范围、验证目标和证据 owner，但当前正文没有明确要求从待证明事实推导正常、失败、边界和状态案例，也没有要求新增测试证明自身能够在错误行为存在时失败。这会留下“层级正确但断言空洞或覆盖不足”的风险。

## 目标与非目标

目标是增加最小测试质量闭环、Bug 回归可证伪要求、公共行为断言、替身边界，以及有状态测试的隔离、幂等、清理和重复运行指导。

非目标是不规定固定 case taxonomy、覆盖率阈值、mutation testing 工具或 TDD 流程；不建设 LLM evaluator、测试平台或新状态；不改变 Task Verification、`verification.yml`、Candidate 或 Release 生命周期。

## 受影响用户或角色

- 使用 `project-testing` 设计或开发 Project / Service 测试的 Agent。
- 审查任务测试是否最低充分、可信且可维护的项目维护者。
- 继续独占正式 capability execution 与 Verification Result 的 Task Verification。

## 核心流程

Agent 读取真实项目和当前变更后，先把每项关键待证明事实映射为公共可观察结果，按风险选择正常、失败、边界与必要状态转换案例，再选择最低充分执行边界并实现测试。新增测试需能在目标错误存在时失败；Bug 回归测试在安全可行时提供修复前或受控错误对照。涉及替身和状态时，保持被测逻辑真实，并检查隔离、必要幂等、失败后清理和重复运行。

稳定测试入口仍由 `task-verification` 声明、选择、执行和记录正式 Result。

## 关键变化

- `project-testing` Skill 增加最小测试质量闭环与有效性检查。
- reference 增加测试质量审查卡、Bug 回归和有状态测试示例。
- package 静态校验与契约测试固定新增指导。
- `project-testing` 继续无状态且没有 capability contract。

## 影响、风险与兼容性

这是兼容性的自然语言指导补强，不修改 CLI、schema、数据或 binding。主要风险是 Agent 把案例类型机械理解为全量清单；正文将明确按风险选择最小关键集合，并允许说明不适用或证据 gap。

## 验收摘要

- Skill 能从待证明事实推导公共可观察结果和最小关键案例。
- Bug 回归测试明确可证伪要求及无法安全对照时的诚实 gap。
- 替身不复制被测逻辑，有副作用测试检查隔离、幂等、清理和重复运行。
- package 静态校验、专项契约测试、OpenSpec strict 与 affected 产品验证通过。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specs](specs/)
- [Implementation tasks](tasks.md)
