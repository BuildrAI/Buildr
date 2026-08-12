# 仅工作区正式任务研发交接

## 摘要

让没有Project、Service或Project-bound Change的正式Task，以明确workspace coverage gap和现有风险授权完成Verification、Candidate、Completion Review、Development handoff与Task Finish。

## 背景与问题

Task Record、Task Environment和Content Target已经接受workspace-only范围，但Development policy与Verification Result无条件要求非空Project declarations，workspace gap也没有合法scope。结果是上游事实ready、delivery无缺口时仍无法形成Development handoff。

## 目标与非目标

目标是补齐workspace-only的类型化负向验证事实、current/stale比较、风险门禁和完整交付，并保持Project/Service声明覆盖不变。非目标是新增workspace测试声明、自动passed、自动waiver、第二store或历史backfill。

## 受影响用户或角色

主要影响通过Buildr管理正式Task的Agent与维护者；Task Finish和Local App继续只消费既有专业read model。

## 核心流程

Task有效Project集合为空时，Development policy记录空Project declarations与唯一workspace gap；Task Verification记录matching `not-passed` Result。Result完整后可freeze Candidate，但proceed/handoff仍需精确风险接受或明确gate disposition，随后Task Finish按原五阶段交付。

## 关键变化

- 有效Project集合纳入显式Project、Service所属Project与Change所属Project。
- workspace-only policy/Result使用自描述closed shape，不新增schema字段或authority。
- repository新写入绑定current Task scope，读取保留scope变化后的stale判定能力。
- Project、Service、多Project和Project-bound Change继续要求全部declarations。

## 影响、风险与兼容性

现有Project Receipt/Result保持兼容；没有合法workspace事实的历史Task不回填。新版写入的workspace row需要支持本Change的runtime读取，降级旧runtime会fail closed。Finish、Review、Environment和Task Record authority不变。

## 验收摘要

workspace-only Task能够形成current policy；Content Target或有效Project/declaration变化后正确stale；缺口不自动passed且未形成current Result时不能freeze；合法风险处置后能完成Candidate、Completion、decision、handoff和Task Finish；Project/Service既有门禁与旧数据读取不变。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Development delta](specs/task-development/spec.md)
- [Task Verification delta](specs/task-verification/spec.md)
- [Task Finish delta](specs/task-finish-execution/spec.md)
- [Implementation tasks](tasks.md)
