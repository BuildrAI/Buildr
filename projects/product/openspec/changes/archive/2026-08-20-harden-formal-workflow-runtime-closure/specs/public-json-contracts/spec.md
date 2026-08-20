## MODIFIED Requirements

### Requirement: Verification run 必须提供稳定公开 JSON identity
`buildr verification run --json` MUST输出`buildr.verification-execution/v1`，并 MUST在成功、capability failure、formal execution record backpressure/seal failure与调用前invalid request路径保持单一stdout JSON object。Payload MUST区分transient execution status、Project/declaration identity、requested target identity、实际checks、精确capability/resource authorization、真实timing、target stability、Environment execution context与evidence lifecycle；并 MUST以additive `executionRecord` summary表达`not-applicable|not-opened|retained|blocked|attention`、portable record identity/outcome/lifecycle/body summary、transient cleanup、diagnostic与next action。公开checks MUST只投影portable capability identity、outcome、timing、resource/target摘要与有界failure summary；完整stdout/stderr MUST只进入Execution Record受控正文，且无论Task内外都 MUST NOT出现在公共JSON。Payload MUST NOT包含Workspace Node字段，不得暴露SQLite/database、正文locator、本机持久化路径，也 MUST NOT声称current Result、Candidate completeness、Result adoption或required assurance。

#### Scenario: 验证成功输出 JSON
- **WHEN** 所有显式command capabilities完成且target observation保持稳定
- **THEN** Task外JSON MUST返回`status: passed`、compact checks、declaration、duration、transient evidence reference与`executionRecord.status: not-applicable`
- **AND** formal Task JSON只有在execution record retained且transient cleanup得到明确处置后才能返回`status: passed`与portable record summary

#### Scenario: 验证业务失败输出 JSON
- **WHEN** capability执行失败、资源等待失败、target drift、execution context在启动后失稳或formal record无法安全retained
- **THEN** stdout MUST仍返回同一`buildr.verification-execution/v1` family的失败摘要并以非零状态退出
- **AND** payload MUST包含已完成compact checks、具体有界failures、execution record/transient cleanup状态和可用结构化诊断，且 MUST NOT写current Result

#### Scenario: capability 产生大体量输出
- **WHEN** formal Verification capability产生完整stdout/stderr并成功或失败结束
- **THEN** Execution Record body MUST保留受控完整输出，公共JSON MUST只返回record identity、outcome与有界摘要
- **AND** 公共stdout上的单一JSON object MUST不包含check级stdout/stderr字段或原始输出字节

#### Scenario: formal record backpressure
- **WHEN** execution record quota reservation在producer启动前被拒绝
- **THEN** JSON MUST返回`status: failed`、空checks与`executionRecord.status: blocked`
- **AND** MUST提供portable diagnostic与唯一next action，不得暴露quota SQL或数据库路径

#### Scenario: invalid request
- **WHEN** 参数、v2 declaration、capability identity、invocation kind、执行根或授权不合法
- **THEN** JSON MUST返回`status: failed`、空checks与`executionRecord.status: not-opened`
- **AND** MUST不生成execution record、transient evidence、current Result或误报completed execution
