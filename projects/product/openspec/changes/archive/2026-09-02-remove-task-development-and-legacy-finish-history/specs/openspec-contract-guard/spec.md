## MODIFIED Requirements

### Requirement: OpenSpec Contract Guard必须前置语义就绪门禁
OpenSpec Contract Guard MUST 在Change artifacts达到apply-ready并通过上游strict validation后、实现前调用semantic readiness preflight。`ready`时Agent MAY直接apply或按目标执行Planning Review；`blocked`时 MUST停止apply并处理最小语义问题。Guard MUST NOT调用Task Planning Identity、Task Development或把Planning Review设为apply门禁。

#### Scenario: Preflight ready后进入Planning Review
- **WHEN** 当前Change的semantic readiness preflight返回`ready`
- **THEN** sidebar MUST允许Agent直接apply或选择审查当前真实artifacts
- **AND** MUST说明ready只覆盖当前OpenSpec观察，不替代最终converge或实现验证

#### Scenario: 内在语义问题阻塞
- **WHEN** preflight返回`scenario-omission`、`identity-conflict`、`projected-validation`或其他`semantic-resolution-required`
- **THEN** sidebar MUST在apply前停止并要求Agent修订Change artifact或请求用户决定
- **AND** 修订后 MUST重新运行upstream strict与preflight

#### Scenario: Active Change冲突阻塞
- **WHEN** preflight返回`active-change-conflict`
- **THEN** sidebar MUST列出冲突Change、capability和Requirement，并要求Agent处理前序依赖、合并语义或重划范围
- **AND** MUST不把时序冲突自动改写为当前Change artifact内容
