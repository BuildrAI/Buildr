在任何 canonical spec sync 前，从明确的 Buildr workspace target 和 Project registry 解析 `<workspace>`、`<project>` 与 `<change>`，不得从 shell cwd 猜测 root。当 Change 有 delta specs 时，把 `buildr openspec converge <change> --project <project> --target <workspace> --json` 作为单一产品 handler 提交给 finish executor。产品必须持有 archive rehearsal、pre-sync guard、deterministic plan/apply、strict validation 与 post-sync guard，并记录每阶段 timing、identity 和恢复边界。

其中 pre-sync 阶段等价执行 `buildr openspec check <change> --stage pre-sync --project <project> --target <workspace> --json`，但由 orchestrator 持有调用和 receipt，不要求 Agent 单独编排。

只有 planner 返回全批 `safe|already-applied` 且 receipt identity 未变化时才能自动 apply；`semantic-resolution-required`、receipt stale、guard failure 或顺序不匹配时，停止后续动作并把最小上下文交给 Agent。Agent fallback 不得刷新事后 baseline；修复后从真实 checkpoint 恢复并重新经过 strict 与 post-sync。
