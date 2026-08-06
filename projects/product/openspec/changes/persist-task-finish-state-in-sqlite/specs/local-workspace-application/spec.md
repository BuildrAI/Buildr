## ADDED Requirements

### Requirement: Local App 必须通过 Task Finish Application 投影 current 与 terminal 状态
Terminal Delivery Application MUST从Workspace SQLite中的Task Finish current/completion repository形成read model；Local App HTTP/Web MUST只消费该Application结果，不得直接查询SQLite、扫描或配对legacy Finish files、读取transient diagnostics、恢复run或计算live identity。terminal delivered判断 MUST只使用匹配Task/Development lifecycle的compact completion，current run只用于展示进行中、blocked或cleanup pending状态。

#### Scenario: Finish 正在执行
- **WHEN** Task存在SQLite current run且尚无terminal completion
- **THEN** Local App MUST展示当前phase、有界状态、更新时间与唯一next action
- **AND** MUST NOT把Task显示为delivered、读取完整stdout/stderr或触发resume

#### Scenario: Finish cleanup pending
- **WHEN** delivery已证明但Environment或Finish-owned transient cleanup尚未完成
- **THEN** Local App MUST显示“交付清理中”或匹配的blocked状态
- **AND** MUST NOT提前显示Task completed或terminal delivered成功语义

#### Scenario: Finish terminal completion
- **WHEN** Application返回与Task lifecycle匹配的compact completion
- **THEN** Local App MUST以其commit/ref、remote readback、Doctor、cleanup与完成时间投影“已交付”
- **AND** GET MUST不访问Git、remote、Environment provider、legacy files或transient root

#### Scenario: legacy store 残留
- **WHEN** `.buildr/task-finish`仍存在但SQLite中没有匹配completion，或Doctor报告legacy cleanup pending
- **THEN** Local App MUST不把legacy文件当作交付authority
- **AND** MAY只展示Application提供的有界维护诊断，不得自行导入或删除文件
