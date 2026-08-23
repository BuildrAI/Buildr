# 收敛 Agent 主导的 Task Finish 恢复架构

## 一句话摘要

让未知交付情况仍能由 Agent 处理，Buildr 只提供可信 Finish facts、确定性安全不变量、少量安全原语和真实远端结果对账。

## 背景与问题

Task Finish 已支持自动五阶段交付和 Agent 直接交付后的 reconciliation，但部分恢复路径仍把事故形态、产品安全判断和 Agent 策略绑定在唯一 `nextAction` 中。继续增加局部判断会让 Buildr 成为开放式恢复状态机，并使 `run`、`reconcile`、`inspect` 与 `task next` 对同一事实产生不同解释。

## 目标与非目标

目标是统一 Finish current facts，保留 ownership、identity、side-effect containment、remote containment、fencing 与完成真实性不变量，提供封闭的 carrier cleanup/旧 run retirement 原语，并让 `task next` 暴露 blocker 与能力而不替 Agent 决策。

不穷举所有恢复状态，不自动选择 Git、PR、重新开发、恢复或放弃，不跨 generation 复用旧 Candidate，也不建立通用 workflow engine 或事故 migration API。

## 受影响角色

- Agent：根据可信 facts 和能力选择交付与恢复策略。
- Buildr 维护者：维护确定性安全边界、read model、原语和结果对账，而不是扩展策略状态机。
- 使用 Task Finish 的人：继续获得真实 Delivery、Activation、Cleanup 与 Diagnostics 结果，不需要理解内部事故枚举。

## 核心流程

1. Buildr 从 Task、Development、Environment、Finish 与真实 Git authority 投影 current facts。
2. Product 标注确定性 blocker、required 安全前置和 available capabilities。
3. Agent 选择自动 `run`、Git/PR、重新开发、reconciliation、cleanup、retirement 或放弃。
4. Buildr 在每个安全原语与副作用前重验不变量。
5. 最终 Delivery 只由真实 remote containment 对账，其他维护结果正交呈现。

## 关键变化

- 新增统一 Finish current facts port。
- `task next` 从唯一恢复动作改为 typed blockers、required prerequisite 与 capability projection。
- carrier cleanup 和旧 run retirement 收敛为封闭、幂等、identity-fenced 原语。
- 自动与 Agent 主导路径共享同一事实模型和 Delivery 对账。

## 影响、风险与兼容性

旧消费者可能依赖唯一 `nextAction`；实现保留有界兼容提示，但规范不再把它视为唯一合法路径或授权。SQLite writer 与 Delivery evidence 不迁移；回滚消费者切换不会删除现场或重写既有 Finish facts。

## 验收摘要

- 未知 blocker 可返回可信 facts 与可用能力，不伪造唯一策略。
- 所有 ownership、identity、side-effect、remote containment 与删除不变量保持 fail closed。
- `run`、`reconcile`、`inspect` 与 `task next` 对相同事实使用一致 identity/applicability。
- 代表性正反旅程覆盖直接 Git/PR、旧 run、多 repository partial delivery 和 unsafe cleanup。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta spec](specs/task-finish-execution/spec.md)
- [Implementation tasks](tasks.md)
