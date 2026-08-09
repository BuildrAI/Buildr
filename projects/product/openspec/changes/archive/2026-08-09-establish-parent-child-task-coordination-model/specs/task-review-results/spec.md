## ADDED Requirements

### Requirement: Parent Planning Review 必须只绑定 Parent Plan identity
Task Review MUST以Parent Plan内容identity作为Parent Planning Review target；只有outcome、architecture invariants、Contribution Map、dependency graph或final acceptance实质变化 MUST使Result stale。

#### Scenario: Child 专业状态变化
- **WHEN** Child Verification通过、Change归档或Finish完成但Parent Plan未改变
- **THEN** Parent Planning Review applicability MUST保持current
- **AND** Review store MUST NOT写入新的Result

#### Scenario: 显式reconciliation改变Contribution Map
- **WHEN** Parent reconciliation产生新的Parent Plan identity
- **THEN** 旧Planning Review MUST显示stale
- **AND** 新Review MUST只审查五类Parent协调事实
