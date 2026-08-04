# 复用目标分支前进后的 Task Candidate

## 一句话摘要

当目标分支前进但任务贡献可在最新交付基线上无冲突且等价应用时，由 Task Finish 在隔离 carrier 上复用既有 Candidate 与专业 evidence，而不是重复 Development 生命周期。

## 背景与问题

当前 Finish 把 `task-finish.target-race` 统一视为 Candidate 失效并返回 Development，混淆了任务贡献和目标分支提供的交付基线。即使 Task worktree、Candidate 与贡献未变，也会重复正式 Verification、Candidate generation、Completion Review 与 handoff。

## 目标与非目标

目标是以确定性 Git/identity evidence 区分任务贡献（Task Contribution）与交付基线（Delivery Baseline），在产品拥有的隔离交付载体（Delivery Carrier）上应用贡献，等价时复用原 handoff，冲突或无法证明时 fail closed。

非目标是把路径不重叠推断为语义安全、自动解决冲突、rebase 原 Task worktree、force push、增加通用状态机/调度器/CAS/history或新增生命周期 UI。

## 受影响用户或角色

- 并行向同一目标分支交付多个 Task 的 Agent 与维护者。
- 依赖 Task Development、Task Finish 与 Environment cleanup evidence 的产品客户端。

## 核心流程

1. Development handoff保持原Candidate/generation与Planning/Verification/Completion gates。
2. Finish `prepare`读取最新远端target作为Delivery Baseline，并从current Task source snapshot计算Task Contribution。
3. 产品在隔离Git worktree应用贡献；只有无冲突且应用前后canonical delta identity相等才进入`verify`。
4. `deliver`只做fast-forward、普通push与远端回读；target再次前进时以精确token重做carrier prepare下游，不重跑正式验证。
5. Environment以可复算贡献等价proof清理未被改写的原Task worktree；Finish再清理run-owned carrier。

## 关键变化

- target advance不再自动等于任务内容变化。
- 原Task worktree/index/branch与Candidate保持不变。
- `formalVerificationExecutions = 0`，Candidate generation不递增。
- 冲突、贡献漂移、identity不等价或证据不足统一返回Task Development。

## 影响、风险与兼容性

同一文件即使Git patch可clean apply，只要preimage/delta identity变化也会保守返回Development。现有terminal target-race run不迁移；新实现不保留旧重复Candidate authority。机械等价不替代Project verification policy或Agent的语义判断。

## 验收摘要

- 目标前进且贡献等价时远端交付与cleanup成功，Candidate/generation/handoff不变，正式Verification执行数为0。
- 冲突、贡献变化或无法证明时不修改原Task worktree，不交付并返回Development。
- target-race token只重建隔离carrier；不自动冲突解决、force push或生成新生命周期evidence。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Finish delta](specs/task-finish-execution/spec.md)
- [Task Environment delta](specs/task-environments/spec.md)
- [Agent workflow delta](specs/agent-task-workflows/spec.md)
- [Tasks](tasks.md)
