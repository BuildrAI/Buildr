# 原子替换失败 Finish current row

一句话摘要：reconciliation recovery 在写入新terminal时，以旧 failed current run ID与精确digest做事务fence，避免合法恢复被拒绝或并发状态被覆盖。

## 背景与问题

旧 failed run 必须保留到远端包含和carrier cleanup完成，但现有SQLite finalize只允许同run ID原地终结。新reconciliation run因此无法写terminal；若只放宽run ID检查，又会覆盖读取后发生的current状态变化。

## 目标与边界

目标是在同一transaction内证明旧current仍是先前读取的精确failed run，再原子写入新terminal。普通finalize、远端证明、topology、carrier ownership和cleanup顺序保持不变。

## 验收摘要

matching旧run ID与digest时原子替换成功；row缺失、kind/status/ID/digest漂移或普通不同run finalize均零写入并返回conflict。reconciliation fence只能来自Product Persistence read result。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specification](specs/task-finish-execution/spec.md)
- [Implementation tasks](tasks.md)
