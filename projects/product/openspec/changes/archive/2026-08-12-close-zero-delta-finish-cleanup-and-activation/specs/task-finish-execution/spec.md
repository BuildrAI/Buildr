## ADDED Requirements

### Requirement: retained cleanup 必须重建并复核专用零差异 containment proof
当 deliver 已以 Agent-reviewed zero-delta `already-contained` 完成交付并进入 durable cleanup boundary 时，retained cleanup MUST使用与 deliver 相同的专用观察器，从真实 run-owned carrier、Delivery Baseline、target ref与零delta identity重新构造containment proof。它 MUST要求carrier ownership/cleanliness/current facts仍可证明，并 MUST把重建proof与已保存delivery proof整值比较；不得把空changed paths交给要求非空path的通用containment观察器，也不得只信任已保存proof code或identity。

#### Scenario: 零差异交付继续完成cleanup
- **WHEN** current run已保存`agent-reviewed-delivery-adaptation`、`zeroDelta=true`、空actual delta、稳定baseline target、专用already-contained proof与prepared completion，且carrier仍run-owned、registered和clean
- **THEN** retained cleanup MUST重建相同proof并继续Environment、carrier、transient与lease owner cleanup及Task terminal transition
- **AND** MUST NOT重跑deliver、Formal Verification、Candidate或Agent语义审查

#### Scenario: 零差异proof或真实carrier被篡改
- **WHEN** saved proof的code、proof、ref、空paths或identity不匹配，或carrier不再registered/clean、HEAD/tree偏离baseline、actual delta不为空、target ref不再等于baseline
- **THEN** retained cleanup MUST在Environment cleanup与Task terminal transition前fail closed
- **AND** MUST保留当前run、carrier与精确诊断，不得回退为普通empty-path containment或删除不明资源

#### Scenario: 普通already-contained保持原验证
- **WHEN** delivered carrier包含非空changed paths并以普通`already-contained`完成
- **THEN** retained cleanup MUST继续按每个path的mode/blob/删除状态与ancestry重建通用containment proof
- **AND** MUST不把该delivery解释为Agent-reviewed zero-delta
