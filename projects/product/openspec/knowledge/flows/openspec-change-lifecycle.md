# OpenSpec Change 生命周期

## 当前流程

1. `task-triage` 先核对 authority 与 repository set，再分别判断语义治理、implementation/metadata-only 形态和任务跟踪；实现型工作先通过 selected task-worktree provider 建立 canonical task environment。原用户对话可以从 canonical Workspace 启动，并用明确 target/workdir 和 receipt-bound CLI 操作 task environment；自举 workspace 绑定 environment-local 产品 CLI，普通消费 workspace 可以绑定 external-product CLI。`executionReady` 由 environment receipt、repository membership/identity、allowed roots、CLI source/identity 与 runtime projection identity 决定，不要求 session root 等于 environment root。
2. `openspec-propose` 使用 OpenSpec 1.6.0 创建 proposal、design、delta specs 和 tasks；Buildr contribution 创建 Brief、执行 current knowledge `assess`，并建立 contract baseline/proposal check。
3. `openspec-update-change` 修订 planning artifacts 时同步刷新 Brief 与 impacts。
4. `openspec-apply-change` 实现 tasks；发现的新知识影响写回 tasks/sidecar，implementation content 完成后在最终验证前 `reconcile`。
5. `task-finish` 创建独立持久化 run，通过 `inspect|advance|resume|run` 推进 context、current knowledge、contract/canonical、candidate commit、target 与 runtime convergence；每步保存 fingerprint、effects、evidence、失效依赖和 retry policy。OpenSpec convergence 由产品入口在同一 attempt 内推进 rehearsal、pre-sync、deterministic plan/apply、strict 与 post-sync；只有结构、baseline 和 identity 能证明唯一结果时自动写入，歧义整批零写入并返回 Agent fallback。默认 CLI 只返回 compact checkpoint delta，超预算完整历史写入 run-owned diagnostics 引用。
6. `task-verification` 对收敛后的 implementation identity 运行 required assurance；普通任务为 affected，高风险、发布或显式完整验证为 Candidate。provider 在同一 execute 内并行调度无依赖 required capabilities并持有真实 wall-clock，最终树变化只使该步及下游 stale。
7. Final assurance 后推进 asset review、archive、integration/push、runtime install 与 cleanup。integration evidence 区分 push 前后 expected/observed ref；自身成功推进或远端已等于 candidate 不属于 `target-race`。blocked 后只恢复真实失效的下游，running step失效时原子终结 attempt并释放自己的 lease。
8. Cleanup 先在 environment 内 prepare并把 completion receipt写入 canonical Workspace，实际删除task-owned process、worktree和branch后再由retained checkout finalize；prepare不得冒充run complete。push已成功而cleanup失败时不得重复push或验证。
9. 多个 finish run 独立并发，不使用 Workspace 全局锁；target branch、canonical checkout、runtime sync 和默认安装使用短 lease。complete run不得残留running attempt、task-owned lease或未处理stale/blocked step。

没有 Change 的独立当前事实收敛不进入上述生命周期：`task-triage` 选择 `spec-maintenance + metadata-only`，由 selected `buildr.current-knowledge-maintenance/v2` provider 执行 `maintain`。它只让 current knowledge 追上已由 canonical specs、实现、registries 或已确认决定证明的既有事实；authority 冲突返回 `unresolved`，发现新业务语义返回 `change-required` 并重新进入 Change lifecycle。

## 失败与停止

- Required capability blocked、术语 unresolved、Brief/current knowledge 冲突或 evidence identity 陈旧时停止后续 workflow。
- Task environment receipt、repository membership/identity、allowed execution root、明确 target/workdir、receipt-bound CLI 或 runtime projection identity 不匹配时停止 proposal/apply/verification。
- Reconcile 或 fallback 修订 delivery content 后，旧验证 evidence 失效。
- Archive rehearsal 在隔离 planning copy 中检查 scenario identity、delta merge 与 archive mechanics；相对或不可执行的 OpenSpec 路径在复制前失败，不修改真实 canonical specs，也不替代 pre-sync/post-sync 或 active/archive 应用层测试。
- 收尾报告分别呈现命令执行、provider/Agent编排、正式验证wall-clock、convergence workflow checks、blocked recovery、可归因重试成本和端到端耗时；不得把guard、doctor、Git或rehearsal计入task-verification时间，也不得用调用方手写duration替代provider计时。
- 多次正式验证必须保留独立 run evidence、失效原因、替代关系和累计耗时；不得只报告最后一次成功。
- Archive 只移动已对齐 Change、Brief 和 sidecar；归档后不补写 glossary 或 current knowledge。
- 逻辑 task/change/run 可跨 Agent session 延续，但默认仍是同一用户对话和一个 task environment。普通 Rule/Skill 内容修改不要求新 session、reload、re-enter 或 activation evidence；发布时资产已投射到 Agent runtime，不存在开发 checkout 源资产与既有 session 加载快照的差异。只有任务本身修改 runtime 的发现、加载或激活机制，且专项验收明确要求证明该机制在真实 Agent host 生效时，才验证 reload/session activation。Buildr 当前不内省或自动 handoff Agent host，无法取得的 activation evidence 应如实报告，且不得伪造 Codex-managed 与 Buildr worktree adoption evidence。
