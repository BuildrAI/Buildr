从明确的 Buildr workspace target 和 Project registry 解析 `<workspace>`、`<project>` 与 `<change>`，不得从 shell cwd 猜测 root。当 Change 有 delta specs 时，只把 `buildr openspec converge <change> --project <project> --target <workspace> --json` 提交给 finish executor。

产品内部持有 pure plan、projected `validate --all --strict`、delta/executable/canonical before 条件重验、完整批次准备、原子替换、写后 digest/strict confirmation 与 `archive --skip-specs`。正常路径只写一个 convergence receipt；命令返回每次 execution 的 timing 与 command count，但不把内部步骤持久化为恢复 stage。

对外结果固定为 `passed|blocked|recovery-unprovable`。Agent 只处理 `blocked` 的语义冲突或 `recovery-unprovable` 的人工事实核对；后者使用只读 `buildr openspec audit` 查看逐文件摘要。不得恢复 canonical、刷新 baseline、重建 pre-sync、用普通 resume 覆盖产品阻塞，或删除 sidecar 来掩盖未知状态。
