## ADDED Requirements

### Requirement: Release lifecycle必须派生编排与阶段时间线
Release lifecycle projection MUST在不增加Task Record字段或旁路workflow store的前提下，组合current selection、Candidate attempts/aggregate、main PR、readiness context、Publication evidence、dev provenance reconciliation、release closeout、Task、Environment与Doctor facts，返回current orchestration action、稳定recovery identity和Release Phase Timeline identity。

#### Scenario: 等待publication授权
- **WHEN** selection、Candidate、main tree与readiness均current且尚无matching Publication
- **THEN** lifecycle MUST返回`awaiting-publication-authorization`、`prepare-dispatch`形成的context/timeline identity和独立`human-decision`等待阶段
- **AND** Task或readiness时间戳 MUST NOT被解释为维护者已经授权

#### Scenario: terminal Task但Environment cleanup待恢复
- **WHEN** release facts已经closed且协调Task已no-change completed，但Environment cleanup或Doctor仍blocked
- **THEN** orchestration projection MUST保持Publication、reconciliation、Git closeout和Task completion为已通过并把next action指向对应cleanup/Doctor owner
- **AND** MUST NOT把release lifecycle退回publishing、重开Task或生成新的协调identity

#### Scenario: current generation发生变化
- **WHEN** selection generation、context digest、Candidate aggregate或Publication run发生变化
- **THEN** lifecycle MUST生成新的recovery/timeline identity并拒绝旧generation的dispatch授权与closeout组合
- **AND** 旧Timeline MAY作为外部历史evidence保留，但 MUST NOT成为current lifecycle成功输入
