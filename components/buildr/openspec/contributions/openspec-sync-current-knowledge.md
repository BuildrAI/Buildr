## Buildr Current Knowledge Sidebar

Canonical spec sync 前读取 required `buildr.current-knowledge-maintenance/v1` binding、contract 和 selected provider，核对最近 `reconcile` evidence 的 change、Project、impacts、source identities 与当前 delivery tree identity。Evidence 缺失、陈旧、tree 不匹配或包含 unresolved items 时停止 sync，并报告需要重新 reconcile 的目标。

Sync 只更新 canonical specs；不得借 sync 或后续 archive 补写 glossary/current knowledge，也不得修改外部 `openspec-sync-specs` Skill 源。
