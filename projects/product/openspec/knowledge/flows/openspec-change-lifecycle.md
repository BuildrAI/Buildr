# OpenSpec Change 生命周期

## 当前流程

1. `task-triage` 先核对 authority 与 repository set，再分别判断语义治理、implementation/metadata-only 形态和任务跟踪；实现型工作先通过 selected task-worktree provider 建立 canonical task environment。原用户对话可以从 canonical Workspace 启动，并使用 context 返回的明确 target/workdir 与结构化 `cliInvocation` 操作 task environment；自举 workspace 绑定 task checkout 内已有 bridge，普通消费 workspace 绑定外部产品 Node/entry，不根据 cwd 或固定产品目录拼路径。`executionReady` 由 environment receipt、repository membership/identity、allowed roots、CLI source/identity/invocation 与 runtime projection identity 决定，不要求 session root 等于 environment root。
2. `openspec-propose` 使用 OpenSpec 1.6.0 创建 proposal、design、delta specs 和 tasks；Buildr contribution 创建 Brief、执行 current knowledge `assess`，并运行 proposal contract check。历史 change 的 contract baseline 只作兼容诊断，不再是确定性收敛授权。
3. `openspec-update-change` 修订 planning artifacts 时同步刷新 Brief 与 impacts。
4. `openspec-apply-change` 实现 tasks；发现的新知识影响写回 tasks/sidecar，implementation content 完成后在最终验证前 `reconcile`。
5. `task-finish` 创建独立持久化 run，通过 `actions|inspect|advance|resume|run|recover` 推进 context、current knowledge、contract/canonical、candidate commit、target 与 runtime convergence；每步保存 fingerprint、effects、evidence、失效依赖和 retry policy。`actions`只读查询版本化action registry及当前resolution；`run`优先执行registry生成的确定性计划，标准语义步骤按登记的provider handoff推进，只有未覆盖、歧义或登记外分支才交给Agent推理。OpenSpec convergence 只调用一次 `buildr openspec converge`：产品内部完成确定性规划、隔离 `validate --all --strict`、输入重验、条件式替换、写后确认和 `archive --skip-specs`。唯一 receipt 保存 portable executable identity 与每个 canonical 文件的 before/expected 内容及 digest；恢复只观察真实文件，返回 `passed|blocked|recovery-unprovable`，不恢复 canonical、不刷新 baseline、不推断 pre/post stage。默认 CLI 只返回含failure-first结构化child diagnostic的compact checkpoint，完整输出由digest绑定的run-owned引用承载。
6. `task-verification` 对收敛后的 implementation identity 运行 required assurance；普通任务为 affected，高风险、发布或显式完整验证为 Candidate。Product Candidate 还以 required step 执行双任务并发组合验收，在同一临时 Workspace 贯穿两个任务的 CLI invocation、Local App 预览、共享资源协调、目标竞态和归属清理，不能由单项测试结果推断通过。provider 在同一 execute 内并行调度无依赖 required capabilities并持有真实 wall-clock；声明 `resourceClaims` 时，按 isolated/namespaced/coordinated/external 策略准备资源，跨任务容量由 Workspace 共享 slot lease 协调，资源等待、owner、恢复和释放独立进入 evidence。最终树变化只使该步及下游 stale。
7. Final assurance 后推进 asset review、integration/push、runtime install 与 cleanup；OpenSpec archive 已属于前面的 convergence 事务。integration evidence 区分 push 前后 expected/observed ref；自身成功推进或远端已等于 candidate 不属于 `target-race`。blocked 后只恢复真实失效的下游，running step失效时原子终结 attempt并释放自己的 lease。
8. integration-push 后执行 retained-convergence：消费 retained Workspace root、retained 绝对 CLI、Agent 与完整 changed paths，始终运行最终 doctor，只在 runtime 资产受影响时 sync；CLI/Local App impact 才进入入口安装 handoff，不重复 Candidate。随后 Cleanup 在 environment 内 prepare并把 completion receipt写入 canonical Workspace，实际删除task-owned process、worktree和branch后再由retained checkout finalize；prepare不得冒充run complete。push已成功而 retained convergence 或 cleanup 失败时不得重复push或验证。
9. 多个 finish run 独立并发，不使用 Workspace 全局锁；target branch、canonical checkout、runtime sync 和默认安装使用短 lease。complete run不得残留running attempt、task-owned lease或未处理stale/blocked step。

没有 Change 的独立当前事实收敛不进入上述生命周期：`task-triage` 选择 `spec-maintenance + metadata-only`，由 selected `buildr.current-knowledge-maintenance/v2` provider 执行 `maintain`。它只让 current knowledge 追上已由 canonical specs、实现、registries 或已确认决定证明的既有事实；authority 冲突返回 `unresolved`，发现新业务语义返回 `change-required` 并重新进入 Change lifecycle。

## 失败与停止

- Required capability blocked、术语 unresolved、Brief/current knowledge 冲突或 evidence identity 陈旧时停止后续 workflow。
- Task environment receipt、repository membership/identity、allowed execution root、明确 target/workdir、receipt-bound CLI 或 runtime projection identity 不匹配时停止 proposal/apply/verification。
- Reconcile 或 fallback 修订 delivery content 后，旧验证 evidence 失效。
- Projected validation 在 task-owned 临时 Project 中投射完整 expected canonical tree，并使用 receipt 绑定的 OpenSpec executable 运行 strict validation；失败时正式文件零写入。写入前任一 delta、canonical before 或 executable identity 漂移都会重新规划，混合或未知文件状态关闭式失败。
- 收尾报告分别呈现initial verification、repair、re-verification、最后有效assurance通过后的closeout-only、命令执行、provider/Agent编排、convergence workflow checks、blocked recovery、可归因重试成本和端到端耗时；observation ledger只计Buildr-owned invocation与原始output bytes，并以`product-complete|product-partial|external-unobserved`声明coverage和checkpoint间不可观察区间，不统计Agent token。不得把测试或返工统称为收尾，不得把guard、doctor、Git或rehearsal计入task-verification时间，也不得用调用方手写duration替代provider计时。affected/Candidate开始前可执行registry声明的候选感知、低成本、无共享副作用preflight；preflight失败时完整正式保证不启动，preflight成功也不替代正式保证。
- 多次正式验证必须保留独立 run evidence、失效原因、替代关系和累计耗时；不得只报告最后一次成功。
- Archive 只移动已对齐 Change、Brief 和 sidecar；归档后不补写 glossary 或 current knowledge。
- 逻辑 task/change/run 可跨 Agent session 延续，但默认仍是同一用户对话和一个 task environment。普通 Rule/Skill 内容修改不要求新 session、reload、re-enter 或 activation evidence；发布时资产已投射到 Agent runtime，不存在开发 checkout 源资产与既有 session 加载快照的差异。只有任务本身修改 runtime 的发现、加载或激活机制，且专项验收明确要求证明该机制在真实 Agent host 生效时，才验证 reload/session activation。Buildr 当前不内省或自动 handoff Agent host，无法取得的 activation evidence 应如实报告，且不得伪造 Codex-managed 与 Buildr worktree adoption evidence。
