## ADDED Requirements

### Requirement: 零差异 Delivery Adaptation 必须由 Agent 显式确认并复用同一 run
当 Task Contribution 不能机械应用到最新 Delivery Baseline，但 Agent 审查确认最新 target 已满足冻结任务语义且无需新增文件差异时，Task Finish MUST 只在 matching blocked run、current exact resume token 与显式零差异确认同时存在时采用零差异 Delivery Adaptation。采用前 MUST 核验 current Development handoff、Candidate/generation、Content Target、Task Contribution source、Delivery Baseline、carrier ownership 与 cleanliness；Result MUST 标记 `agent-reviewed-delivery-adaptation`，不得声称 Buildr 已证明语义等价。

#### Scenario: 显式采用 clean 的零差异 carrier
- **WHEN** current run 因 Delivery Adaptation blocked，调用方提供 matching resume token 与显式零差异确认，且 run-owned carrier 的 HEAD/tree 等于冻结 Delivery Baseline并保持clean
- **THEN** Task Finish MUST采用零 delta identity，不创建 carrier commit、不修改原 Task worktree且不重跑正式 Verification
- **AND** MUST记录 Agent-reviewed zero-delta evidence并继续同一run

#### Scenario: 未显式确认零差异
- **WHEN** adaptation-required carrier 相对 Delivery Baseline 没有 tree delta，但调用方未提供显式零差异确认
- **THEN** Task Finish MUST保持`task-finish.delivery-adaptation-missing`或等价的当前blocked诊断
- **AND** MUST NOT把普通resume或未修改carrier解释为Agent审查结论

#### Scenario: 零差异确认不适用于当前run
- **WHEN** 显式零差异确认用于新run、非prepare adaptation状态、错误token、漂移baseline、dirty carrier或不匹配identity
- **THEN** Task Finish MUST在交付副作用前fail closed并返回canonical诊断
- **AND** MUST NOT写入Agent-reviewed carrier facts、远端ref或Task终态

#### Scenario: 既有 adaptation-required v2 run 原地恢复
- **WHEN** 既有blocked run已保存current Task Contribution trees、Delivery Baseline、run-owned carrier与matching token
- **THEN** 新实现 MUST从这些既有authority派生零差异adoption所需事实并恢复同一run
- **AND** MUST NOT要求迁移SQLite、重建Candidate、重跑Verification或创建新Finish run

### Requirement: 零差异适配必须保留冻结 Task Contribution 的 activation 影响面
Task Finish MUST分别表达 carrier 相对 Delivery Baseline 的实际delta paths与冻结Task Contribution的activation paths。零差异carrier的实际delta paths MUST保持为空；activation paths MUST从冻结original baseline tree与source tree的规范化`--no-renames`差异派生，并供retained activation和self-bootstrap消费。

#### Scenario: 零差异 carrier 命中 runtime 与自举路径
- **WHEN** 零差异适配的冻结 Task Contribution包含Workspace runtime、Buildr CLI、package或Buildr Web Launcher路径
- **THEN** carrier实际`changedPaths` MUST保持为空，而additive activation paths MUST包含规范化原贡献路径
- **AND** retained activation与self-bootstrap MUST按activation paths执行适用动作，不得因carrier delta为空而返回错误的not-applicable

#### Scenario: 旧 Result 没有 activation paths
- **WHEN** consumer读取没有additive activation paths的既有非零carrier Result
- **THEN** consumer MUST回退使用既有`changedPaths`
- **AND** MUST保持旧deterministic与agent-reviewed非零适配行为不变

### Requirement: 稳定的零差异适配必须以 already-contained 完成交付
verify已采用零差异Delivery Adaptation且远端target仍等于冻结Delivery Baseline/carrier HEAD时，deliver MUST记录`targetDisposition: already-contained`并跳过fast-forward与push；随后 MUST继续remote readback、retained activation、Doctor与cleanup。若target再次前进，MUST返回新的target-race恢复事实，不得跨baseline沿用旧Agent审查。

#### Scenario: 零差异 baseline 保持稳定
- **WHEN** prepare/verify采用零差异适配且deliver观察到远端仍等于冻结baseline/carrier HEAD
- **THEN** deliver MUST执行零fast-forward、零push并记录Agent-reviewed already-contained evidence
- **AND** MUST继续activation、Doctor和cleanup，Candidate generation与`formalVerificationExecutions`保持不变

#### Scenario: 零差异审查后 target 再次前进
- **WHEN** deliver观察到远端不再等于零差异适配所绑定的Delivery Baseline
- **THEN** Task Finish MUST返回`task-finish.target-race`与新的exact resume token
- **AND** MUST NOT复用旧零差异审查、自动接受重叠路径或修改共享历史
