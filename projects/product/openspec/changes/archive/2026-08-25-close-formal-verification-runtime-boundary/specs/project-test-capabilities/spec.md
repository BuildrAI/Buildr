## ADDED Requirements

### Requirement: Command invocation 必须解析为声明式执行时限
Buildr MUST让closed v3 command invocation可声明`timeoutMs`，并 MUST在Verification Plan中为每个command execution unit保存解析后的有界deadline。显式值 MUST为`1000..1800000`毫秒；未声明时 MUST使用确定性兼容默认值。Plan identity MUST包含解析后的deadline，CLI或Agent不得在execution时临时覆盖。

#### Scenario: v3 command显式声明timeout
- **WHEN** capability的selected command invocation声明合法`timeoutMs`
- **THEN** Plan execution unit MUST保存同一值并纳入Plan identity
- **AND** runner MUST以该值作为本次command的wall-clock deadline

#### Scenario: 现有v3 command没有timeout
- **WHEN** 合法v3 declaration的command invocation没有`timeoutMs`
- **THEN** normalizer MUST使用产品声明的兼容默认值生成有界execution unit
- **AND** declaration MUST继续有效，不得因本次扩展成为破坏性迁移

#### Scenario: timeout非法
- **WHEN** command invocation声明非整数、低于1000或高于1800000的`timeoutMs`
- **THEN** Doctor与planner MUST在启动command前返回closed-schema诊断
- **AND** MUST不打开Execution Record、取得resource或启动process

#### Scenario: legacy v2 declaration继续读取
- **WHEN** runtime读取合法v2 command capability
- **THEN** compatibility reader MUST使用同一保守默认值形成有界内部execution unit
- **AND** MUST不向v2 declaration回填`timeoutMs`或扩展v2作者模型
