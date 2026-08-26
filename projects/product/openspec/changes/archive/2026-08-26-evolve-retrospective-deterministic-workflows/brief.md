# 增强复盘的确定性流程发现与共同确认

一句话摘要：让Task Retrospective从可见执行事实和既有复盘中主动寻找可固化的机械流程，并在不违背Buildr产品哲学的前提下交给人共同确认。

## 背景与问题

现有复盘能发现耗时、Token和重复尝试，却没有明确要求判断这些问题是否已经具备closed输入、Owner、停止条件和结果证据，导致Agent在后续同类任务中继续重复推理和试错。

## 目标与非目标

- 目标：有界执行事实调查、确定性流程候选探索、Core哲学过滤、跨复盘聚类、人类共同确认和正确资产落点建议。
- 非目标：不新增候选/审批/事件/history存储，不自动创建Task或修改Rule/Skill/workflow，不建立生命周期gate或通用许可层。

## 受影响角色与流程

- Agent：复盘时主动判断机械步骤能否确定化；处理复盘时向人展示完整候选与effects。
- 人/团队：确认目标、判断与授权是否应保留，以及是否创建承接Task。
- 用户Workspace：升级新版Buildr并正常sync后获得新Skill guidance；既有Result与处置状态不迁移。

## 关键变化

- 候选必须说明证据、closed输入、Owner、停止条件、结果、恢复、保留判断、收益与建议落点。
- 违反“Buildr只约束错误、不垄断执行”的候选必须丢弃。
- 多份复盘先bounded list收窄，再逐项inspect并语义聚类；不由Application自动分析Markdown。
- 一人或多人确认复用既有精确mutation授权，不建立审批对象。

## 风险、兼容性与验收

- 保持`buildr.task-retrospective/v2`与current Markdown Result不变。
- 没有可信候选时允许明确说明，不为填模板虚构候选。
- 验收要求Skill、contract和tests共同证明哲学护栏、共同确认与零自动mutation。

## 技术Artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Retrospectives Delta](specs/task-retrospectives/spec.md)
- [Tasks](tasks.md)
