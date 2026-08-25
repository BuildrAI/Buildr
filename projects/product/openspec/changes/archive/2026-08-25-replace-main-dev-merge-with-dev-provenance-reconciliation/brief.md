# 以 dev 来源核验替代发布后 main 合并

## 一句话摘要

Buildr 发布后不再把 `main` 合并回 `dev`，而是只读证明冻结 release 的 baseline 和全部选择提交均来自 current `dev`，让 `dev` 保持唯一研发来源和线性历史。

## 背景与问题

现有 release selection 本来就从 `dev` baseline 创建，并把明确选择的 `dev` commit 以 `cherry-pick -x` 纳入 release；但 Publication 成功后又要求创建双亲 `main → dev` merge commit。该步骤与 `dev` 的 required linear history 冲突，也会让同名 source commit 与 release cherry-pick 看起来像 release 上的独立修复。

## 目标 / 非目标

目标是用 closed selection provenance、Publication evidence 和 current remote refs 完成只读、幂等的 dev 来源核验；保留冻结后进入 dev 的新内容；让版本材料和候选修复固定先由 support Task 交付 dev，再选择到 release。

本次不改变受保护 `release → main` PR、Candidate/tarball、tag/npm/GitHub Release、正式远端 release ref 保留策略，也不开放无 dev 来源的 release-only 编辑。

## 受影响用户或角色

- 发布维护者：发布完成不再需要解除 dev 线性历史或人工处理 main merge。
- Release Skill / Agent：候选问题必须从独立 support Task 的 dev 分支修复并交付，再以 `cherry-pick -x` 纳入既有 release。
- Buildr Release Git owner：从 Git mutation owner 变成 dev provenance reconciliation owner。

## 核心流程

1. 版本材料、功能和修复由 Task 从 current dev 开发并交付 dev。
2. `release-<version>` 从 dev baseline 创建，只选择明确的 delivered dev commits。
3. Candidate 通过后经受保护 PR 让 main tree 等于 frozen release tree，再执行唯一 Publication transaction。
4. Publication 后核验 current frozen selection、正式 release ref、published main 和 current dev provenance；核验动作没有 Git 写入。
5. reconciliation 通过后清理 generation carrier、本地 selection refs/branch/worktree，保留正式远端 release ref并完成唯一协调 Task。

## 关键变化

- 新 canonical CLI 动作为 `reconcile-dev`；旧 `converge-dev` 仅保留无写入兼容别名。
- 不再读取 merge policy、创建临时 worktree、merge commit 或 push dev。
- baseline 和每个 `sourceDevCommit` 必须仍由 current remote dev 包含；缺失来源失败关闭。
- lifecycle 和 closeout 以 matching reconciliation passed 为门禁。

## 影响 / 风险 / 兼容性

Git ancestry证明来源而非冻结内容永久不被后续 dev 语义撤销；这是 selection provenance 的既有边界。旧命令别名降低自动化迁移风险，但 Skill 和文档统一使用新术语。已成立 Publication 在任何 reconciliation/closeout 失败时保持不变。

## 验收摘要

- required linear history 下 reconciliation 通过且 `effects: []`，remote dev identity不变。
- selection/source/main/release 任一漂移形成稳定 blocked recovery identity。
- Candidate 问题的指引明确先交付 dev，再选择进入 release。
- lifecycle、Skill、current knowledge、checklist、contract/focused tests 使用同一语义。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Open-source release governance delta](specs/open-source-release-governance/spec.md)
- [Release collection model delta](specs/release-collection-model/spec.md)
- [Agent task workflows delta](specs/agent-task-workflows/spec.md)
- [Implementation tasks](tasks.md)
