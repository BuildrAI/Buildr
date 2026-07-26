## Buildr OpenSpec Sidebar

应用 change 前先向用户说明正在使用 OpenSpec、`apply` action、change id 及其选择或推断来源。OpenSpec status 解析上下文后，在编辑前报告实际 `changeRoot`；采用 task worktree 时同时报告 canonical 路径与分支。

采用 task environment 时，编辑前必须用 receipt-bound CLI 对明确 target/workdir 运行 `worktree context`，确认 membership、allowed roots、CLI source/identity、runtime projection identity 与 receipt 匹配且 `executionReady: true`。普通 Rule/Skill 内容修改不要求 session activation；只有本任务修改 runtime 的发现、加载或激活机制，且专项验收明确要求真实 Agent host activation proof 时才验证。

实现 active change 时只编辑 change artifacts 与实现内容。不得在当前会话的 `pre-sync` contract guard 成功前，把该 change 的 delta 预写入 canonical specs；canonical sync 只能在 Task Finish 的 pre-sync 成功后执行，并且必须在 archive 前通过 post-sync guard。不得通过 baseline adopt、重跑 pre-sync 或 `--skip-specs` 掩盖这两个门禁失败。

当未完成的最后一项是“运行完整 Candidate”时，先保持该任务为 `- [ ]`，对当前 implementation identity 运行 Candidate 并捕获可信 evidence。Candidate 成功后立即只把这一项由 `- [ ]` 改为 `- [x]`，同时记录 source/target identity、change/task identity 和精确 old/new marker；确认 `git diff` 中没有任务文本、顺序、其他 checkbox、其他文件或实现内容变化。

只有上述动作在当前会话中完整可观测、source identity 与刚成功的 Candidate evidence 一致，且该 checkbox 是唯一变化时，才把它交给 Task Finish 作为 `closeout-metadata-only` / `verification-result-metadata-only` transition。任何额外变化、多个候选任务、证据丢失或重新进入会话，都不得仅凭最终 `tasks.md` 状态推断可复用性，按 implementation change 重新验证。原 Candidate evidence 仍只证明 source implementation identity，不得表述为直接覆盖 target delivery tree。

实现期间读取 required `buildr.current-knowledge-maintenance/v1` binding、contract 和 selected provider，执行 tasks 中的 Brief/current knowledge/terminology impacts；发现新的长期事实影响时同步更新 tasks 与 `.buildr/knowledge-impact.yml`。Implementation content 完成后、任何最终 verification 前执行 `reconcile`；结果 unresolved 时停止，结果 updated 时以更新后的 delivery tree 建立验证 evidence。
