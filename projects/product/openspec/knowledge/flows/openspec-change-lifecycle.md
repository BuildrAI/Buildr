# OpenSpec Change 生命周期

## 当前流程

1. `task-triage` 先核对 authority 与 repository set，再分别判断语义治理、implementation/metadata-only 形态和任务跟踪。工作已经对齐为正式持久交付时，在首次交付写入前通过 selected `buildr.task-record/v1` provider 在 canonical Workspace 创建或恢复 Task Record；讨论、只读探索和只维护既有 lifecycle metadata 不创建记录。随后通过 selected `buildr.task-environment/v1` provider 运行 `prepare`，按同一 Task ID 得到共享执行根或隔离 checkout、Workspace Node/CLI/依赖、runtime projection 与真实 `ready / blocked` probes。Git worktree 只由窄 provider 提供 evidence。Task Manager 不读取 Environment Receipt 或保存环境事实；Agent 只消费 Environment 结果中的 workdir、allowed roots 和结构化 `cliInvocation`，不按 cwd、branch 或相同 HEAD 猜 ownership。原会话可以从 canonical Workspace 启动，不要求 session root 等于 Environment root。
2. `openspec-propose` 使用 OpenSpec 1.6.0 创建 proposal、design、delta specs 和 tasks；Buildr contribution 创建 Brief、执行 current knowledge `assess`，并运行 proposal contract check。历史 change 的 contract baseline 只作兼容诊断，不再是确定性收敛授权。
3. `openspec-update-change` 修订 planning artifacts 时同步刷新 Brief 与 impacts。方案已经形成后，Agent 可以通过同一个 `task-review` capability 执行 Planning Review，并把绑定当前 Task/plan target identity 的完整结果记录到可选 planning slot；P0.3 本身不把该结果设为 apply 或 handoff 门禁。Task-scoped Change 详情的审查 Agent action进入此 route，全局 retained-only Change 仍使用 generic review prompt。
4. `openspec-apply-change` 实现 tasks；发现的新知识影响写回 tasks/sidecar，implementation content 完成后在最终验证前 `reconcile`。
5. Change 或 code-only Task Environment 中的候选达到 finish-ready 后，`task-finish` 在产品 run 外完成 asset review finalize；仍需人工决定时停止。随后只调用一次 `buildr task finish run --task <task-id> --project <code> [--change <id>]`；有 Change 时记录 `candidateKind: change`，省略 Change 时记录 `candidateKind: code-only`。产品固定执行 `preflight → prepare → verify → deliver → cleanup`，Agent 不逐阶段补 evidence 或 recovery。
6. `preflight` 通过 Environment Application 复核 ready execution binding/CLI、Project verification declarations、Git/target 与 retained readiness；Change 路径还检查 tasks/knowledge 与 OpenSpec strict/pure plan，code-only 将这些专属检查标记为 `not-applicable`。`prepare` 只为 Change 路径调用 `openspec converge`，随后现有 Finish 执行 runtime sync、commit、target rebase 与 fixed point，冻结 opaque target identity；该内部 frozen target 不是 P0.5 Candidate generation。
7. `verify` 只通过 Task Verification Application inspect current Result。target/declaration applicability 为 current、conclusion passed 且覆盖全部适用 delivery-required capability 时复用；单 Project command capability 可由临时 adapter 执行一次并整值记录，多 Project 或 Agent capability 必须已有正式 Result。失败、stale 或 coverage gap 都结束当前 Finish；Finish 不把它改写成风险推进决定，也不创建 Task/Candidate 状态。
8. `deliver` 在短 target lease 中重新观察 ref，只允许 fast-forward 与普通 push，然后执行 retained doctor/sync 和必要的 CLI/Local App bundled runtime install。交付事实 durable 后，Finish 向 Environment 提交每个 scope 的 delivery identity；Environment 先停止 Task-owned 动态资源，再调用 provider cleanup 并保存唯一 cleanup 结果。target/network/retained/cleanup 暂态阻塞可用产品生成 token 恢复，且不重跑已通过阶段。
9. 多个 finish run 独立并发，不使用 Workspace 全局锁。客户端直接使用唯一 canonical Task Finish store，不创建版本化运行目录；旧 run shape 不可恢复。

P0.3 提供可选 Completion Review slot，但不会生成 Candidate identity 或通用状态机；只有调用方已经持有明确 target identity 时才能记录。未来是否在 handoff 要求 Planning/Completion Review，由 Task Development Change 基于实际工作流决定，不由 Review Result schema 预设。

P0.4 提供一个 current Task Verification Result、Project declaration v2 与 transient execution。Result 绑定明确 target identity 和由 Application 观察的 declaration identities，目标或声明变化后派生 stale；完整 Result 原子替换，中断、未形成终态或写入失败不覆盖 current。P0.4 不拥有 `proceed / blocked`、Task Development、Candidate generation 或新的 Finish 状态机。

没有 Change 的独立当前事实收敛不进入上述 Change planning lifecycle：`task-triage` 选择 `spec-maintenance + metadata-only`，由 selected `buildr.current-knowledge-maintenance/v2` provider 执行 `maintain`。它只让 current knowledge 追上已由 canonical specs、实现、registries 或已确认决定证明的既有事实；authority 冲突返回 `unresolved`，发现新业务语义返回 `change-required` 并重新进入 Change lifecycle。

如果 metadata-only 候选保留在 retained canonical Workspace，`worktree.not_task_environment` 使产品 Task Finish run 正式不适用。Task Finish Skill 只有在任务 paths、验证 identity、目标 branch/remote 与无关 dirty paths 可精确证明时，才把 commit 和 push 分别交给 selected `buildr.git-single-operation/v1` provider；否则 blocked。该 handoff 不使用 `git add -A`、stash、回滚或虚假 Change，也不生成五阶段 completion receipt。

## 失败与停止

- Required capability blocked、术语 unresolved、Brief/current knowledge 冲突或 evidence identity 陈旧时停止后续 workflow。
- Environment Receipt、实际 scope/root、controller、Runtime/CLI/依赖、runtime projection、provider evidence 或动态资源 probe 不匹配时停止 proposal/apply/verification；`prepare` 只恢复可确定修复，不静默改 plan。
- Reconcile 或其他 mutation 改变 target identity 后，current Verification Result 派生 stale；Project declaration identity 变化同样 stale。
- Projected validation 在 task-owned 临时 Project 中投射完整 expected canonical tree，并使用 receipt 绑定的 OpenSpec executable 运行 strict validation；失败时正式文件零写入。写入前任一 delta、canonical before 或 executable identity 漂移都会重新规划，混合或未知文件状态关闭式失败。
- Task Finish 只接收其现有 finish-ready 输入。产品报告五阶段、opaque frozen target、Task Verification Result 适用性、交付/清理证据、具体 primary failure 与执行次数；不得把研发修复、审查返工或重新验证计入收尾。验证发现产品缺陷时本次 Finish 终止。
- Task Finish preflight 一次聚合低成本、无共享副作用检查；preflight 失败时不启动临时 verification execution，preflight 成功也不替代 current Task Verification Result。
- retained metadata-only handoff 的任务 path、验证 identity、目标 ref 或 Git provider readiness 任一不可证明时停止，不能把 dirty retained tree 伪装为 task environment。
- Archive 只移动已对齐 Change、Brief 和 sidecar；归档后不补写 glossary 或 current knowledge。
- 逻辑 Task/Change/run 可跨 Agent session 延续，但默认仍是同一用户对话和一个 Task Environment。普通 Rule/Skill 内容修改不要求新 session、reload、re-enter 或 activation evidence。只有任务本身修改 runtime 的发现、加载或激活机制，且专项验收明确要求证明该机制在真实 Agent host 生效时，才由 Task Verification 验证；P0.2 不内省 Agent host，也不保存 session adoption evidence。
