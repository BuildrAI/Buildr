## ADDED Requirements

### Requirement: Task Verification Application 必须是 Buildr Web 与专业 consumer 的唯一 writer 和 reader
Task Verification Application MUST独占Result normalization、Task/Project resolution、正式record action中的declaration identity观察、persistence调用、Result digest与保存值applicability派生。CLI、Skill、Buildr Web、Development、Finish、Task Record与Task Environment MUST NOT直接读写Result store或复制其字段authority；inspect MUST NOT接收declaration root或打开声明路径，Development MAY只提交已经由其正式action观察的declaration identity值做纯比较，Finish MUST不再消费Verification。

#### Scenario: CLI 记录 Result
- **WHEN** Agent调用`buildr task verification record <task-id>`
- **THEN** CLI MUST只解析输入并调用同一Application
- **AND** persistence writer与reader的静态调用方 MUST只有Task Verification Application/repository组合

#### Scenario: declaration 尚在 Task Environment
- **WHEN** 当前Content Target使用的Project declaration bytes尚未进入canonical Workspace
- **THEN** 只有record MAY提供`--declaration-root`，且Application MUST只接受该Task当前matching ready Environment的精确根
- **AND** inspect MUST拒绝该参数，Result MUST只保存Workspace相对declaration path与content identity

#### Scenario: Development检查Result
- **WHEN** Task Development准备冻结Candidate
- **THEN** Development MUST调用Task Verification Application inspect并提供current Content Target与已观察declaration identities
- **AND** MUST不提交declaration path、直接读取Result store或自行计算Result digest

#### Scenario: Buildr Web 查看 Result
- **WHEN** 用户在Task详情查看Verification
- **THEN** Buildr Web MUST调用同一Application的inspect read model且未提供axis为unknown
- **AND** 页面/API MUST NOT暴露direct Result writer或触发declaration observation

### Requirement: Buildr Web 展示的 Applicability 必须由 target 与 declaration identities 派生
Task Verification `record` MUST在正式action中观察并保存Content Target与Task有效Project集合内全部Project declaration identities，并返回该action时点的current applicability；仅工作区Task MUST观察并保存空declarations。后续`inspect` MUST只读取保存的Result/查询字段，并只对调用方显式提供的target/declaration identity值做纯值比较；MUST NOT接受路径作为读取时观察authority，不得读取Project registry、`verification.yml`、Git、Content Target或Environment来刷新applicability。未提供某axis的current identity值时，该axis MUST为unknown或明确表达最近一次record action的历史观察，MUST NOT声称live current。

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
- **THEN** Application MUST返回已有Result、record observedAt与unknown/last-observed语义
- **AND** MUST NOT从HEAD、Candidate、dirty tree、Environment、Project文件或时间伪造live identity

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

## REMOVED Requirements

### Requirement: Task Verification Application 必须是唯一 writer 和 reader
Task Verification Application MUST独占Result normalization、Task/Project resolution、正式record action中的declaration identity观察、persistence调用、Result digest与保存值applicability派生。CLI、Skill、Local App、Development、Finish、Task Record与Task Environment MUST NOT直接读写Result store或复制其字段authority；inspect MUST NOT接收declaration root或打开声明路径，Development MAY只提交已经由其正式action观察的declaration identity值做纯比较，Finish MUST不再消费Verification。

#### Scenario: CLI 记录 Result
- **WHEN** Agent调用`buildr task verification record <task-id>`
- **THEN** CLI MUST只解析输入并调用同一Application
- **AND** persistence writer与reader的静态调用方 MUST只有Task Verification Application/repository组合

#### Scenario: declaration 尚在 Task Environment
- **WHEN** 当前Content Target使用的Project declaration bytes尚未进入canonical Workspace
- **THEN** 只有record MAY提供`--declaration-root`，且Application MUST只接受该Task当前matching ready Environment的精确根
- **AND** inspect MUST拒绝该参数，Result MUST只保存Workspace相对declaration path与content identity

#### Scenario: Development检查Result
- **WHEN** Task Development准备冻结Candidate
- **THEN** Development MUST调用Task Verification Application inspect并提供current Content Target与已观察declaration identities
- **AND** MUST不提交declaration path、直接读取Result store或自行计算Result digest

#### Scenario: Local App 查看 Result
- **WHEN** 用户在Task详情查看Verification
- **THEN** Local App MUST调用同一Application的inspect read model且未提供axis为unknown
- **AND** 页面/API MUST NOT暴露direct Result writer或触发declaration observation

### Requirement: Applicability 必须由 target 与 declaration identities 派生
Task Verification `record` MUST在正式action中观察并保存Content Target与Task有效Project集合内全部Project declaration identities，并返回该action时点的current applicability；仅工作区Task MUST观察并保存空declarations。后续`inspect` MUST只读取保存的Result/查询字段，并只对调用方显式提供的target/declaration identity值做纯值比较；MUST NOT接受路径作为读取时观察authority，不得读取Project registry、`verification.yml`、Git、Content Target或Environment来刷新applicability。未提供某axis的current identity值时，该axis MUST为unknown或明确表达最近一次record action的历史观察，MUST NOT声称live current。

#### Scenario: record 时 target 与 declarations 已确认
- **WHEN** Application在合法record action中观察的target与全部Project declarations被写入同一Result
- **THEN** operation result MUST返回该action observedAt下的current applicability
- **AND** Result与查询字段 MUST在同一transaction中保存

#### Scenario: target 与 declarations 均未变化
- **WHEN** caller提供Content Target与declaration identity值且分别等于Result保存值
- **THEN** inspect MUST通过纯值比较返回对应axis current
- **AND** MUST NOT打开caller path或重新读取declaration bytes

#### Scenario: Local App 没有当前 target identity
- **WHEN** Local App只读inspect但没有提供current target/declaration identity值
- **THEN** Application MUST返回已有Result、record observedAt与unknown/last-observed语义
- **AND** MUST NOT从HEAD、Candidate、dirty tree、Environment、Project文件或时间伪造live identity

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
