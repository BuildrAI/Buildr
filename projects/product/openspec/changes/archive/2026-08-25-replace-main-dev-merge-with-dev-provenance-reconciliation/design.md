## Context

Buildr 的 release selection 已经从可由 `dev` 证明的 baseline 创建，并只允许把明确选择的 `dev` commit 以 `cherry-pick -x` 纳入 release。现有 Publication 后步骤却再次把 squash 后的 `main` 合并回 `dev`：它依赖双亲 merge commit、与 `dev` 线性历史保护冲突，也让同标题的 source commit 和 release cherry-pick 看起来像两套独立修复。

现有 `inspectReleaseSelection` 已能从 lifecycle refs 和 cherry-pick trailer 重建 baseline、ordered `selectionChain`、freeze 与 selection identity，并验证 baseline 和每个 `sourceDevCommit` 均包含于 current dev。这些事实足以作为发布后 reconciliation 的权威，无需通过 `main` 改写 `dev`。

## Goals / Non-Goals

**Goals:**

- 让 `dev` 成为版本材料、修复和普通功能的唯一研发来源。
- 在 Publication 后以只读、幂等、可恢复的 owner 证明 frozen selection 仍匹配发布事实，且其 baseline 与全部 source commits 仍由 current remote `dev` 包含。
- 保留冻结后进入 `dev` 的新提交以及 `dev` 线性历史，不创建 merge/rebase/reset/force-push 等写入。
- 让 lifecycle、closeout、Skill、文档和测试使用同一 reconciliation 状态与 identity。

**Non-Goals:**

- 不改变 `release → main` 受保护 PR、squash/tree equality、tag/npm/GitHub Release 或 hosted transaction。
- 不让 release 自动追随后续 `dev`，也不把整条 release branch 合并或 cherry-pick 回 `dev`。
- 不在本次引入可绕过 provenance 的 release-only 编辑接口；没有 `sourceDevCommit` 的 selection entry 继续失败关闭。
- 不改变正式远端 `release-<version>` 的默认保留策略。

## Decisions

### 1. 以 closed selection provenance 代替 main ancestry

新的 `reconcile-dev` owner 读取 validated Publication evidence、current frozen selection、remote `main`、`dev` 和正式 release ref。它必须同时证明：

- Publication 的 main commit/tree 仍匹配 current remote `main`；
- Publication context 的 version、selection identity、generation、release head/tree 与 current frozen selection 完全一致；
- 正式远端 `release-<version>` 仍精确指向 frozen release head；
- selection baseline 和每个 ordered `sourceDevCommit` 均为 current remote `dev` 的祖先；
- selection 中不存在无法重建 `sourceDevCommit` 的 release-only entry。

通过结果记录 `devHead`、baseline、source commits、selection/publication identities 和稳定 reconciliation identity，但 `effects` 必须为空。相比比较 main 与 dev tree，这一模型允许 dev 在冻结后继续开发，也避免把合法的新提交误判为漂移。

备选方案是继续合并 main、把 release 整体 cherry-pick 回 dev，或要求两棵树相等；这些方案都会重复历史、破坏线性策略或丢失 dev 后续演进，因此不采用。

### 2. 让不具备 dev 来源的内容失败关闭

当前 selection owner 已把缺少合法 `-x` trailer、source 不在 baseline 之后或 source 不被 current dev 包含视为 provenance invalid。reconciliation 复用该 closed read model，不接受调用方声明“这是 changelog/README 元数据”来绕过。

如果未来需要真正的 release-only metadata，必须另行设计明确的 entry 类型与独立 dev reconciliation evidence；在此之前，版本号、CHANGELOG、README 和候选修复都先由 support Task 交付到 `dev`，再选择进入 release。

### 3. 新命令语义与兼容入口

CLI 的 canonical 动作为 `reconcile-dev`，输出状态使用 `passed` 或 `published-but-dev-reconciliation-blocked`。模块导出改为 `reconcilePublishedReleaseWithDev`。为避免旧自动化在升级瞬间变成未知命令，`converge-dev` 和 `convergePublishedMainToDev` 暂时保留为同一只读实现的兼容别名；它们不得再检查 branch merge policy、创建临时 worktree、commit 或 push。

稳定 recovery identity 绑定 version、Publication evidence、selection identity、expected main/release identities 和 observed dev head。事实未变的重试返回同一 identity；事实变化后必须重新读取并形成新结果。

### 4. lifecycle 与 closeout 只消费 reconciliation 结果

现有 lifecycle 中通用 `convergence` slot 保留 schema 兼容，但语义改为 post-publication dev provenance reconciliation。Publication passed 后，只有 matching reconciliation passed 才进入 closeout；closeout 继续清理 generation carrier、本地 selection worktree/branch/lifecycle refs，并保留和核验正式远端 release ref。

`dev` branch policy readback 不再是发布完成门禁；required linear history 是受保护的不变量，而非需要绕过的 blocker。

### 5. 修复流固定从 dev 出发

Candidate 或 release 验证发现问题时，Release Skill 必须保持同一协调 Task 和同一 release selection，创建或复用窄 support Task 的独立 worktree（基于 current `dev`）。修复通过 Development、Verification、Finish 交付到 `dev` 后，才可 reopen 当前未公开 release，并把该 delivered dev commit 以 `cherry-pick -x` 纳入 release、重新 freeze 和 Candidate。不得直接在 release worktree 修复后再倒灌 dev。

## Risks / Trade-offs

- [仅用 Git ancestry 证明来源，不能保证后续 dev commit 没有语义撤销原改动] → selection 的契约是来源与交付 provenance，不是 frozen bytes 必须永久存在于 dev HEAD；如未来需要内容级持续存在约束，应由独立 patch/semantic evidence 建模，不能用 main merge 冒充。
- [兼容别名名称仍含 converge，可能继续造成误解] → Skill、文档和所有新调用只使用 `reconcile-dev`，兼容别名输出 canonical operation 与弃用提示，并通过测试证明无写入。
- [旧已发布版本缺少本地 selection refs 时无法 reconciliation] → 失败关闭并保留 Publication；只允许从可验证的正式 release/ref/evidence 恢复，不从聊天或历史 stdout 猜测。
- [release-only metadata 暂时不可用] → 这是有意的安全边界；所有当前版本材料先进入 dev，未来只有在明确 schema 与回流 evidence 设计后才开放。

## Migration Plan

1. 更新 canonical delta specs、current knowledge 和 Release Skill 源资产。
2. 用只读 reconciliation 替换 merge owner，保留旧入口别名并更新 lifecycle/CLI/tests。
3. 通过 focused、contract 与 Product verification 后将本 Change 收敛并交付 `dev`。
4. 使用新 owner 对已发布 rc.23 读取 current evidence；通过后执行原有 closeout 资源清理并完成同一 release Task。

回滚仅回滚尚未发布的产品代码提交；不得通过回滚删除 rc.23 tag、npm package、GitHub Release 或改写任何已成立 Publication 事实。

## Open Questions

无。本次明确禁止无 dev provenance 的 release-only entry；未来若确有需求，另立 Change 设计其 evidence schema。
