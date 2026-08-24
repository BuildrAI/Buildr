# 修复失败 Finish run 的仓库拓扑判定

一句话摘要：显式 Finish reconciliation 在恢复旧 prepare-failed run 时，应证明 repository topology 相同，而不是要求包含 Task Contribution 的 `repositorySetIdentity` 不变。

## 背景与问题

`repositorySetIdentity` 对完整 repository plan 求哈希，其中包含 Task Contribution。current Handoff generation 更新会改变 contribution，因此首次真实恢复演练被错误判为 repository set 冲突，尽管 selector、roots、branch、remote 与 disposition 均未改变。

## 目标与非目标

目标是以精确 topology projection 判断仓库边界相同，并允许 contribution-bearing identity 随 Handoff 更新。非目标是放宽远端包含、旧 run phase、副作用、carrier ownership 或普通 run 的 supersede 禁令。

## 核心流程

reconciliation 先比较旧 run 与 current Handoff 的 repository topology；相同时继续用 current Task Contribution 做真实远端包含证明，全部成立后才清理旧 carrier并形成terminal Delivery。任一 topology 字段或后续安全证明不成立时保持旧 run。

## 影响与验收

影响 Task Finish reconciliation 与对应Integration tests。验收要求真实 `repositorySetIdentity` 因 contribution 更新而变化时可恢复；selector、root、branch、remote 或 disposition 漂移时仍返回identity conflict。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specification](specs/task-finish-execution/spec.md)
- [Implementation tasks](tasks.md)
