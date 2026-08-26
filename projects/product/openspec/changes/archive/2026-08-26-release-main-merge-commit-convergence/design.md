## Context

发布集合由 `dev` 的精确 baseline 和显式 `cherry-pick -x` 选择构成；`dev` 保持线性。现有 release→main 逻辑只验证最终 tree，并兼容 squash。由于 main 上一次发布使用 squash 后丢失了 dev 的原始 ancestry，rc.24 的 release 与 main 同时修改了相同文件，现有 carrier PR 进入真实冲突状态。

本变更横跨 release collection、Git convergence、Candidate/readiness 和产品发布契约。目标是让一次发布可以在不污染 dev 历史的情况下吸收当前 main 的差异，并保留可重建的证据链。

## Goals / Non-Goals

**Goals:**

- 为一次目标发布提供显式、一次性的 main reconciliation 操作。
- 用 merge commit 将已解决的 release 结果合入当前 main，并绑定两个父提交、冲突解决结果和最终 tree。
- reconciliation 造成内容变化时，递增 release generation，失效旧 Candidate/artifact/readiness/PR 证据并重新验证。
- 保持 release 的来源选择、`cherry-pick -x` provenance、dev 线性历史和 main 保护规则。
- 让 GitHub PR 与本地/远端 read model 都能证明使用了 merge commit。

**Non-Goals:**

- 不自动解决语义冲突，不使用 `ours`、reset、rebase 或 force push。
- 不把 main 的 reconciliation commit 写回 dev，也不把 main 改造成 dev 的祖先要求。
- 不在本变更中执行 tag、npm、GitHub Release 或其他公共发布 mutation。
- 不取消普通开发 PR 的 squash 能力；只约束 release→main 发布 PR。

## Decisions

### 1. 新增 typed reconciliation，而不是把冲突当作普通 cherry-pick

reconciliation 由 release owner 管理，输入必须包括 current main commit/tree、current frozen selection identity、版本和 generation。输出保存 pre-reconciliation release identity、main identity、post-reconciliation release commit/tree、两个父提交和 resolution digest。这样可区分“选择集合来源”与“为适配 main 产生的发布收敛结果”。

替代方案是把 main 强行 reset 到 release 或让 release 继续 cherry-pick main 的全部提交；前者破坏 main 保护语义，后者会污染选择 provenance，均不采用。

### 2. 用 release 侧 merge commit 作为候选新 source

冲突解决在隔离 execution worktree 完成，产生一个以当前 main 和原 frozen release 为父提交的 merge commit；该 commit 成为新 generation 的 release HEAD，随后重新生成 Candidate 和唯一 artifact。最终 release→main PR 使用 GitHub 的 `Create a merge commit`，其 base 是真实 `main`，head 是 generation carrier。

替代方案是继续 squash 并只比较 tree。它无法证明冲突解决的父提交关系，也会继续制造 ancestry 漂移，因此不作为 release PR 的策略。

### 3. 旧证据失效，禁止沿用旧 Candidate

只要 reconciliation 修改 tree 或 commit，旧 generation 的 Candidate aggregate、tarball、readiness context 和 PR head 都标记 stale。重新生成的 Candidate 必须精确绑定新的 release source commit/tree；旧 artifact 不可作为复用输入。

若 reconciliation 是同一输入的重复调用且结果及 live refs 完全相同，则返回幂等 readback，不递增 generation。

### 4. 保留一次性边界和明确授权

reconciliation 只允许对当前未公开版本的 current frozen selection 执行一次有效变更；每次执行都要证明 main ref、release ref、selection freeze 和 ownership 未漂移。任何远端 ref 竞争、未解决冲突、公开发布事实或授权缺失都 fail closed。

## Risks / Trade-offs

- [冲突解决可能需要业务判断] → owner 只报告冲突 paths 和恢复入口；人工解决后必须重新计算 resolution digest 并重新跑 Candidate。
- [release merge commit 增加一个中间 release identity] → 通过 generation、父提交和 selection provenance 结构化记录，避免把它伪装成 dev source commit。
- [GitHub 仓库仍全局允许 squash/rebase] → release PR 的 readiness/closeout 检查强制读取 merge commit 结果；普通 PR 策略不在本变更内收窄。
- [旧 Candidate 不能复用导致验证成本增加] → 仅在 commit/tree/selection/main 输入全部相同的幂等重试中复用，任何实质变化都显式重跑。
- [本地模型和 GitHub 远端状态可能竞争] → 所有 mutation 前重新 fetch 并使用 compare-and-swap identity；冲突时保留现场，不自动覆盖。
