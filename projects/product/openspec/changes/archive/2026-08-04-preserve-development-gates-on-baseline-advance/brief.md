# 保留纯基线前进后的 Development gates

## 一句话摘要

当 Git rebase 只引入交付基线（Delivery Baseline）前进且任务贡献（Task Contribution）保持等价时，Task Development 保留原 Candidate 与 gates，由 Task Finish 继续在最新基线上形成隔离交付载体。

## 背景与问题

Task Finish 已能区分任务贡献和交付基线，但 Task Development 的 Content Target 仍绑定 checkout 全量内容。无关基线提交经 rebase 进入 Task worktree 后会错误触发 `content-target-changed`，重复正式 Verification、Candidate generation、Completion Review 与 handoff。

## 目标与非目标

目标是让 Git-backed Content Target 使用与 Finish 相同的 canonical Task Contribution identity；贡献未变时保持 gates current，贡献改变或无法证明时继续 fail closed。

非目标是根据路径不重叠推断语义安全、自动 rebase/解决冲突、增加状态机/history/CAS、改变非 Git Environment，或建立第二套 Candidate authority。

## 受影响用户或角色

- 在共享目标分支并行交付 Task 的 Agent 与维护者。
- 依赖 Task Development gate applicability 和 Task Finish handoff 的产品客户端。

## 核心流程

1. Agent 审视最新 Delivery Baseline 的语义影响并完成 rebase。
2. Development 从可信 Task Environment Git evidence 观察 source snapshot 与 retained baseline。
3. canonical raw Git delta identity 未变时，Content Target、Candidate、Verification、Completion Review、decision 与 handoff保持 current。
4. 只读 gate inspect确认 current 后，Finish在最新基线重建隔离 Delivery Carrier并交付。
5. 贡献变化、冲突或无法证明时返回 Development正常重建生命周期证据。

## 关键变化

- Development 与 Finish 共用一个 Task Contribution identity 实现。
- Delivery Baseline bytes 不再自动进入 Git-backed Content Target identity。
- Candidate generation 只在真实贡献、Task context 或 policy变化时增加。
- 真实端到端测试不再用固定 handoff stub 代替 Development applicability。

## 影响、风险与兼容性

机械 identity 等价不代表语义安全；Agent 与 Project 仍负责审视基线变化，既有 verification policy 继续承担业务验证边界。非 Git 或 repository identity不可证明时维持保守 stale 行为。

## 验收摘要

- 无关基线 rebase 后 gates/handoff current、generation不增加，Finish正式 Verification执行数为0。
- 同路径基线变化、贡献漂移、冲突或不可证明时 fail closed。
- 远端交付和 Task Environment/Carrier cleanup成功。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Agent workflow delta](specs/agent-task-workflows/spec.md)
- [Tasks](tasks.md)
