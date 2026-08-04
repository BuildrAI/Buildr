# Task Development 全研发周期事实 authority

## 一句话摘要

让 Task Development 从首个正式研发动作开始维护可选研发节点的聚合事实，直到形成不可变 Finish handoff。

## 背景与问题

当前 Development Receipt 只有在 Planning Review ready 后、稳定 Content Target 被观察时才出现。Proposal、design、Planning Review 以及用户明确跳过节点等事实在实现前没有统一的研发 read model，跨会话恢复和 Local App 展示都存在空档。

## 目标

- Development 覆盖首个正式研发动作到 Finish handoff。
- 节点可以不存在、not-applicable 或由明确授权 waived。
- 节点存在时只记录专业 authority 的portable reference、identity、disposition与最小摘要。
- Candidate、risk decision和handoff仍由Development独占。
- OpenSpec、Review、Verification与Finish继续拥有各自内容和执行事实。

## 非目标

- 不建设通用planner、DAG、事件历史或任务状态机。
- 不把proposal、design、Result正文、diff、命令输出或聊天复制进Receipt。
- 不让Local App写Development事实。
- 不扩大Task Finish职责。

## 核心流程

正式Task在ready Environment中开始proposal、design或直接实现时，Development先建立最小Receipt和planning snapshot。专业动作形成或改变artifact时更新节点引用；明确跳过时记录waiver授权。内容稳定后再观察Content Target、形成verification policy和formal Verification事实，冻结Candidate、完成Completion Review与风险决定，最终生成Finish handoff。

## 关键变化

- Development Receipt升级为v2并兼容读取v1。
- 增加begin/planning internal actions和最小planning nodes。
- Planning、Verification、Completion gate可保存current专业Result、not-applicable或明确waived disposition。
- Local App增加“规划中”与节点/waiver只读展示。
- capability contract与受影响consumer同步升级到`buildr.task-development@2`。

## 影响、风险与兼容性

主要风险是把planning nodes滥用为通用步骤，或通过waiver弱化门禁。产品用closed snapshot、有限disposition、专业authority引用和明确授权source限制该风险。v1 Receipt只读迁移，不在inspect时写盘；下一次合法Development mutation才保存v2。

## 验收摘要

- Proposal起步和code-only直接实现都能形成Development read model。
- Content Target形成前不会虚构Candidate、policy或Result。
- 节点更新会正确失效Candidate并在下一次freeze递增generation。
- waiver不伪造Review/Verification Result且必须可追溯授权。
- Finish只消费current不可变handoff。
- Local App保持只读、no-store和fail closed。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta spec](specs/task-development/spec.md)
- [Tasks](tasks.md)
