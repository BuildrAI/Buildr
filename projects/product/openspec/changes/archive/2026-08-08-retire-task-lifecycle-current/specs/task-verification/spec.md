## ADDED Requirements

### Requirement: Verification current row 必须保存稳定查询字段
Task Verification repository MUST在同一current row保存Domain验证的完整`result_json`、同一Result的`target_identity`、`outcome`与`updated_at`。这些字段MUST只用于结果定位、Overview查询与保存值一致性检查，MUST NOT复制capability facts、coverage gaps、declarations、Development adoption或terminal association。

#### Scenario: 记录 Verification Result
- **WHEN** Application完成declaration observation并形成完整Result
- **THEN** repository MUST在单一transaction中原子替换JSON与查询字段并写后验证
- **AND** target/outcome/time与Result JSON不一致时 MUST rollback并保留原current

#### Scenario: 读取 Overview
- **WHEN** Task Overview查询Verification摘要
- **THEN** repository MUST返回row presence、target、outcome与updated time
- **AND** MUST NOT复制完整Result或重新解析Project declaration

## MODIFIED Requirements

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
Task Verification `record` MUST在正式action中观察并保存Content Target与Task scope内全部Project declaration identities，并返回该action时点的current applicability。后续`inspect` MUST只读取保存的Result/查询字段，并只对调用方显式提供的target/declaration identity值做纯值比较；MUST NOT接受路径作为读取时观察authority，不得读取Project registry、`verification.yml`、Git、Content Target或Environment来刷新applicability。未提供某axis的current identity值时，该axis MUST为unknown或明确表达最近一次record action的历史观察，MUST NOT声称live current。

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
- **THEN**对应axis与overall applicability MUST为stale并返回保存值差异reason
- **AND** MUST NOT删除、覆盖或改写current Result

### Requirement: terminal delivery association 必须证明交付目标使用了对应 Verification Result
Application 层 terminal projection MUST只读取matching Finish completion中保存的association；当handoff verification gate的Result digest、Content Target identity与Verification current slot完全一致时，才返回`verified-at-delivery`及原始passed/not-passed结论。该关联 MUST NOT改写Verification Result、保存时applicability或declaration facts，也MUST NOT依赖独立lifecycle projection。

#### Scenario: 交付目标已验证通过
- **WHEN** completed delivered Task的Verification Result、Finish completion association与Development handoff identities完全一致
- **THEN** terminal projection MUST表达“已随交付目标验证通过”
- **AND** MUST保留原始能力事实、coverage gaps与conclusion内容

#### Scenario: 交付目标未验证通过但风险已明确接受
- **WHEN** matching completion association保存not-passed Verification Result digest且handoff含合法proceed risk decision
- **THEN** terminal projection MUST表达“已随交付目标验证未通过”及已保存风险事实
- **AND** MUST NOT改写为passed

#### Scenario: active declaration currentness
- **WHEN** Task仍active且Overview同时读取Verification row与Development verification gate
- **THEN** Application MAY比较已保存target/result digest并报告matched/mismatched/unknown
- **AND** terminal delivery association MUST不参与live applicability，也不得触发外部观察

### Requirement: Verification Execution 必须保持 transient
`buildr verification run` MUST针对显式Project、target identity与capability identities执行Project v2中已有的command invocation，并把完整执行事实写入transient summary。Runner MUST NOT写current Result。`--declaration-root` MUST只由`task verification record`接收；run或inspect误用时MUST在启动任何capability或读取任何声明路径前返回syntax diagnostic。

#### Scenario: 显式命令能力执行完成
- **WHEN** 调用方选择一个或多个有效command capabilities
- **THEN** runner MUST有界执行并返回每项真实passed/failed事实与完整transient output
- **AND** caller MUST在形成完整Task结论后另行通过Application record

#### Scenario: declaration-root 误用于 execution
- **WHEN** 调用方把`--declaration-root`传给`buildr verification run`
- **THEN** runner MUST在启动capability前返回参数错误并指向`task verification record`
- **AND** MUST NOT启动测试、写current Result或产生capability side effect

#### Scenario: target 在执行期间发生内容漂移
- **WHEN** capability checks已完成但execution root的tracked diff、status或untracked content fingerprint与执行前不同
- **THEN** transient summary MUST返回`target.stable=false`并将整体status设为`failed`
- **AND** summary MUST提供相对于target root的有限变化分类或路径摘要，以区分target drift与capability assertion failure
- **AND** summary MUST NOT把Candidate dirty status单独解释为drift，也 MUST NOT将本机绝对路径写入current Result

#### Scenario: 选择 Agent invocation
- **WHEN** `verification run`收到`invocation.kind: agent`的capability
- **THEN** runner MUST在启动任何命令前拒绝
- **AND** Skill MAY按bounded instructions执行并最终通过同一record Application提炼事实
