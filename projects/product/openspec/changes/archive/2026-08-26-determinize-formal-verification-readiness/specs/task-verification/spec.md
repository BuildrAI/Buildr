## ADDED Requirements

### Requirement: Task Verification 必须提供Formal Plan到policy的只读投影
Task Verification Application MUST提供只读变换，将按Task有效Project完整覆盖的closed Formal Verification Plan documents与current Task、Content Target及verification declarations对账，生成Task Development policy input和response-only selection disposition。该变换 MUST不写Verification Result、Execution Record、Environment、Development Receipt或其他持久状态。

#### Scenario: selected与not-selected投影
- **WHEN** current task-delivery Plan选择declaration中的部分capability
- **THEN** 投影 MUST把selected capability映射为required policy capability，并把其余可用于task-delivery的capability映射为not-selected摘要
- **AND** not-selected摘要 MUST不伪装成coverage gap、waiver或持久Result

#### Scenario: Plan包含coverage gap
- **WHEN** closed Plan包含owner、path或Project coverage gap
- **THEN** 投影 MUST将其收敛为对应Project的portable policy coverage gap并保留可诊断摘要
- **AND** MUST不静默选择额外能力或把blocked Plan改写为ready

#### Scenario: Plan identity不匹配
- **WHEN** Plan target不是current Content Target、target kind不是task-delivery、declaration identity陈旧或selected capability不属于current declaration
- **THEN** 投影 MUST零写入失败
- **AND** next action MUST要求重新形成current Plan或恢复对应authority

### Requirement: Formal Plan文件输入必须保持有界且不持久化
内部Task Development driver MUST允许discover policy通过重复`--plan <project>::<file>`读取JSON Plan document，并 MUST把正文仅作为本次Application输入。driver MUST拒绝非法映射、重复Project、非普通文件或与`--input-json`中的Plan集合冲突，且 MUST不保存文件路径或Plan正文。

#### Scenario: driver读取多个Project Plan
- **WHEN** Agent为每个有效Project提供一个普通JSON Plan文件
- **THEN** driver MUST按Project装配closed discovery input并返回Application投影
- **AND** 调用完成后Plan文件生命周期仍由Agent和Verification workflow负责

#### Scenario: 文件输入无效
- **WHEN** `--plan`不是`<project>::<file>`、文件不可读、JSON非法或Project重复
- **THEN** driver MUST在Application mutation前返回usage或input diagnostic
- **AND** MUST不创建或修改任何Task lifecycle事实
