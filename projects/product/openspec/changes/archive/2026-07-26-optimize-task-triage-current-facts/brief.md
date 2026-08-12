# 优化任务分流与当前事实维护

## 一句话摘要

把 `task-triage` 收敛为有证据的三轴任务决策，并让当前事实维护、task worktree 和任务看板通过最小能力契约稳定协作。

## 背景与问题

现有 `task-triage` 同时承担语义路径、执行环境、看板、OpenSpec 状态和验证规划，正文重复且 repository set、阻塞证据与 provider readiness 表达不完整。独立维护已成立当前事实没有正式 operation，复杂 code-only 任务又会因看板强制 change 关联而产生错误路由。

## 目标与非目标

- 目标：建立语义治理、执行形态、任务跟踪三个正交决策轴；支持独立 current knowledge `maintain`；允许无 change 的复杂任务看板；补齐必要 capability contracts 和组合验证。
- 非目标：不建立确定性任务路由引擎，不接管 Agent 推理，不改变 OpenSpec CLI、Git integration、Task Finish 或 Candidate assurance。

## 受影响用户或角色

- 使用 Buildr workspace 的 Agent：获得更短、更明确且可诊断的任务分流与 provider 交接。
- 维护者：通过 contracts、bindings 和测试判断协作兼容性，不依赖固定 Skill id 或长文本片段。
- 普通用户：复杂 code-only 任务可以直接使用任务看板，不需要理解或创建虚假 OpenSpec change。

## 核心流程

1. Agent 核对 task 相关 specs、current knowledge、实现、registries 和授权。
2. 分别判断语义路径、执行形态和任务跟踪。
3. 需要专业动作时解析对应 optional capability；provider 不 ready 只阻塞相关分支。
4. 独立既有事实维护使用 current knowledge `maintain`；新语义重新进入 `change-flow`。
5. task-board 以 Project task identity 为主，并按实际情况关联零个或多个真实 changes。

## 关键变化

- `task-triage` 输出 repository set、evidence、unresolved 和 next provider/action。
- 新增 `buildr.current-knowledge-maintenance/v2` 与 `buildr.task-board-maintenance/v1`。
- `task-board` 允许空 changes 和空 batch `changeIds`。
- package/static/contract tests 从冗长固定短语转向行为场景和能力图。

## 影响、风险与兼容性

- 既有 OpenSpec consumers 继续使用 current knowledge v1；默认 provider 同时提供 v1/v2。
- 既有任务看板不迁移；新模板和 Skill 只放宽 change 关联基数。
- optional dependencies 不得静默跳过：相关分支必须输出 blocked/degraded evidence。

## 验收摘要

- OpenSpec strict 和 proposal contract gates 通过。
- package、manifest、contracts、Skills、Component integrity 和 runtime projection 一致。
- 契约测试覆盖三轴决策、repository set、独立 maintain、无 change 看板和 provider readiness。
- 受影响验证通过，最终 doctor 显示相关 consumers/providers ready。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specs](specs/)
- [Tasks](tasks.md)
