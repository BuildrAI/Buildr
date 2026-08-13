## ADDED Requirements

### Requirement: 正式 Verification 必须稳定识别 invocation 并阻止非显式重复启动
Buildr MUST 为每次合法 formal Task Verification request 在启动 capability 前生成portable closed `invocationIdentity`，该identity MUST只绑定Task、target、Project/declaration与规范化capability集合，并MUST不包含授权表达、并发度、run随机数、时间或本机路径。Task Execution Record Application MUST原子检查相同Task、owner、kind与invocation identity的active record；没有显式`--retry`时，既有active record MUST阻止第二份capability/process执行。`--retry` MUST创建新的run identity与独立execution record，并MUST不覆盖、结束或采用既有record。

#### Scenario: 相同正式验证仍在执行
- **WHEN** 第二个`verification run`请求与某个`open` record具有相同invocation identity且未提供`--retry`
- **THEN** runner MUST返回existing record/run identity与可查询next action
- **AND** MUST不创建record、取得resource、启动capability process或写current Verification Result

#### Scenario: 显式重试active invocation
- **WHEN** caller确认需要并行或替代执行并显式提供`--retry`
- **THEN** runner MUST生成新run identity并打开独立record后执行请求
- **AND** 既有active record的lifecycle、正文、resolution与owner facts MUST保持不变

#### Scenario: terminal历史不阻止新执行
- **WHEN** 相同invocation identity只存在retained或cleaned terminal records
- **THEN** 普通`verification run` MUST允许创建新的run与record
- **AND** MUST不覆盖或复用历史terminal record

#### Scenario: session丢失后按Task恢复读取
- **WHEN** 原调用终端或工具session不可用但formal execution record已经open或retained
- **THEN** Agent MUST能通过Task-scoped public list定位record并通过inspect读取current lifecycle或terminal摘要
- **AND** 恢复读取 MUST不启动新的verification execution或写Verification Result
