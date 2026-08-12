## ADDED Requirements

### Requirement: Deliver 必须识别已完整包含 Carrier 的前进 Target
当 observed target ref在当前Delivery Carrier准备后前进时，Task Finish MUST在返回target-race前确定性检查最新target是否完整包含该carrier。包含证明 MUST同时要求carrier head是observed target的Git ancestor、carrier全部changed paths在observed target保持相同after mode/blob或删除状态，并且current Development carrier equivalence仍成立；不得只凭路径不重叠、commit message或调用方声明放行。

#### Scenario: 最新 target 完整包含已推送 carrier
- **WHEN** observed target是carrier head的后代，且carrier每个changed path的after mode/blob在observed target完全保持
- **THEN** deliver MUST记录`targetDisposition: already-contained`，跳过重复Task Contribution apply、fast-forward与push，并继续retained activation、Doctor和cleanup
- **AND** Result MUST同时保留原carrier ref、containment evidence与最新final remote ref，Candidate generation与`formalVerificationExecutions`保持不变

#### Scenario: 后续提交改变 carrier 路径
- **WHEN** observed target虽然是carrier head的后代，但任一carrier changed path的mode/blob或删除状态不再匹配
- **THEN** deliver MUST保持`task-finish.target-race`并通过精确token恢复现有prepare/Delivery Adaptation路径
- **AND** MUST NOT把ancestry、无冲突历史或其余路径一致解释为完整包含

#### Scenario: 祖先或远端对象无法证明
- **WHEN** fetch失败、carrier不是observed target的ancestor，或target tree状态无法读取
- **THEN** deliver MUST fail closed并返回当前target-race诊断
- **AND** MUST NOT修改原Task worktree、Candidate、Verification Result或远端target
