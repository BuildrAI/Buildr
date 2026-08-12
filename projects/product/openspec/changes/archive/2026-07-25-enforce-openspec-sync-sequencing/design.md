## Context

`openspec-contract-guard` 已在 canonical sync 前后提供 `pre-sync` 与 `post-sync` 门禁，`task-finish` 已在 post-sync 成功后使用 `archive --skip-specs`。但是 apply sidebar 没有禁止 Agent 在开始收尾前预写 canonical spec，导致 guard 的设计性失败被推迟到收尾。另一方面，Buildr 自举 workspace 的 `buildr sync` 会投影已验证的 package Skill 到 runtime 并更新 receipt；该 delivery delta 可由生成来源和完整性检查精确证明，但当前一律触发项目验证重跑。

## Goals / Non-Goals

**Goals:**

- 将 canonical spec 的 agent-driven sync 固定在 pre-sync 成功之后、post-sync 之前。
- 让 apply 阶段明确只修改 change artifacts 与实现，不预写 canonical specs。
- 仅为可证明的 Buildr runtime projection/receipt delta 复用 implementation evidence，并保留 focused integrity checks。

**Non-Goals:**

- 不实现新的 OpenSpec merge engine，不复制上游 archive/sync 逻辑。
- 不修改外部 `openspec-*` Skills、OpenSpec CLI 或安装行为。
- 不把 lockfile、任意 generated file、source 资产或无法精确归因的 diff 归为 projection-only。

## Decisions

### 1. 在 apply sidebar 阻止提前 canonical sync

apply sidebar 将要求 active change 的 canonical spec 保持基线状态，直到 Task Finish 的 pre-sync check 成功。同步由当前会话的 agent-driven 路径在 pre-sync 与 post-sync 之间完成；这复用 guard 的 receipt，而不新增旁路状态。

替代方案是在 baseline stale 时自动 `--update` 或 adopt canonical。拒绝：这会把本 change 的未验证写入伪装为前序事实，破坏 pre-sync 的意义。

### 2. runtime projection-only 是严格的 closeout-metadata-only subtype

只有 `buildr sync` 在已集成的保留 checkout 上生成的 runtime projection 和对应 receipt，且 `git diff` 只含这些受管路径、`buildr component check` 与 doctor 均通过、implementation source 未变化时，才可复用已有 verification evidence。它仍须运行 runtime/receipt focused checks，并记录 source/delivery identity 与 sync 来源。

替代方案是所有 sync 后一律重跑 affected。拒绝：当 package source 已被验证、diff 又可由 receipt 完整证明时，重复运行同一项目验证不增加相称保证。

### 3. 其他生成资产维持 fail-closed

lockfile、非受管生成内容、生成失败后的手工修复、来源不明的 receipt 变化，以及任何 source implementation diff 仍为 `implementation-changed`，必须重新执行同级 requiredAssurance。

## Risks / Trade-offs

- [projection-only 条件被表述过宽] → 使用来源、精确 diff、component check、doctor 和 source identity 的合取条件；任一缺失即重跑。
- [Agent 仍在 apply 阶段预写 canonical] → 将禁止项放入实际 apply sidebar，并以契约测试锁定文本边界。
- [上游 OpenSpec 行为变化] → 保持外部 CLI/Skills ownership，仅消费现有 pre/post-sync guard 与 archive 选项。
