# 确定化正式验证准备与证据复用

一句话摘要：让正式Task在稳定Content Target后先用closed Formal Verification Plan确定验证选择和准备要求，再记录policy、冻结Candidate并复用同一Plan执行，减少代次震荡和重复验证。

## 背景与问题

现有流程先按declaration全选默认能力并freeze，真实Plan稍后才暴露selected能力与Preparation closure。Plan与早期policy不一致时，Agent需要重复policy、freeze与Verification动作。

## 目标与非目标

- 目标：Plan-first推荐、current Plan到policy的只读确定性投影、not-selected摘要、一次Preparation交接和exact Plan复用。
- 非目标：不自动prepare/freeze/run，不新增store，不修改Result/Candidate identity，不让普通工作必须经过Buildr。

## 受影响角色与流程

- Agent：按`Plan → prepare → derive policy → freeze → run/reconcile`推进；额外风险能力、override与授权仍由Agent判断。
- 用户Workspace：升级并sync后获得相同内置工作流；旧无Plan调用和既有Receipt无需迁移。

## 关键变化

- Task Verification校验current Plans并投影policy输入、coverage gaps和not-selected摘要。
- Task Development discover消费该投影，`task next`在policy前推荐plan-and-derive-policy。
- 内部driver读取临时Plan文件，避免手抄大JSON；文件和正文不持久化。
- existing invocation identity继续负责正式证据去重，不增加缓存或事件平台。

## 风险、兼容性与验收

- 多Project、陈旧Plan、target/declaration/capability不匹配均零写入失败。
- 旧`discover policy`无Plan行为保持兼容，推荐顺序不升级为通用门禁。
- 验收覆盖Plan投影、not-selected、gap、driver文件输入、task next顺序、Skill哲学边界与无Plan降级。

## 技术Artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Development Delta](specs/task-development/spec.md)
- [Task Verification Delta](specs/task-verification/spec.md)
- [Tasks](tasks.md)

