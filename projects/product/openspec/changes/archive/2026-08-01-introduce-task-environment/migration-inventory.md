# P0.2 旧 Task Environment 迁移清单

## 本次快照

- 观察日期：2026-08-02（Asia/Shanghai）
- 观察对象：retained canonical Workspace（本次自举 Workspace）
- 观察方式：候选 Product 的一次性 migration reader，`apply: false`
- 结果：33 份旧 v1 receipt；A=1、B=1、C=31、D=0
- 当前阶段：只读计划。候选尚未成为 retained authority，因此没有执行迁移或删除旧数据。

## A 类：正式 Task 与 live worktree 匹配

| Task ID | live repository | 计划 | 当前结果 |
|---|---|---|---|
| `introduce-task-environment` | `workspace` | 生成 v2 Environment Receipt 与窄 Git evidence，重新 probe 后删除旧 receipt/adoption | 待 retained cutover |

## B 类：无正式 Task 的 live worktree

| Task ID | live repository | 计划 | 当前结果 |
|---|---|---|---|
| `modularize-client-cognition-core` | `workspace` | 只生成窄 Git evidence，不创建 Task 或 Environment Receipt；复核后删除旧环境 receipt | 待 retained cutover |

## C 类：没有 live worktree 或其他已知资源

以下 31 份旧 receipt 计划在 retained cutover 时证明无资源后删除；不创建新 Task、Environment Receipt 或 Git evidence：

- `add-closeout-readiness-checkpoint`
- `automate-deterministic-openspec-convergence`
- `avoid-duplicate-openspec-archive-sync`
- `bind-task-board-workspace-context`
- `clarify-task-board-retained-workspace`
- `complete-task-finish-convergence-recovery`
- `coordinate-concurrent-verification-resources`
- `enforce-openspec-sync-sequencing`
- `enhance-openspec-human-readable-knowledge`
- `fix-managed-mutations`
- `fix-task-finish-detached-process-cleanup`
- `fix-task-finish-pre-sync-wording`
- `fix-workspace-node-entry`
- `guard-package-root-migration`
- `harden-task-finish-verification-boundaries`
- `introduce-task-finish-action-registry`
- `optimize-task-asset-review-lifecycle`
- `optimize-task-finish-convergence`
- `optimize-task-finish-final-candidate-sequencing`
- `optimize-task-finish-orchestration-efficiency`
- `optimize-task-finish-recovery-and-fixtures`
- `optimize-task-finish-safe-execution`
- `optimize-task-triage-current-facts`
- `optimize-task-worktree-skill`
- `optimize-user-facing-terminology`
- `persist-task-asset-observations`
- `redesign-openspec-convergence-transaction`
- `release-0.1.0-rc.7`
- `simplify-task-board-skill`
- `upgrade-openspec-1-6`
- `validate-concurrent-task-workflows`

## D 类：identity 或 ownership 冲突

本次快照没有 D 类。Cutover 前必须重新运行同一只读枚举；只要出现一份 D 类，就停止整个 retained Workspace 的旧 authority 迁移，保留原 bytes 与资源，不做部分切换。

## Cutover 后需要回填的结果

retained Product source 集成候选后，由 retained stable controller 运行正式 `sync`。完成后在本文件回填：

- 最终重新枚举的 A/B/C/D 数量；
- 每项迁移或删除是否成功；
- 新 Environment Receipt / Git evidence 是否通过 current-machine probe；
- 旧 receipt/adoption 是否全部退出正常 routing；
- 若出现 D 类，记录唯一人工解决动作，不修改冲突现场。
