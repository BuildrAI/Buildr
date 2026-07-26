# OpenSpec Change 生命周期

## 当前流程

1. `task-triage` 先核对 authority 与 repository set，再分别判断语义治理、implementation/metadata-only 形态和任务跟踪；实现型工作先通过 selected task-worktree provider 建立 canonical task environment。原用户对话可以从 canonical Workspace 启动，并用明确 target/workdir 和 checkout-local CLI 操作 task environment；`executionReady` 由 environment receipt、repository membership/identity、allowed roots 与 runtime projection identity 决定，不要求 session root 等于 environment root。
2. `openspec-propose` 使用 OpenSpec 1.6.0 创建 proposal、design、delta specs 和 tasks；Buildr contribution 创建 Brief、执行 current knowledge `assess`，并建立 contract baseline/proposal check。
3. `openspec-update-change` 修订 planning artifacts 时同步刷新 Brief 与 impacts。
4. `openspec-apply-change` 实现 tasks；发现的新知识影响写回 tasks/sidecar，implementation content 完成后在最终验证前 `reconcile`。
5. `task-finish` 创建独立持久化 run，通过 `inspect|advance|resume` 推进 context、current knowledge、contract/canonical、candidate commit、target 与 runtime convergence；每步保存 fingerprint、effects、evidence、失效依赖和 retry policy。
6. `task-verification` 对收敛后的 implementation identity 运行 required assurance；普通任务为 affected，高风险、发布或显式完整验证为 Candidate。最终树变化只使该步及下游 stale。
7. Final assurance 后推进 asset review、archive、integration/push、runtime install 与 cleanup。blocked 后只恢复 blocked/stale 下游；push 已成功而 cleanup 失败时不得重复 push 或验证。
8. 多个 finish run 独立并发，不使用 Workspace 全局锁；target branch、canonical checkout、runtime sync 和默认安装使用短 lease。集成前乐观比较目标 ref，竞态以 `target-race` 返回 convergence。

没有 Change 的独立当前事实收敛不进入上述生命周期：`task-triage` 选择 `spec-maintenance + metadata-only`，由 selected `buildr.current-knowledge-maintenance/v2` provider 执行 `maintain`。它只让 current knowledge 追上已由 canonical specs、实现、registries 或已确认决定证明的既有事实；authority 冲突返回 `unresolved`，发现新业务语义返回 `change-required` 并重新进入 Change lifecycle。

## 失败与停止

- Required capability blocked、术语 unresolved、Brief/current knowledge 冲突或 evidence identity 陈旧时停止后续 workflow。
- Task environment receipt、repository membership/identity、allowed execution root、明确 target/workdir、checkout-local CLI 或 runtime projection identity 不匹配时停止 proposal/apply/verification。
- Reconcile 或 fallback 修订 delivery content 后，旧验证 evidence 失效。
- Archive rehearsal 在隔离 planning copy 中检查 scenario identity、delta merge 与 archive mechanics；相对或不可执行的 OpenSpec 路径在复制前失败，不修改真实 canonical specs，也不替代 pre-sync/post-sync 或 active/archive 应用层测试。
- 收尾报告分别呈现正式验证 wall-clock、convergence workflow checks 与可归因重试成本；不得把 guard、doctor、Git 或 rehearsal 计入 task-verification 时间。
- 多次正式验证必须保留独立 run evidence、失效原因、替代关系和累计耗时；不得只报告最后一次成功。
- Archive 只移动已对齐 Change、Brief 和 sidecar；归档后不补写 glossary 或 current knowledge。
- 逻辑 task/change/run 可跨 Agent session 延续，但默认仍是同一用户对话和一个 task environment。只有 Rules、Skills/runtime adapter 变化且验收明确要求 activation proof 时才验证 reload/session activation；Buildr 当前不内省或自动 handoff Agent host，无法取得的 activation evidence 应如实报告，且不得伪造 Codex-managed 与 Buildr worktree adoption evidence。
