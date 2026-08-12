## ADDED Requirements

### Requirement: Agent 处置复盘必须取得针对具体写入的明确授权
`task-retrospective` provider MUST 将 current 复盘的只读检查、当前事实重判与最终 mutation 授权分离。用户只要求“处理、检查、查看、分析复盘”且未明确选择 disposition 或 Task 关系 effects 时，provider MUST 只返回原始报告或引用、当前证据、拟 disposition、理由与拟 Task effects，并 MUST 保持 current disposition 和 Task Record rows 不变。只有用户直接指定完整 mutation，或明确接受 provider 已展示且未发生实质变化的完整方案后，provider 才可调用 Task Record mutation 或 Task Retrospective `handle`。

#### Scenario: 宽泛处理请求只进入讨论
- **WHEN** 用户要求“处理这个复盘”，但没有明确选择 `handled`、`no-action`、`pending` 或任何 Task 创建、关联 effects
- **THEN** provider MUST 执行只读 inspect 与当前事实重判，并向用户展示拟处置方案
- **AND** MUST NOT 调用 Task Record create/update 或 Task Retrospective handle，current disposition MUST 保持 `pending`

#### Scenario: 用户直接指定完整处置动作
- **WHEN** 用户直接要求把 current 复盘标记为具体 disposition，并提供或接受对应理由与完整 Task effects
- **THEN** provider MAY 将该表达视为本次精确 mutation 的授权并直接执行
- **AND** MUST NOT 因已经具备明确授权而机械要求第二次确认

#### Scenario: 用户接受已展示且未变化的方案
- **WHEN** provider 已展示拟 disposition、理由、目标 Task IDs 与关系 effects，用户明确同意该完整方案，且重新 inspect 后这些 facts 未实质变化
- **THEN** provider MUST 只执行已授权的 Task Record 与 disposition mutations
- **AND** MUST 返回实际 effects、最终 disposition 与新的 current digest

#### Scenario: 拟写入事实发生变化
- **WHEN** 用户授权后 current digest、拟 disposition、处置理由、目标 Task 或关系 effects 发生实质变化
- **THEN** provider MUST 停止写入、重新展示变化后的完整方案并取得新授权
- **AND** MUST 保持 current disposition 不变，不得用旧授权提交新的 Task 或 disposition mutation
- **AND** 若已有部分已授权 effects 成功，MUST 原样报告实际 effects，不得把部分落地冒充完整处置

#### Scenario: 用户继续讨论或提出异议
- **WHEN** provider 展示拟处置方案后，用户继续讨论、要求调整、提出异议或未明确接受
- **THEN** provider MUST 保持只读讨论阶段
- **AND** MUST NOT 创建或关联承接 Task，也 MUST NOT提交 `handled`、`no-action` 或 `pending` mutation
