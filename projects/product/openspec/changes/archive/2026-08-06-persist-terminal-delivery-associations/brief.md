# 持久化终态交付关联事实

## 一句话摘要

让 Task Finish 保存本次实际采用的 handoff、Review 和 Verification 关联，使 Local App 后续读取已确认事实，不再动态重算。

## 背景与问题

当前 `inspectTaskTerminalDelivery` 在读取时调用 Task Record、Development、Review 和 Verification，并根据当前 Result 与 handoff 重新判断交付关联。三个 Local App 专业页签共用该聚合投影，导致普通 GET 重复读取多个专业节点，也无法稳定表达 Finish 当时采用的证据。

## 目标与非目标

目标是在 Finish durable completion 后把 handoff、Candidate 和三个 gate 的最小 identity/digest 关联写入 lifecycle current read model，终态投影只消费该快照。

非目标是复制专业 Result 正文、改变 Candidate/gate authority、在 GET 中回填旧数据，或在本 Change 内完成三个 Tab 的直接读取改造。

## 关键变化

- lifecycle current read model 增加 terminal association snapshot。
- Finish completion 成为该关联的唯一 writer，投影失败显式阻止成功报告。
- terminal delivery reader 对已交付任务读取保存快照，不再匹配当前 Review/Verification Result。
- 历史缺失快照保持 `completed-unproven` 或 unavailable，不扫描 Finish、Git 或 Environment 回填。

## 影响与兼容性

只扩展 Workspace-local SQLite JSON read model，不增加第二张表或公开 writer。旧 Task 保持可读但不会伪造交付关联；下一次合法 Finish 才形成新快照。

## 验收摘要

通过 Unit/Integration 测试证明 Finish 写入精确关联、终态读取不调用专业 recomposition、缺失快照不回填；运行 OpenSpec strict validation 和 Product changed-plan 反馈。

## 技术入口

- [proposal](proposal.md)
- [design](design.md)
- [delta specs](specs/)
- [tasks](tasks.md)
