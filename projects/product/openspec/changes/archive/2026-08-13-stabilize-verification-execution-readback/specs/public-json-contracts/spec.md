## ADDED Requirements

### Requirement: Execution record CLI readback 必须提供closed portable JSON
Buildr MUST为Task execution record CLI list与inspect登记稳定public JSON schema identity。List payload MUST包含Task、requested view、observedAt与有界records；inspect payload MUST包含matching portable record、可选compact Verification summary、available body filenames、diagnostic与next actions。两类payload MUST复用Task Execution Record Application值语义，MUST不暴露SQLite、body locator、本机路径、raw command、resource token或mutation action。

#### Scenario: list JSON
- **WHEN** Agent使用`task execution-record list --json`
- **THEN** stdout MUST为单一closed JSON object并返回稳定排序records
- **AND** open与terminal record MUST保持各自真实lifecycle/outcome，不推断Result采用状态

#### Scenario: inspect JSON
- **WHEN** Agent使用matching Task/record调用`task execution-record inspect --json`
- **THEN** stdout MUST为单一closed JSON object并返回portable compact facts与正文文件名
- **AND** open record没有正文时 MUST明确返回summary unavailable而不是伪造terminal facts

### Requirement: Verification active duplicate 必须返回非执行JSON结果
当`verification run --json`发现相同invocation identity的active record且未提供`--retry`时，Buildr MUST返回同一`buildr.verification-execution/v1` family中的非执行结果，包含`status: active`、existing record/run/invocation identity、空checks、零duration执行事实与指向list/inspect的next actions。Payload MUST不声称existing execution已经passed/failed，也MUST不包含transient evidence locator或新record effect。

#### Scenario: 默认请求命中active execution
- **WHEN** matching active record已存在且caller未显式retry
- **THEN** JSON MUST返回existing portable identity与`executionRecord.status: active`
- **AND** checks MUST为空且不得创建新evidence、record或capability side effect

#### Scenario: 显式retry正常执行
- **WHEN** caller提供`--retry`
- **THEN** JSON MUST按新run返回正常execution envelope与独立execution record summary
- **AND** payload MUST不覆盖或内联旧active execution结果
