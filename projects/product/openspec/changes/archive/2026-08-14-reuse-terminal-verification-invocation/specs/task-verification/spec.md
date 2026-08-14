## MODIFIED Requirements

### Requirement: 正式 Verification 必须稳定识别 invocation 并阻止非显式重复启动
Buildr MUST 为每次合法 formal Task Verification request 在启动 capability 前生成portable closed `invocationIdentity`，该identity MUST只绑定Task、target、Project/declaration与规范化capability集合，并MUST不包含授权表达、并发度、run随机数、时间或本机路径。Task Execution Record Application MUST在同一原子transaction中exact查询相同Task、owner、kind与invocation identity的历史record；没有显式`--retry`时，既有active或terminal record MUST阻止第二份capability/process执行，并MUST按active优先、随后terminal的规则复用`opened_at DESC, record_id DESC`所选latest record。`--retry` MUST创建新的run identity与独立execution record，并MUST不覆盖、结束或采用既有record；identity输入变化 MUST创建新的首次执行而不要求`--retry`。

#### Scenario: 相同正式验证仍在执行
- **WHEN** 第二个`verification run`请求与一个或多个`open` record具有相同invocation identity且未提供`--retry`
- **THEN** runner MUST返回按`opened_at DESC, record_id DESC`确定性选出的latest active record/run identity与可查询next action
- **AND** MUST不创建record、取得resource、启动capability process、观察target或写current Verification Result

#### Scenario: 相同正式验证已有terminal结果
- **WHEN** 相同invocation identity不存在active record但存在`retained`、`cleanup_pending`、`cleaned`或`attention` record且未提供`--retry`
- **THEN** runner MUST返回按`opened_at DESC, record_id DESC`确定性选出的latest terminal record/run identity及其原outcome/lifecycle
- **AND** MUST返回零checks、零duration与`not-started-existing-terminal` timing，且不得创建record、取得resource、启动capability process、观察target、创建transient evidence或写current Verification Result

#### Scenario: terminal历史不阻止新执行
- **WHEN** 相同invocation identity已有terminal历史，但caller显式提供`--retry`，或任一invocation identity输入发生变化
- **THEN** terminal历史 MUST不阻止新run与独立record的首次打开和执行
- **AND** 没有显式`--retry`且identity未变化时 MUST复用terminal历史，不得把旧Scenario解释为默认重复执行授权

#### Scenario: terminal通过结果保持通过
- **WHEN** 默认复用的terminal record outcome为`passed`且lifecycle不是`attention`
- **THEN** execution envelope MUST返回`passed`并保留原record identity、outcome与lifecycle
- **AND** MUST不把该Execution Record readback保存为新的Verification Result

#### Scenario: terminal负向或attention结果不改写
- **WHEN** 默认复用的terminal record outcome为`failed`、`blocked`或`cancelled`，或lifecycle为`attention`
- **THEN** execution envelope MUST返回failed与非零退出并保留原outcome/lifecycle
- **AND** MUST提供inspect与显式retry next action，不得自动重跑或改写为passed

#### Scenario: active优先于terminal历史
- **WHEN** 相同invocation identity同时存在active与terminal records且未提供`--retry`
- **THEN** runner MUST只在active集合中选择latest record
- **AND** terminal历史与全部未选record MUST保持不变并继续可list/inspect

#### Scenario: 显式重试active invocation
- **WHEN** caller确认需要独立执行并显式提供`--retry`
- **THEN** runner MUST生成新run identity并打开独立record后执行请求，即使相同identity已有active或terminal record
- **AND** 新旧record MUST共享invocation identity但保留独立run/record identity，既有record的lifecycle、正文、resolution与owner facts MUST保持不变

#### Scenario: invocation identity输入变化
- **WHEN** Content Target、Project、verification declaration identity、规范化capability集合或其他既有invocation identity输入发生变化
- **THEN** runner MUST生成不同invocation identity并正常创建首次run/record
- **AND** caller MUST不需要提供`--retry`

#### Scenario: terminal状态集合保持closed
- **WHEN** Application判断Execution Record是否terminal
- **THEN** outcome集合 MUST为`passed|failed|blocked|cancelled`且lifecycle集合 MUST为`retained|cleanup_pending|cleaned|attention`
- **AND** `running|open` MUST只代表active，未来新增状态 MUST显式更新domain、query、contract与测试后才能参与复用

#### Scenario: 相同时间戳仍稳定选择
- **WHEN** 同一invocation的多个候选record具有相同`opened_at`
- **THEN** repository MUST使用`record_id DESC`作为确定性tie-breaker
- **AND** 重复查询 MUST返回同一record，不得依赖数据库未声明的行顺序

#### Scenario: session丢失后按Task恢复读取
- **WHEN** 原调用终端或工具session不可用但formal execution record已经open或terminal
- **THEN** Agent MUST能通过Task-scoped public list定位record并通过inspect读取current lifecycle或terminal摘要
- **AND** 恢复读取或默认重复调用 MUST不启动新的verification execution或写Verification Result
