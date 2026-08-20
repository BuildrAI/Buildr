## MODIFIED Requirements

### Requirement: Buildr Web 展示的 Applicability 必须由 target 与 declaration identities 派生
Task Verification `record` MUST在正式action中观察并保存Content Target与Task有效Project集合内全部Project declaration identities，并返回该action时点的current applicability；仅工作区Task MUST观察并保存空declarations。后续`inspect` MUST只读取保存的Result/查询字段，并只对调用方显式提供的target/declaration identity值做纯值比较；MUST NOT接受路径作为读取时观察authority，不得读取Project registry、`verification.yml`、Git、Content Target或Environment来刷新applicability。未提供某axis的current identity值时，该axis MUST为unknown或明确表达最近一次record action的历史观察，MUST NOT声称live current；每个unknown axis MUST返回稳定reason，至少区分`target-identity-not-provided`与`declaration-identities-not-provided`，且reason MUST只解释缺失输入而不触发外部观察。

#### Scenario: record 时 target 与 declarations 已确认
- **WHEN** Application在合法record action中观察的target与全部Project declarations被写入同一Result
- **THEN** operation result MUST返回该action observedAt下的current applicability
- **AND** Result与查询字段 MUST在同一transaction中保存

#### Scenario: target 与 declarations 均未变化
- **WHEN** caller提供Content Target与declaration identity值且分别等于Result保存值
- **THEN** inspect MUST通过纯值比较返回对应axis current
- **AND** MUST NOT打开caller path或重新读取declaration bytes

#### Scenario: Buildr Web 没有当前 target identity
- **WHEN** Buildr Web只读inspect但没有提供current target/declaration identity值
- **THEN** Application MUST返回已有Result、record observedAt、unknown/last-observed语义以及对应稳定reason
- **AND** target与declarations axis MUST分别使用`target-identity-not-provided`与`declaration-identities-not-provided`，不得从HEAD、Candidate、dirty tree、Environment、Project文件或时间伪造live identity

#### Scenario: policy 内容变化
- **WHEN** caller显式提供的任一Project declaration identity与Result保存值不同
- **THEN** overall applicability MUST为`stale`并返回可解释的declaration reason
- **AND** reader MUST NOT打开`verification.yml`或从path自行观察变化

#### Scenario: 显式 identity 已变化
- **WHEN** caller提供的target或任一declaration identity与Result保存值不同
- **THEN** 对应axis与overall applicability MUST为stale并返回保存值差异reason
- **AND** MUST NOT删除、覆盖或改写current Result

#### Scenario: 仅工作区declarations保持空集合
- **WHEN** caller提供的target与保存值相同，且current Task有效Project集合与declaration observations仍为空
- **THEN** declarations axis MUST通过空数组纯值比较返回current
- **AND** Task新增Project、Service或Project-bound Change后 MUST以非空observations使旧Result返回stale
