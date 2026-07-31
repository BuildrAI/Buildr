## Context

Task Finish 已能通过 action registry 自动执行确定性动作，但 finish run 仍把调用者提交的 fingerprint 当作完成身份，把 claim 到 complete 的间隔当作 provider 执行耗时。真实收尾中因此出现了两个偏差：候选提交变化后旧 evidence 仍可能进入 completion receipt；formal assurance 实际执行约 54 秒，但 receipt 只记录约 12 秒。自动执行失败留下的 compact diagnostic 还可能在后续成功恢复后继续显示为当前故障。

本 Change 只修正 finish run 的身份、有效证据和计时事实。Provider 连续执行、detached process 生命周期和更紧凑的输出属于后续批次。

术语沿用既有 `inputFingerprint`、`observationLedger`、`evidence`、`attempt` 和 `diagnostic`，不引入新的产品领域术语。

## Goals / Non-Goals

**Goals:**

- 让通过步骤的 evidence/effect 与该步骤最后一次成功 completion identity 绑定，身份失效后不再对外暴露旧记录。
- 让自动执行步骤以产品 observation ledger 的命令执行区间作为 provider execution timing，而非 claim/complete 编排间隔。
- 让 formal assurance 的阶段耗时优先采用受信任的产品执行 observation，并显式区分执行、编排和未观测区间。
- 在恢复后的当前步骤成功时清除已解决的 current diagnostic，同时保留历史 observation 和 diagnostic artifact。
- 通过 completion receipt 与 checkpoint 回归测试证明上述事实不会再次漂移。
- 让 OpenSpec candidate audit 相对目标基线观察完整候选，而不是只观察 `HEAD` 之后的工作树变化。

**Non-Goals:**

- 不在本 Change 中让 agent provider 自动完成 claim、execute、complete 全链路。
- 不处理 detached descendants、Local App 清理或 selector 扩展。
- 不改变正式验证命令、Candidate 预算或 OpenSpec convergence 正常路径语义；仅收紧可证明旧 sidecar 的兼容迁移。
- 不宣称调用者任意提交的 fingerprint 本身是产品观测事实。

## Decisions

### 1. 有效 evidence/effect 只来自最后一次成功 completion

`lastCompletion` 继续记录 attempt token、input fingerprint 和本次提交的 evidence/effect id。Checkpoint、prepared receipt 与 final receipt 只投射 `status=passed` 且 id 属于 `lastCompletion` 的记录。步骤被 invalidate 后，即使历史数组仍保留用于审计，也不会出现在 current valid evidence 中。

这样保留可追溯历史，同时避免破坏性删除历史记录。

### 2. 产品 observation 是自动执行耗时的权威来源

安全 executor 已经为每条命令写入带 `attemptToken`、`startedAt`、`finishedAt`、`durationMs` 的 observation ledger。完成 attempt 时，Buildr 按该 token 汇总 observation：

- `executionDurationMs`：命令 observation 的总耗时；
- `orchestrationDurationMs`：attempt wall-clock 减 execution duration；
- `timingSource=product-observation`。

formal assurance 的外部 provider completion 必须携带 `buildr.verification-timing/v1` summary，且 status、candidate fingerprint、duration 与 summary identity 通过核验后才可完成；其 `totalDurationMs` 作为 provider execution duration，从 orchestration gap 中扣除且不进入 unobserved intervals。其他没有产品 observation 的手工 provider completion 保持 `external-unobserved`，不得把 claim/complete 间隔伪装成真实执行耗时。

summary status 与 completion outcome 必须一致：`passed` completion 只接受 `passed` summary；`blocked` completion 只接受 `failed` 或 `incomplete` summary。非通过 summary 只负责诚实终结本次 blocked attempt 并记录真实验证耗时，不能推进交付，repair decision 仍保持 required；反向也禁止用 passed summary 伪造 blocked completion。

### 3. 阶段计时消费有效成功 attempt 的 execution duration

`initialVerificationMs` 与 `reverificationMs` 优先读取 formal-assurance attempt 的 `executionDurationMs`；只有旧 run 缺少新字段时才兼容读取 `durationMs`，并通过 coverage 暴露这是 legacy/unobserved 数据。总 wall clock、product execution、orchestration gap 保持分别报告。

### 4. 当前诊断与历史诊断分离

`lastDiagnostic` 表示仍需处理的当前故障，不是历史日志索引。任何步骤成功完成后，只要当前诊断属于该步骤或已被本次向前推进覆盖，就清空 `lastDiagnostic`。完整输出仍保存在 observation ledger 引用的 diagnostic artifact 中。

### 5. Candidate audit 使用目标基线与当前收敛回执

OpenSpec candidate audit 使用 verification provider 已解析的 Git base 比较 `base...HEAD`，并叠加 staged、unstaged 与 untracked paths。`test:changed` 将已解析 base 显式传给子检查，独立 Candidate 入口继续按项目 Git policy 解析 base。

canonical Requirement 有差异时，审计同时支持历史 `contract-pre-sync-receipt` 与当前 `buildr.openspec-convergence-receipt/v3`；只有 receipt 本身属于当前候选、archive/change path 匹配且 expected digest 等于真实 canonical 时才接受。这样 committed rebase regression 不会因工作树干净而漏检。

本 Change 早期已由旧 post-sync 将三个新增 Requirement 写入 canonical；恢复期间 delta 因此以 `MODIFIED` 表达当前文件事实，并由单一 convergence transaction 生成最终 v3 receipt。rebase 冲突涉及的 convergence Requirement 只恢复 `dev` 已有单事务语义，不引入新的 convergence 行为。

恢复真实历史 sidecar 时，旧 v2 receipt 可能只在 `sync-plan` 与 `sync-apply` transitions 保存 `planIdentity`，且后续 Change 修订或目标基线收敛可能已经产生新的当前 delta 与 canonical 追加内容。迁移器先要求旧 receipt 与 deterministic plan 的 delta identity 彼此一致，再要求同步 transition 给出唯一且与 plan 自校验 identity 完全一致的值；据此构造绑定旧 delta 的 v3 receipt 并观察 canonical。canonical 等于旧 before/expected 时沿用普通观察；若当前 delta 已变化，只有每个真实 canonical 都逐字包含旧 expected 作为完整前缀、其追加内容从新 Requirement 开始且 projected strict validation 通过时，orchestrator 才丢弃旧 receipt 并按当前事实重新规划。旧 delta 证明链缺失、transition identity 歧义/不匹配、旧 expected 内容改写、非 append-only 差异或 canonical 混合时仍返回 `recovery-unprovable`，不覆盖 canonical。

## Risks / Trade-offs

- 历史 run 没有 `executionDurationMs`；读取路径必须兼容旧 schema，并将覆盖率标为 legacy 或 external-unobserved。
- 并行 stage 的 command duration 求和可能大于 wall-clock。阶段执行耗时采用各 stage wall-clock 求和；非 stage observation 才按命令区间求和，避免并行重复计时。
- 只过滤对外投射而保留历史数组会增加少量 receipt 前的内存遍历，但数据规模很小，换来完整审计链。
- 本 Change 不解决外部 provider 的真实执行观测；它会诚实标为未观测，连续 provider executor 留给下一轮实现。
