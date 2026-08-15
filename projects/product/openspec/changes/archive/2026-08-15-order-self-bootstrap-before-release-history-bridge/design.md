## Context

Release Task Finish 将发布材料交付到 `dev` 后，Buildr 自举 Workspace 需要用 matching Finish Result 调用 `buildr-self-bootstrap-sync` runner。当前发布 Skill 继续完成 `dev → main` squash merge 和 `main → dev` history bridge，之后才尝试 activation；bridge merge 因而落在 Finish final ref 的后继链中，而 runner 有意拒绝 descendant merge。

runner 的结构化结果是当前 Agent 的 execution evidence，不是持久 authority。发布 bridge 目前只验证 version、candidate tree 和远端竞争，不知道 matching activation 是否已经完成。

## Goals / Non-Goals

**Goals:**

- 在任何 release history bridge merge 产生前完成 matching self-bootstrap activation，或者确定该 plan 不适用。
- 让 bridge 机械验证同一 Finish run 的 closeout evidence，并把缺失、失败、不匹配或已漂移结果挡在 merge/push 前。
- 把 activation 可能形成的合法 successor 纳入随后冻结的 candidate tree，使 GitHub Candidate gate、`main` 与 `dev` 验证同一内容。
- 保持 runner 的唯一 owner、现有 fail-closed 规则和零持久 activation store。

**Non-Goals:**

- 不允许 runner 接受 descendant merge，也不为 release bridge 增加特殊绕过。
- 不把 self-bootstrap 结果写入 Task、Finish、SQLite、Git trailer 或新队列。
- 不改变 tag、npm publication、GitHub Environment 审批或 Candidate shard 语义。

## Decisions

### 1. activation 位于 Finish 与 pre-main convergence 之间

Release Task Finish 完成后立即调用 matching runner。runner 返回 `passed` 或带可解析 plan 的 `not-applicable` 后，发布流程重新读取 `origin/dev` 的 commit/tree，并把该 tree 作为后续 pre-main convergence、PR 和 bridge 的 candidate tree。

这优于仅把 runner 放在 PR merge 与 bridge 之间：若 activation sync 产生真实 successor tree，晚调用会使已合入 `main` 的 tree 与 `dev` 不一致。提前调用使所有后续候选证据天然覆盖 activation 后的远端状态。

### 2. bridge 消费短生命周期 closeout evidence

`bridge-main-to-dev.mjs` 新增必需参数 `--self-bootstrap-run` 与 `--self-bootstrap-evidence`。evidence 文件必须是普通、非 symlink、有界大小的 JSON，并满足：

- schema 为 `buildr.self-bootstrap-closeout-result/v1`；
- status 为 `passed` 或带完整 plan 的 `not-applicable`；
- 顶层 run/task 与 plan run 一致，plan 绑定当前 remote/dev，且没有 recovery plan；
- `passed` 的最终 `finalize` phase 已通过；
- evidence 推导的最终 dev ref 与 bridge fetch 到的 `origin/dev` 完全一致。

`passed` 时最终 dev ref 优先取 passed `push.outputIdentity`，没有 sync/push 时取 passed `preflight.outputIdentity`；`not-applicable` 时取 plan 的 frozen `baseRef`。验证发生在 merge、commit 或 push 前。evidence 只作为同一发布会话的临时命令输入，post-main convergence 后删除。

相比“只增加 Skill 文本”，该门禁能阻止误序执行。相比新建持久 activation receipt，它不复制 runner/Finish authority，也不引入跨会话状态恢复问题。

### 3. runner 契约保持不变

不修改 `closeout.mjs` 的 descendant provenance、merge rejection 或阶段所有权。发布流程若拿不到成功/不适用 evidence 就停止，并从 matching Finish run 重试或诊断 runner；不得先 bridge 再补跑。

## Risks / Trade-offs

- [Risk] 临时 evidence 可被调用方手工构造 → bridge 同时核对 schema、run/plan、phase 和 live `origin/dev`；它是执行门禁 evidence，不升级为安全凭证或 lifecycle authority。
- [Risk] activation successor 改变 candidate tree → 在 activation 后重新冻结 tree，并让后续 pre-main/GitHub/post-main 全部绑定新 tree。
- [Risk] evidence 文件残留 → Skill 使用系统临时目录并在 bridge/post-main 完成或放弃恢复后精确删除；文件不进入 Workspace。
- [Risk] 已有 bridge 调用缺少新参数 → 有意 fail closed，并通过测试、Skill 与 checklist 同步迁移所有正式调用点。

## Migration Plan

1. 更新 bridge CLI 与单元/集成测试，先让缺失 evidence 明确失败。
2. 更新发布 Skill：Finish 后运行 runner、保存 evidence、重新冻结 dev tree，再进入 pre-main；bridge 传入 run/evidence。
3. 更新 release checklist、current knowledge 与验证 owner 映射。
4. 既有已完成 release 不回填 evidence；新的发布准备从新顺序执行。

## Open Questions

无。
