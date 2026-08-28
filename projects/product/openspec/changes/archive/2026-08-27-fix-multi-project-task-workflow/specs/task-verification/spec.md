## MODIFIED Requirements

### Requirement: Execution Record 与 Result 必须对账 matching Plan
正式execution MUST在首个副作用前把request/plan identity、selected execution unit与declaration identity写入Task Execution Record；reconciliation MUST按有效Project聚合matching terminal records并按既有唯一Application写current Result。同一Project内采用的records MUST绑定相同request/plan/provider，不同Project MUST允许绑定各自独立的request/plan/provider。Result MUST提炼实际capability facts、portable evidence identities、coverage gaps与结论，不得复制完整Plan、stdout/stderr或provider内部DAG。

#### Scenario: record与plan不匹配
- **WHEN** 同一Project的terminal records具有不同plan、request或provider identity，或record的declaration、selected capability、execution unit与自身Plan不匹配
- **THEN** reconciliation MUST拒绝采用该Project records并保留原current Result
- **AND** MUST返回精确Project与stale/mismatch diagnostic

#### Scenario: 不同Project使用独立Plan
- **WHEN** current Candidate的每个有效Project均提供绑定各自current declaration与Plan的matching terminal records
- **THEN** reconciliation MUST允许Project之间的request、plan与provider identity不同，并从全部记录提炼passed/failed facts
- **AND** MUST不要求或生成跨Project合并Plan

#### Scenario: 有效Project集合未完整覆盖
- **WHEN** 任一有效Project既没有matching terminal record，也没有明确`project:<code>` coverage gap
- **THEN** reconciliation MUST零写入拒绝形成Result并列出缺失Project
- **AND** MUST不因Result declarations包含该Project或其他Project已通过而报告整体passed

#### Scenario: matching执行完成
- **WHEN** 每个有效Project的current Plan required execution units均有matching terminal records，或该Project有明确coverage gap
- **THEN** reconciliation MUST从记录提炼passed/failed facts和coverage gaps
- **AND** Result MUST保持Task推进、风险接受与Finish authority之外
