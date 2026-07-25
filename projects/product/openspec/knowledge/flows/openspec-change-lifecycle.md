# OpenSpec Change 生命周期

## 当前流程

1. `task-triage` 判断是否需要 Change 以及 implementation/metadata-only 形态；实现型工作先建立 canonical task worktree。
2. `openspec-propose` 使用 OpenSpec 1.6.0 创建 proposal、design、delta specs 和 tasks；Buildr contribution 创建 Brief、执行 current knowledge `assess`，并建立 contract baseline/proposal check。
3. `openspec-update-change` 修订 planning artifacts 时同步刷新 Brief 与 impacts。
4. `openspec-apply-change` 实现 tasks；发现的新知识影响写回 tasks/sidecar，implementation content 完成后在最终验证前 `reconcile`。
5. `task-verification` 按 Project policy 运行 affected 或 Candidate，并把 evidence 绑定当前 tree identity。
6. `openspec-sync-specs` 在 reconcile evidence、pre-sync contract guard 通过后同步 canonical specs；post-sync guard 核对结果。
7. `task-finish` 在验证前执行 current knowledge `inspect`，再完成验证、archive、Git integration、目标分支 push 和安全 cleanup。

## 失败与停止

- Required capability blocked、术语 unresolved、Brief/current knowledge 冲突或 evidence identity 陈旧时停止后续 workflow。
- Reconcile 或 fallback 修订 delivery content 后，旧验证 evidence 失效。
- Archive 只移动已对齐 Change、Brief 和 sidecar；归档后不补写 glossary 或 current knowledge。

