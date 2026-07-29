## Context

Task triage 的语义治理轴与执行形态轴彼此独立：`code-only + implementation` 必须进入 canonical task environment，但不创建 OpenSpec Change；纯 metadata-only 工作可以直接留在 retained canonical Workspace。当前 Task Finish 却把 environment receipt 与 active Change 同时写入 consumer contract、CLI 参数和五阶段实现，导致前一种任务缺少 Change、后一种任务缺少 environment，二者都无法收尾。

产品执行器现有安全性依赖 task environment 的单写入边界：prepare 可以 `git add -A`，verify 可以对干净冻结候选执行，deliver 可以从 retained checkout fast-forward，cleanup 可以证明 task-owned worktree/branch。直接让 retained dirty Workspace 进入同一执行器会破坏这些前提，尤其无法在不移动用户无关改动的情况下形成干净验证候选。

## Goals / Non-Goals

**Goals:**

- 无 Change 的 code-only task environment 复用同一五阶段执行器、Node identity、验证、交付和 cleanup 保证。
- Change 专属的 tasks、knowledge impact、strict validation、plan 与 convergence 在 code-only run 中明确为 `not-applicable`，而不是伪造 Change。
- retained canonical metadata-only 任务获得正式、安全的收尾交接，精确保留无关改动并复用现有 Git 单项操作策略。
- 现有 Change Task Finish 调用、run store 和完成结果保持兼容。

**Non-Goals:**

- 不让产品执行器直接接管包含无关 dirty changes 的 retained Workspace。
- 不引入 caller-authored fingerprint、execution plan、recovery manifest 或通用 workflow DAG。
- 不让 `sync`、Task Finish 或 Agent 为 code-only 任务创建虚假 OpenSpec Change。
- 不改变 task-verification 的保证级别、Node identity 或 evidence reuse 规则。

## Decisions

### 1. Task identity 是所有 run 的主身份，Change 是可选分类

首次 `task finish run` 继续只接受 receipt-bound task environment，并从 receipt 取得稳定 `task`、owner、目标分支、CLI 与 Workspace Node identity。`--project` 继续必需；`--change` 改为可选。run identity 增加 `candidateKind: change|code-only`，其中 `change` 候选保存非空 Change identity，`code-only` 候选保存 `change: null`。

选择该方案而不是新增 `--task`，因为 environment receipt 已经是 task identity authority；让调用方再次输入 task 会制造可冲突的第二来源。现有带 `--change` 调用自然映射为 `candidateKind: change`。

### 2. 五阶段保持不变，Change 专属 operation 条件化

preflight 对两类候选都检查 environment/CLI、Node、Project verification policy、Git/target 与 retained readiness。只有 `candidateKind: change` 执行 Change tasks、knowledge impact、OpenSpec strict/pure plan；code-only 对这些 check 返回稳定 `not-applicable` evidence。

prepare 对 Change 候选先执行 `openspec converge`，对 code-only 候选跳过该 operation；两者随后都执行 runtime sync、task checkout candidate commit、target convergence、fixed point 和 freeze。提交信息使用 `change ?? task`，冻结身份同时包含 `task`、`candidateKind`、可空 `change` 与 Node identity。

这比建立第二套 code-only executor 更能保护验证、target fencing、retained convergence、completion 和 cleanup 不变量，也不会增加新的 public action。

### 3. Retained canonical metadata-only 使用正式 Git handoff，不进入产品 run

Task Finish Skill 在调用产品前读取 `worktree context`。如果 context 为 `worktree.not_task_environment`，只有同时满足以下条件才允许 handoff：任务已明确分类为 metadata-only、当前路径是 retained canonical Workspace、任务文件集合可从本轮可观察编辑证据精确列出、验证 evidence 与当前内容匹配、目标 branch/remote 明确。

Skill 披露任务文件、排除的无关改动、commit message、目标分支和 push 影响后，把 commit 与 push 作为两个明确单项动作交给 selected `buildr.git-single-operation/v1` provider。provider 只能 stage 任务文件，不得 `git add -A`、stash、回滚或提交无关状态；每步返回 commit/ref/remote 与 `treeChanged` evidence。任一输入或 provider binding 不可证明时返回正式 blocked，不回退到手写 Git。

选择 handoff 而不是让 retained Workspace 直接进入产品 run，是因为后者若保留无关 dirty changes就无法证明 frozen candidate 与正式验证隔离；若临时 stash 则扩大“收尾”授权并移动用户状态。未来如产品引入 task-owned path receipt 与 clean verification projection，可另行把该路径产品化。

### 4. Capability 依赖只在 fallback 分支成为 required

`task-finish` Skill 声明 optional `buildr.git-single-operation/v1` dependency。普通 task environment 路径不因该 provider 不 ready 而阻塞；只有 retained metadata-only handoff 命中时才要求 selected provider ready。完整“收尾”意图仍由 Task Finish 入口解释，`git-ops` 只执行 Task Finish 已收窄并披露的单项 Git effects。

### 5. 同一 canonical store 兼容扩展

run/result/completion schema identity 增加 candidate kind 并允许 `change: null`，不创建新 store 或 v2 并行目录。旧调用创建的新 run 继续包含 Change；升级前未完成且不符合当前 shape 的 run 仍按既有规则不可恢复。完成结果必须明确报告 Change convergence 是 passed 还是 not-applicable。

## Risks / Trade-offs

- [Risk] code-only 分支漏掉 Change 专属调用，导致 `null` 被传给 OpenSpec。→ 所有 OpenSpec operation 以 `candidateKind` 条件化，并增加产品 journey 断言 command observations 中不存在 OpenSpec validate/converge。
- [Risk] metadata-only handoff 混入无关文件。→ handoff 必须使用精确 path set，Git provider 保持“只 stage 当前任务文件”保证，并增加含无关 dirty file 的 contract/integration 测试。
- [Risk] optional Git provider 被误当成所有 Task Finish 的 required dependency。→ binding 与 Skill 文案明确只在 fallback 分支提升为 required，普通产品 run 测试覆盖 provider 不 ready 仍可进入。
- [Risk] `change: null` 破坏结果消费者。→ result/receipt 明确增加 `candidateKind`，现有 Change fixtures 保持原字段和值，并补充 nullable contract 测试。
- [Trade-off] retained metadata-only 路径没有五阶段 completion receipt。→ 返回类型化 handoff 证据并明确 `completionMode: git-single-operation-handoff`；这是保持用户 dirty state 不被移动的安全取舍。

## Migration Plan

1. 先扩展 run identity、application 输入、executor 条件分支和测试，保持 Change 调用不变。
2. 更新 CLI help、Task Finish contract/Skill 与 package binding，新增 metadata-only handoff 契约测试。
3. 更新 current knowledge 和开发入口资产，运行 sync 后验证 runtime projection。
4. 使用真实 code-only task environment journey 验证五阶段完成；使用含无关 dirty file 的临时 retained Workspace 验证 handoff 只选择任务路径。

回滚时可撤销本 Change；既有带 Change run 不依赖新分支。已经创建的 code-only run 在回滚后的旧客户端中按现有旧-shape fail-closed 规则不可恢复，不进行迁移。

## Open Questions

无。
