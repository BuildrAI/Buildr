## Context

当前 `main` 与 `dev` 在每次发布后只做来源核验，不建立祖先关系。下一次 release 从 dev baseline 构建后，现有 owner 会在 Candidate 通过后执行 `git merge --no-ff --no-commit origin/main`。这既让旧 Candidate 失效，也会把 main 独有的历史实现重新带入 release。rc.28 已证明该行为会产生版本材料冲突，并自动重新引入已被 dev 替代、甚至造成重复声明的旧发布代码。

发布必须同时满足两件事：保留 main 的历史连续性；最终进入 main 和 publication 的 tree 必须与完整 Candidate 验证的 tree 完全一致。所有产品改动仍只通过 dev 与明确 selection 进入 release。

## Goals / Non-Goals

**Goals:**

- 在完整 Candidate 前形成唯一最终 release SHA/tree。
- 证明 current main 的产品内容已由 current dev/release provenance 覆盖；无法证明时回到 dev。
- 创建包含 release parent 与 main parent 的历史收敛提交，同时保持 release tree 字节不变。
- 强制 release Git mutation 只在 matching Task Environment execution root 中运行。
- 让 Candidate、carrier、main 和 publication 消费同一最终 generation 与唯一 tarball。

**Non-Goals:**

- 不恢复发布后 main→dev merge、rebase 或 history bridge。
- 不允许 main 上的独有产品内容直接进入 release。
- 不改变 npm OIDC、tag、dist-tag、GitHub Release 或 Registry smoke 事务。
- 不把 retained workspace 变成发布执行位置。

## Decisions

### 1. 使用 provenance coverage，而不是工作树 merge

owner 固定 current main、frozen release、selection baseline/source chain 与上一已发布 release evidence。若 main 已是 release 祖先，或 main 的发布来源 baseline/source commits 均由 current dev baseline/selection 证明包含，则 main 内容视为已覆盖。发现无法映射到 dev provenance 的 main 产品提交时零写入阻塞，并要求先以正式 Task 交付 dev。

替代方案是继续三方 merge 后人工解决。该方案会把 main-only 旧实现带入 release，且无法保证人工解决后的 tree 等于原冻结 release，因此拒绝。

### 2. 以显式双亲 commit 固定历史，tree 必须等于 pre-state release tree

coverage 通过后，owner 使用固定 release tree、release parent 与 main parent创建 reconciliation commit；写后必须证明两个父提交与 tree equality。该动作递增 generation、更新 frozen/history refs，但不修改文件内容。禁止使用工作树 merge、`ours` strategy、reset、rebase 或 caller 提交的“已覆盖”布尔值。

### 3. reconciliation 位于完整 Candidate 之前

顺序固定为：selection freeze → main coverage/reconciliation → final freeze → Candidate/唯一 tarball → generation carrier/PR → main tree readback → readiness。main 在 Candidate 后前进会使 current generation stale，必须重新做 coverage/reconciliation 并对新 SHA 运行 Candidate；不得在 Candidate 后修改 release source。

### 4. matching Environment 是 Git mutation 的硬前置

release runner 从 active release Task 的 Environment read model取得 execution root、controller/runtime identity与Git provider evidence，构造 closed binding交给 selection owner。owner核验 repo、worktree、branch、HEAD 与 binding；primary retained worktree、其他 Task worktree或陈旧 binding在首次Git mutation前失败。

### 5. rc.28 通过原 selection lifecycle 恢复

修复先由独立 support Task交付 dev。确认 rc.28 尚无 tag、npm version、GitHub Release和受保护 publication mutation后，维护者显式 reopen；选择修复提交、重新 freeze，执行新的 pre-Candidate reconciliation并运行完整 Candidate。旧 run与tarball保留为历史 evidence，但不进入 readiness。

## Risks / Trade-offs

- [历史 coverage 证据不足导致发布阻塞] → 只接受 current selection、正式 release/main refs 与 hosted publication evidence；缺失时要求先修复 dev provenance，不降级为 merge。
- [main 在 Candidate 后前进] → readiness绑定 main commit；漂移形成新 generation并重跑 Candidate。
- [双亲提交被误当成dev source] → selection read model继续把 reconciliation 作为独立 provenance，拒绝 `sourceDevCommit`。
- [旧调用方没有Environment binding] → 返回稳定的 execution-root blocker，不在 retained workspace兼容执行。

## Migration Plan

1. 实现 coverage inspector、tree-preserving reconciliation 与 Environment binding校验。
2. 调整 Skill、current knowledge、readiness/orchestration 顺序和测试。
3. 交付 dev 后受控 reopen rc.28，选择修复提交并形成新 generation。
4. 以 rc.28 完整执行新流程；失败时保留原 selection/freeze/Candidate evidence，可继续同一未发布版本恢复。

## Open Questions

无。
