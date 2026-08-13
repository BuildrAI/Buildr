## ADDED Requirements

### Requirement: Verification execution record 必须保存closed invocation identity
Task Execution Record Application MUST允许registered Verification producer为record提交一个portable `invocationIdentity`，并MUST把它作为现有record metadata的closed字段保存。Repository MUST在同一open transaction中按Task、owner、kind、invocation identity检查active record并返回`opened|existing-active`结果；该检查MUST不扫描正文、不读取transient evidence或建立第二张执行状态表。旧record MAY没有该字段且MUST继续可读，但MUST不参与新invocation的active duplicate匹配。

#### Scenario: 原子打开唯一active invocation
- **WHEN** 两个默认formal Verification请求并发提交相同invocation identity
- **THEN** Application MUST只创建一条新record与一份reservation
- **AND** 另一个请求 MUST取得`existing-active`结果且不能认领producer execution ownership

#### Scenario: invocation identity 不同
- **WHEN** target、Project、declaration或capability集合任一不同
- **THEN** Application MUST把请求视为不同invocation并按正常quota规则打开独立record
- **AND** MUST不依赖调用顺序、stdout或本机路径区分请求

#### Scenario: 读取旧record
- **WHEN** migration前的record没有invocation identity
- **THEN** list与inspect MUST继续返回其既有portable metadata和正文状态
- **AND** Application MUST不补造identity或修改旧record

### Requirement: Agent CLI read model 必须从同一 execution record authority 投影compact事实
Task Execution Record Application MUST为公共CLI复用既有Task-scoped list/detail/body完整性能力，并MUST为Verification record从受控`summary.json`及适用`diagnostics.json`投影compact execution facts。投影MUST只包含record/run/invocation identity、lifecycle/outcome、target、Project/declaration、capability IDs、started/finished/duration、失败摘要与available body filenames；MUST不返回SQLite、locator、本机root/executable、resource token、raw argv或任意正文path。

#### Scenario: list active与terminal records
- **WHEN** Agent按Task请求`verification` view
- **THEN** Application MUST按稳定顺序返回open、attention、retained与cleanedrecords的portable metadata
- **AND** list MUST不读取正文或改变record lifecycle

#### Scenario: inspect retained Verification record
- **WHEN** Agent以matching Task与record ID请求inspect且closed正文完整
- **THEN** Application MUST返回portable record、compact execution summary与available body filenames
- **AND** summary/diagnostics读取 MUST复用既有manifest与digest完整性验证

#### Scenario: inspect open record
- **WHEN** matching record仍为open且尚无retained正文
- **THEN** inspect MUST返回open lifecycle、run/invocation/target identity与`summary: unavailable`
- **AND** MUST不把open解释为failed、自动seal或启动producer
