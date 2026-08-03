# OpenSpec Change 生命周期

## 当前流程

1. `task-triage` 先核对 authority 与 repository set，再分别判断语义治理、implementation/metadata-only 形态和任务跟踪。工作已经对齐为正式持久交付时，在首次交付写入前通过 selected `buildr.task-record/v1` provider 在 canonical Workspace 创建或恢复 Task Record；讨论、只读探索和只维护既有 lifecycle metadata 不创建记录。随后通过 selected `buildr.task-environment/v1` provider 运行 `prepare`，按同一 Task ID 得到共享执行根或隔离 checkout、Workspace Node/CLI/依赖、runtime projection 与真实 `ready / blocked` probes。Git worktree 只由窄 provider 提供 evidence。Task Manager 不读取 Environment Receipt 或保存环境事实；Agent 只消费 Environment 结果中的 workdir、allowed roots 和结构化 `cliInvocation`，不按 cwd、branch 或相同 HEAD 猜 ownership。原会话可以从 canonical Workspace 启动，不要求 session root 等于 Environment root。
2. `openspec-propose` 使用 OpenSpec 1.6.0 创建 proposal、design、delta specs 和 tasks；Buildr contribution 创建 Brief、执行 current knowledge `assess`，并运行 proposal contract check。历史 change 的 contract baseline 只作兼容诊断，不再是确定性收敛授权。
3. `openspec-update-change` 修订 planning artifacts 时同步刷新 Brief 与 impacts。方案已经形成后，Agent 可以通过同一个 `task-review` capability 执行 Planning Review，并把绑定当前 Task/plan target identity 的完整结果记录到可选 planning slot；P0.3 本身不把该结果设为 apply 或 handoff 门禁。Task-scoped Change 详情的审查 Agent action进入此 route，全局 retained-only Change 仍使用 generic review prompt。
4. `openspec-apply-change` 实现 tasks；发现的新知识影响写回 tasks/sidecar，implementation content 完成后在最终验证前 `reconcile`。
5. 实现、测试开发与修复完成后，`task-development`先使用current knowledge provider完成`reconcile/inspect`，让所有关联Change完成sync/archive或明确`not-applicable`，并在受管runtime资产同步固定后观察ready Environment全部scope的stable Content Target。code-only、无Git或无OpenSpec Task走同一Application，只提交空Change列表；`.buildr`/`.git`控制面metadata不进入Content identity。
6. Development根据Task scope与Task Verification Application返回的declaration observations记录verification policy。随后`task-verification`针对Content Target执行已声明capabilities并记录唯一current Result；Result只绑定Content Target、declarations、capability facts、coverage gaps和结论。target/declarations current且policy facts完整后才能freeze Task Candidate；`not-passed`或coverage gap保持原事实，但不自动阻止freeze。
7. Task Candidate identity只绑定Content Target、Task Intent/scope/Change context、verification policy identity和generation，不包含Review/Verification Result identity。Task Review随后把Completion Result绑定Candidate。Development根据三个current gate形成`proceed / blocked`；Verification `not-passed`、coverage gap或Completion `changes-required`只有在用户接受绑定精确Result digest、范围和来源的风险后才能proceed。正式handoff以append-only snapshot绑定Candidate、Change dispositions、最小gate refs和decision；asset review若有observation，必须在handoff前finalize。
8. current handoff完成后只调用一次`buildr task finish run --task <task-id>`。P0.5固定执行`preflight → prepare → verify → deliver → cleanup`：preflight只聚合Environment/handoff/target/retained readiness；prepare只形成内容等价carrier；verify只复核Development handoff/carrier等价，formal Verification次数固定为0；deliver只允许fast-forward、普通push及retained sync/install/doctor；cleanup向Task Environment交接。
9. Finish不解析或收敛Change，不修改候选内容，不运行formal Verification/Completion Review，不生成Candidate或风险决定。内容/上下文/policy/Result漂移、carrier不等价或target race都终止run并返回Development；network、retained或cleanup等carrier未变的暂态阻塞才可由产品resume token恢复。多个run独立并发，不使用Workspace全局锁；v2 run/result拒绝旧v1 shape且不建立第二Finish Receipt authority。

P0.3继续只提供可选Planning/Completion Review slots，不生成Candidate identity或通用状态机；P0.5 Task Development把Planning ready设为freeze前置，并要求Completion Result绑定current Candidate后才能proceed/handoff。Review Application自身仍允许两个slot独立缺失。

P0.4继续提供一个current Task Verification Result、Project declaration v2与transient execution。P0.5把其target语义固定为stable Content Target；Result和Application schema不获得Candidate、policy、`proceed / blocked`或Finish authority。完整Result原子替换，中断、未形成终态或写入失败不覆盖current。

没有 Change 的独立当前事实收敛不进入上述 Change planning lifecycle：`task-triage` 选择 `spec-maintenance + metadata-only`，由 selected `buildr.current-knowledge-maintenance/v2` provider 执行 `maintain`。它只让 current knowledge 追上已由 canonical specs、实现、registries 或已确认决定证明的既有事实；authority 冲突返回 `unresolved`，发现新业务语义返回 `change-required` 并重新进入 Change lifecycle。

如果metadata-only候选保留在retained canonical Workspace，`worktree.not_task_environment`使产品Task Finish run正式不适用。Task Finish Skill只有在任务paths、current Development handoff、目标branch/remote与无关dirty paths可精确证明时，才把commit和push分别交给selected`buildr.git-single-operation/v1` provider；否则blocked。该handoff不使用`git add -A`、stash、回滚或虚假Change，也不生成五阶段completion receipt。

## 失败与停止

- Required capability blocked、术语 unresolved、Brief/current knowledge 冲突或 evidence identity 陈旧时停止后续 workflow。
- Environment Receipt、实际 scope/root、controller、Runtime/CLI/依赖、runtime projection、provider evidence 或动态资源 probe 不匹配时停止 proposal/apply/verification；`prepare` 只恢复可确定修复，不静默改 plan。
- Reconcile 或其他 mutation 改变 target identity 后，current Verification Result 派生 stale；Project declaration identity 变化同样 stale。
- Projected validation 在 task-owned 临时 Project 中投射完整 expected canonical tree，并使用 receipt 绑定的 OpenSpec executable 运行 strict validation；失败时正式文件零写入。写入前任一 delta、canonical before 或 executable identity 漂移都会重新规划，混合或未知文件状态关闭式失败。
- Task Finish只接收current Development handoff。产品报告五阶段、Candidate/Content Target/carrier等价、交付/清理证据、具体primary failure与执行次数；不得把Change收敛、研发修复、审查返工或formal Verification计入收尾。发现上游缺陷时本次Finish终止并返回Development。
- Task Finish preflight一次聚合低成本、无共享副作用检查；preflight和verify都不启动verification execution，也不读取Verification Result store。
- retained metadata-only handoff 的任务 path、验证 identity、目标 ref 或 Git provider readiness 任一不可证明时停止，不能把 dirty retained tree 伪装为 task environment。
- Archive 只移动已对齐 Change、Brief 和 sidecar；归档后不补写 glossary 或 current knowledge。
- 逻辑 Task/Change/run 可跨 Agent session 延续，但默认仍是同一用户对话和一个 Task Environment。普通 Rule/Skill 内容修改不要求新 session、reload、re-enter 或 activation evidence。只有任务本身修改 runtime 的发现、加载或激活机制，且专项验收明确要求证明该机制在真实 Agent host 生效时，才由 Task Verification 验证；P0.2 不内省 Agent host，也不保存 session adoption evidence。
