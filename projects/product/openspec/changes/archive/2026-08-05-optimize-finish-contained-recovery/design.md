## Context

Task Finish 的 deliver 会先把 carrier fast-forward/push 到 target，再运行 retained Doctor。若 Doctor 因自举 Workspace 尚未同步新版 Component 而阻塞，Formal Finish 尚未成功，但 carrier 已在远端。当前 self-bootstrap Skill 只接受成功 Result，导致 Agent 容易提前同步并推送第二个 commit，进而让同一 Finish resume 看到 target-race。

另一个独立问题发生在真实并行交付：远端 target 可能在已推送 carrier 之上继续前进。当前 executor 只接受“远端等于 expected baseline”或“远端等于 carrier”，否则一律 target-race；恢复会丢弃旧 carrier 并把原 Task Contribution重新应用到最新 baseline，即使该 baseline 已完整包含旧 carrier，也会产生假冲突。

约束是：通用 Task Finish 不读取 Workspace/Project 专属配置、不执行 Buildr sync；self-bootstrap 仍是 Workspace-owned Skill；Candidate、Formal Verification、Completion Review、Development handoff 与原 Task source保持不可变。

## Goals / Non-Goals

**Goals:**

- 自举 Workspace 在精确 Doctor/package 条件成立时先形成 clean 的本地 sync commit，但不提前改变远端 target；Formal Finish 成功后再发布并复核 Doctor。
- 通用 deliver 对“远端 target 是当前 carrier 的后代，且 carrier changed paths 的最终 mode/blob 全部保留”形成确定性包含证明，跳过 target-race rebuild。
- 任何不满足精确证明的情况继续 fail closed，保持现有 target-race 和 Delivery Adaptation。

**Non-Goals:**

- 不让 Task Finish 识别 `buildr-self-bootstrap`、`components.update_available` 或 package paths。
- 不增加 activation plugin、adapter registry、长期锁、通用事务或新的 Workspace 状态库。
- 不自动 rebase/pull/force push，不把同路径语义变化解释为包含。

## Decisions

### 1. Self-bootstrap 由 Workspace Skill 提供两段式维护

`buildr-self-bootstrap-sync` 增加两个受控阶段，但仍是一个 Workspace Skill：

- `prepare`：仅消费同一 run 的 blocked Finish Result。要求 failure 为 `task-finish.retained-doctor-failed`，全部 actionable findings 都是 `components.update_available`，冻结 Task Contribution 命中既有 package inputs，且 deliver operations 已证明 carrier 普通 push/readback 成功。随后执行 retained sync、核验 mutation plan、用 Git Operations 只 commit 精确 managed delta，不 push。
- `publish`：只在同一 run 的 Formal Finish Result 成功后执行。若存在已准备的 clean local commit，核验其 push range 与 Result identity后普通 push、远端回读和 Doctor；若没有 prepare，则保持现有 post-Finish sync/commit/push 路径。

选择 Skill 而不是修改 executor，是因为该时序只属于 Buildr 自举 Workspace。选择本地 Git identity 而不是新 receipt，是因为现有 Git Operations 已能证明 commit、push range和readback，第一版没有第二 writer 或跨机器恢复需求。

### 2. Already-contained 在 deliver 原地证明，不重建 carrier

当 observed target 既不等于 expected baseline、也不等于 carrier head 时，deliver 先 fetch 当前 target，并检查：

1. carrier head 是 observed target 的 Git ancestor；
2. carrier `changes` 中每个路径在 observed target 的 mode/blob 与 carrier after state 完全一致，删除项仍不存在；
3. current Development carrier equivalence 仍通过。

全部成立时，delivery 记录 `targetDisposition: already-contained`、原 carrier ref 和最新 final remote ref；跳过 fast-forward/push，但继续 retained activation、Doctor 和 cleanup。carrier identity/reuse mode仍描述 carrier 如何形成，不用 `already-contained` 冒充新的 carrier reuse mode。

若 ancestor、fetch、mode/blob 或 currentness 任一项无法证明，维持原 `task-finish.target-race`。后续提交修改任一 carrier-owned path时不会被自动接受。

### 3. 允许 final remote 是 carrier 的已证明后代

普通交付仍要求 `remoteAfterRef === carrierRef`。只有 `targetDisposition: already-contained` 时，允许 `finalRemoteRef` 是 carrier 的已证明后代，并在 Result 中保留 containment evidence。cleanup 仍绑定原 carrier、Task Contribution和current handoff，不重新生成 Candidate或专业 Result。

## Risks / Trade-offs

- [Skill prepare 后 Agent 中断] → 不增加新 receipt；恢复时只接受 clean retained branch、可证明的本地 ahead commit 与精确 managed push range，无法证明就停止。
- [Doctor 同时存在无关问题] → prepare 要求全部 actionable findings 都是 `components.update_available`，否则不运行 sync。
- [并行 target 修改同一路径但语义仍兼容] → mode/blob 不同即不自动包含，进入现有 Delivery Adaptation，由 Agent判断。
- [远端在 publish 前再次前进] → Git Operations 普通 push失败并保留现场；不回滚已成功的 Formal Finish。
- [ancestor 存在但任务效果被后续提交撤销] → 逐路径 after mode/blob 检查阻止仅凭 ancestry放行。

## Migration Plan

1. 先增加 already-contained proof/helper、deliver分支与集成测试。
2. 更新 self-bootstrap Contribution/Skill和契约测试，保留成功 Result 的原正常路径。
3. 同步 package/runtime测试与 canonical specs；在隔离 fixtures验证普通 Workspace不获得自举行为。
4. 回滚时删除新 deliver分支和Skill prepare段；原 target-race与post-Finish sync行为继续可用。

## Open Questions

无。
