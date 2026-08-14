# 修复 Task Finish prepare 失败恢复

## 一句话摘要

让 Task Finish 正确快照未提交的 OpenSpec 归档重命名，并让没有形成 carrier ownership 或交付副作用的 prepare terminal failure 可由新的 Development handoff 安全取代。

## 背景与问题

Task source snapshot 当前把已不存在的旧 active Change 路径作为精确 Git pathspec，导致归档重命名后的 Finish prepare 失败。该 run 没有 carrier、lease、delivery 或 cleanup facts，却因 prepare 已有 attempt 被统一标记为 uncertain，后续新 handoff 无法恢复任务。

## 目标 / 非目标

目标是修复 source snapshot 的删除语义，并增加一个只覆盖 carrier ownership 形成前 terminal prepare failure 的安全 supersede 边界。

不改变五阶段、SQLite schema、blocked/resume 语义、Delivery Adaptation、formal Verification、Completion Review 或发布流程；任何已有 owner/recovery fact 的 run 继续 fail closed。

## 受影响用户或角色

- 使用 Formal Task Finish 交付包含 OpenSpec archive move 或其他未提交删除的 Agent。
- 需要从无副作用 prepare 产品失败中恢复任务的 Buildr 维护者。

## 核心流程

1. 临时 index 从原任务基线开始，分别写入当前存在路径和当前删除路径。
2. prepare 在 carrier 形成前 terminal failed 时，current row 保留精确 phase/failure 与空 owner facts。
3. Development 形成新 handoff 后，入口要求新的 commit message；只有窄安全 predicate 通过才 supersede 旧 run并创建新 run。
4. 任何 blocked、resume、carrier、lease、delivery、retained、prepared completion、cleanup 或后续 phase fact 都继续阻止换绑。

## 关键变化

- 未提交 active-to-archive move 可形成完整 Task Contribution。
- replaceable run 从 preflight-only 扩展到可证明在 carrier ownership 前 terminal failed 的 prepare。
- legacy `carrier-preparation + task-finish.carrier-prepare-failed` 可按同一窄边界恢复。

## 影响 / 风险 / 兼容性

无需数据迁移，对既有 safe run 只在下一次新 handoff invocation 时生效。主要风险是错误放宽 prepare failure，因此实现必须同时检查 closed phase shape、failure tuple、resume 和全部 owner facts；未知状态保持 conflict。

## 验收摘要

- 未提交归档重命名 snapshot 成功，原 index/工作树不变。
- 符合窄条件的 prepare failed run 可要求新 message 并创建新 run。
- blocked prepare、已有 carrier/lease/delivery/cleanup 或后续 phase attempt 的 run 仍返回 identity conflict。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specification](specs/task-finish-execution/spec.md)
- [Tasks](tasks.md)
