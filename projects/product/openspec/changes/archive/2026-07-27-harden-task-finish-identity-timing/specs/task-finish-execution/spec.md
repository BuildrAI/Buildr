## MODIFIED Requirements

### Requirement: Task Finish 必须只投射当前成功身份的 evidence 与 effect

Task Finish checkpoint、prepared completion receipt 与 final completion receipt MUST 只把步骤最后一次成功 completion identity 引用的 evidence 和 effect 作为当前有效结果。历史 evidence 与 effect MAY 保留用于审计，但步骤 stale、blocked、running 或其 input identity 已失效时 MUST NOT 出现在 `validEvidence`、`completedEffects` 或 completion receipt 的有效结果中。

#### Scenario: 候选身份变化使旧验证 evidence 失效

- **WHEN** 已通过 formal assurance 的 finish run 因 candidate、target、runtime 或 assurance identity 变化而失效该步骤
- **THEN** checkpoint 和 completion receipt MUST 不再投射旧 formal assurance evidence
- **AND** 重新验证通过后 MUST 只投射新 completion identity 引用的 evidence

#### Scenario: 重试历史不污染当前 completion

- **WHEN** 同一步存在早期 blocked 或 passed attempt，并由后续 attempt 成为最后一次成功 completion
- **THEN** 当前有效 evidence 与 effect MUST 只包含后续成功 completion 引用的记录
- **AND** 早期记录 MUST 仅通过历史 attempt 或 observation ledger 追溯

### Requirement: Task Finish 必须区分产品观测执行耗时与编排耗时

Task Finish MUST 使用产品写入且绑定 attempt token 的 command/stage observation 计算自动执行步骤的 provider execution duration，并 MUST 将 attempt wall-clock 中未被产品执行 observation 覆盖的部分报告为 orchestration duration。外部 provider 没有产品 observation 时 MUST 标记为 unobserved，MUST NOT 将 claim 到 complete 的间隔声称为真实 provider execution duration。

#### Scenario: 自动正式验证使用 observation 计时

- **WHEN** formal assurance 由安全 executor 执行并生成绑定当前 attempt 的 command/stage observations
- **THEN** attempt MUST 记录 `executionDurationMs`、`orchestrationDurationMs` 与产品 observation timing source
- **AND** `initialVerificationMs` 或 `reverificationMs` MUST 使用该 execution duration

#### Scenario: 外部正式验证使用可信 summary

- **WHEN** formal assurance 由 selected verification provider 在 Task Finish executor 外部完成
- **THEN** completion evidence MUST 携带 passed `buildr.verification-timing/v1` summary
- **AND** summary candidate fingerprint MUST 匹配当前 formal assurance input identity
- **AND** `initialVerificationMs` 或 `reverificationMs` MUST 使用 summary `totalDurationMs`，而非 claim 到 complete 的间隔
- **AND** summary `totalDurationMs` MUST 计入 provider execution、从 orchestration gap 扣除且 MUST NOT 出现在 unobserved intervals
- **AND** 缺少 summary 或身份不匹配时 completion MUST 被拒绝

#### Scenario: 外部正式验证失败只能完成 blocked attempt

- **WHEN** selected verification provider 产出绑定当前 candidate fingerprint 的 `failed` 或 `incomplete` `buildr.verification-timing/v1` summary
- **THEN** Task Finish MUST 只允许该 summary 完成 formal assurance 的 blocked attempt
- **AND** blocked attempt MUST 保持 repair decision required，MUST NOT 推进后续交付步骤
- **AND** passed completion MUST 只接受 status 为 `passed` 的可信 summary
- **AND** status 为 `passed` 的 summary MUST NOT 用于完成 blocked attempt

#### Scenario: 外部 provider 没有产品 observation

- **WHEN** Agent 手工 claim 并 complete 一个没有产品 command observation 的步骤
- **THEN** Task Finish MUST 保留 attempt wall-clock
- **AND** execution timing coverage MUST 将该区间报告为 external-unobserved
- **AND** MUST NOT 把该 wall-clock 归类为 product execution

### Requirement: 已解决诊断不得继续作为当前故障

Task Finish MUST 将 current diagnostic 与历史 diagnostic artifact 分离。后续成功执行已经解决相关失败时，compact 与 full checkpoint MUST 清除 current diagnostic；历史 observation ledger 和 diagnostic artifact MUST 保持可追溯。

#### Scenario: 同一步恢复成功清除诊断

- **WHEN** 自动执行失败写入 current diagnostic，随后该步骤以新有效身份成功完成
- **THEN** checkpoint `diagnostics` MUST 为 null
- **AND** 早期失败的 observation 与 diagnostic artifact MUST 仍保留在历史 ledger 中

#### Scenario: 下游成功推进覆盖已解决诊断

- **WHEN** recovery 已使产生诊断的旧步骤失效并重新通过，finish run 继续成功推进下游步骤
- **THEN** compact checkpoint MUST NOT 继续显示旧诊断为当前故障

### Requirement: Task Finish必须消费产品持有的convergence orchestrator

Task Finish MUST 通过唯一 product-executable action 调用 `buildr openspec converge`，并且只消费 `passed`、`blocked` 或 `recovery-unprovable`、单一 receipt identity、effects、duration 与 command count。Task Finish MUST NOT 理解或持久化 rehearsal、baseline、pre-sync、plan、apply、post-sync、canonical restore 或 recovery stages。

#### Scenario: Safe convergence一次推进

- **WHEN** planner、projected validation、conditional apply、confirmation 与 `archive --skip-specs` 均可安全完成
- **THEN** Task Finish executor MUST 在同一 convergence attempt 内调用一次产品 action 并接收 `passed`
- **AND** checkpoint MUST 记录最终 receipt identity 与聚合执行摘要

#### Scenario: Planner要求语义处理

- **WHEN** orchestrator 返回 `blocked`
- **THEN** run MUST 保持 contract-convergence blocked并指向Agent/用户处理最小语义冲突
- **AND** resume MUST 重新调用同一 product action而不得要求Agent拼装内部命令

#### Scenario: 恢复状态无法证明

- **WHEN** orchestrator 返回 `recovery-unprovable`
- **THEN** run MUST 停止尚未执行的正式验证、archive集成与push
- **AND** checkpoint MUST 保留实际文件摘要和人工检查下一动作

## ADDED Requirements

### Requirement: Task Finish 正式验证必须审计完整候选差异

Task Finish 的 selected verification provider MUST 相对声明的目标基线审计完整候选中的 OpenSpec canonical Requirement 差异，包括已提交、已暂存、未暂存和未跟踪内容。Provider MUST NOT 只比较 `HEAD` 与工作树，并 MUST 只接受当前候选携带且 canonical digest 匹配的受支持 convergence receipt。

#### Scenario: canonical 回退已进入候选提交

- **WHEN** rebase 冲突解决使 canonical Requirement 回退且该回退已提交到候选 `HEAD`
- **THEN** candidate audit MUST 通过目标基线与候选提交的差异发现该回退
- **AND** 缺少当前候选匹配的 convergence receipt 时 formal assurance MUST 失败

#### Scenario: 新收敛回执覆盖候选 canonical

- **WHEN** `buildr openspec converge` 产生 `buildr.openspec-convergence-receipt/v3` 且其 expected digest 匹配当前 canonical
- **THEN** candidate audit MUST 将该 capability 视为已由当前候选收敛
- **AND** receipt、archive path 或 digest 不匹配时 MUST fail closed
