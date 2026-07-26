# OpenSpec Change 生命周期

## 当前流程

1. `task-triage` 先核对 authority 与 repository set，再分别判断语义治理、implementation/metadata-only 形态和任务跟踪；实现型工作先通过 selected task-worktree provider 建立 canonical task environment，再由以 environment root 启动或重新进入的 Agent session 完成 runtime adoption。只有携带当前 host-visible session root/handle 的 context 返回 `executionReady: true` 后才能写 proposal 或实现；只切换工具 `cwd` 不构成 adoption。
2. `openspec-propose` 使用 OpenSpec 1.6.0 创建 proposal、design、delta specs 和 tasks；Buildr contribution 创建 Brief、执行 current knowledge `assess`，并建立 contract baseline/proposal check。
3. `openspec-update-change` 修订 planning artifacts 时同步刷新 Brief 与 impacts。
4. `openspec-apply-change` 实现 tasks；发现的新知识影响写回 tasks/sidecar，implementation content 完成后在最终验证前 `reconcile`。
5. `task-finish` 先执行 delivery convergence：current knowledge inspect/reconcile、受管资产检查、使用已解析绝对 OpenSpec executable 的隔离 archive rehearsal、pre-sync、canonical sync、post-sync、candidate commit、目标分支 fetch/rebase，以及 rebase 后 doctor/runtime sync。成功且仍匹配当前 delta/canonical facts 的 pre-sync receipt 是 canonical sync 的唯一授权。
6. `task-verification` 对已经收敛并冻结的 implementation identity 运行 required assurance；普通任务为 affected，高风险、发布或显式完整验证为 Candidate。
7. Final assurance 后只执行可证明的 closeout-only delivery：最终任务 checkbox、已预演的 `archive --skip-specs`、归档 focused checks、candidate commit amend、目标分支 fast-forward/push 和安全 cleanup。
8. 集成前重新观察目标 ref；目标分支在 final assurance 后前进时，以 `target-race` 返回 convergence，rebase 后对新 identity 重跑相同 required assurance。

没有 Change 的独立当前事实收敛不进入上述生命周期：`task-triage` 选择 `spec-maintenance + metadata-only`，由 selected `buildr.current-knowledge-maintenance/v2` provider 执行 `maintain`。它只让 current knowledge 追上已由 canonical specs、实现、registries 或已确认决定证明的既有事实；authority 冲突返回 `unresolved`，发现新业务语义返回 `change-required` 并重新进入 Change lifecycle。

## 失败与停止

- Required capability blocked、术语 unresolved、Brief/current knowledge 冲突或 evidence identity 陈旧时停止后续 workflow。
- Task environment、checkout-local runtime projection、adoption receipt 或当前 session evidence 不匹配时停止 proposal/apply/verification；Buildr 只直接核验 environment evidence，session evidence 保持 `agent-attested`。
- Reconcile 或 fallback 修订 delivery content 后，旧验证 evidence 失效。
- Archive rehearsal 在隔离 planning copy 中检查 scenario identity、delta merge 与 archive mechanics；相对或不可执行的 OpenSpec 路径在复制前失败，不修改真实 canonical specs，也不替代 pre-sync/post-sync 或 active/archive 应用层测试。
- 收尾报告分别呈现正式验证 wall-clock、convergence workflow checks 与可归因重试成本；不得把 guard、doctor、Git 或 rehearsal 计入 task-verification 时间。
- 多次正式验证必须保留独立 run evidence、失效原因、替代关系和累计耗时；不得只报告最后一次成功。
- Archive 只移动已对齐 Change、Brief 和 sidecar；归档后不补写 glossary 或 current knowledge。
