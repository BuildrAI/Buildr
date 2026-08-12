## ADDED Requirements

### Requirement: Task Finish 必须在正式保证失败后等待 repair 决策
当正式保证发现实现、契约、测试或历史资产缺陷时，Task Finish MUST 将 run 保持为 blocked 并返回结构化 repair decision；没有绑定当前 task/change、失败 identity 与允许 scope 的明确用户授权时，Task Finish 和 Agent MUST NOT 修改 delivery tree、自动修复缺陷或继续归档、集成、推送与清理。

#### Scenario: 未预授权的正式保证失败
- **WHEN** 用户只授权“收尾”，正式保证对当前 candidate 返回失败
- **THEN** run MUST 停在 formal assurance boundary并报告缺陷、影响、建议修复范围与重新验证成本
- **AND** delivery tree MUST保持不变，后续closeout步骤MUST NOT启动

#### Scenario: 用户授权修复并继续
- **WHEN** 用户在失败前或失败后明确授权当前scope内“修复并继续”
- **THEN** Task Finish MUST记录versioned repair authorization与repair candidate transition
- **AND** 修复后MUST使旧formal evidence失效并执行re-verification
- **AND** 语义冲突、跨任务历史资产修改或授权范围扩大时MUST再次停止请求决定

### Requirement: Task Finish 必须区分 workflow 与 closeout-only timing
Canonical completion receipt MUST保留端到端workflow wall-clock，并 MUST独立记录首次verification、repair、re-verification和closeout-only阶段；closeout-only MUST从最后一个有效正式保证通过后开始，到cleanup complete结束，不得包含验证执行、缺陷诊断、实现修复或重新验证。

#### Scenario: 无缺陷的正常收尾
- **WHEN** 首次正式保证通过并完成资产审查、归档、集成推送、runtime install与cleanup
- **THEN** receipt MUST分别报告verificationMs、closeoutMs与endToEndWallClockMs
- **AND** 不可观察间隔MUST按coverage报告，不得推断为产品执行或token消耗

#### Scenario: 验证失败后修复完成
- **WHEN** 同一finish run包含formal failure、已授权repair、candidate transition和re-verification
- **THEN** receipt MUST分别报告verificationMs、repairMs、reverificationMs、closeoutMs与attributableWasteMs
- **AND** 用户摘要MUST将该过程表述为“验收—修复—重新验收—收尾”，不得把全部wall-clock称为纯收尾耗时

### Requirement: Task Finish compact diagnostic 必须优先暴露真实失败
当Buildr-owned child command以非零状态结束时，compact diagnostic MUST优先返回可解析的failed stage、failed check/test、exit code、bounded findings和repair decision，再附加非阻塞warning；无法结构化解析时 MUST保留digest绑定的完整diagnostic并明确解析缺口，不得仅用warning解释失败。

#### Scenario: 测试失败同时产生预算warning
- **WHEN** formal verification输出一个contract test failure和多个非阻塞budget warnings
- **THEN** compact result的primaryFailure MUST指向contract test failure
- **AND** warnings MUST作为次级字段保留，不得取代failure reason

#### Scenario: 大输出无法完全解析
- **WHEN** child output超过compact上限且没有登记的结构化summary
- **THEN** compact result MUST返回exit code、可确定stage、bounded failure excerpt和diagnostic path/digest
- **AND** MUST标记`structured: false`与明确next action
