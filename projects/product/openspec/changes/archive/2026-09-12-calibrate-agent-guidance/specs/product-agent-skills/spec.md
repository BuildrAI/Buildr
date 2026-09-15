## MODIFIED Requirements

### Requirement: Task Verification Skill必须指导Agent直接验证并形成报告
Package MUST投射Task Verification Skill，指导Agent探查项目测试体系、读取v4测试地图、结合Task与当前改动选择具体测试，并直接使用Maven、npm、Playwright、Browser、HTTP或项目runner。Skill MUST区分开发反馈与开发完成验证；只有后者调用Task Verification record。

#### Scenario: 开发过程中运行测试
- **WHEN** Agent为当前修改运行focused单元或功能测试
- **THEN** Skill MUST指导Agent修复失败并继续开发
- **AND** MUST NOT记录Task Verification Report

#### Scenario: 开发完成
- **WHEN** Agent认为实现完成并准备验证
- **THEN** Skill MUST指导Agent先核对已有检查与当前内容、环境和目标的适用性，复用有效证据，只补充未覆盖的必要检查；扩大到完整回归 MUST具有改动影响、项目必需要求或明确未解决风险的依据
- **AND** 形成包含选择理由、实际targets、结果、gaps和结论的报告后调用record

#### Scenario: 已有检查仍适用
- **WHEN** 已有检查仍适用于当前成果且必需检查已通过，没有新改动、失败或明确未解决风险
- **THEN** Agent MUST 复用实际结果形成报告，不因进入完成阶段或登记报告重跑检查
- **AND** MUST 保留原执行事实并说明复用适用性，不把历史日志改写为新的执行事实

### Requirement: UI相关工作必须由实际入口询问原型并默认遵循已有原型
Task Triage与Buildr OpenSpec propose、update、apply contributions MUST在新页面、主要布局或交互存在实质设计选择且用户尚未表达偏好时询问是否需要UI Prototype；已明确设计的局部修复 MUST直接推进，并只在明确确认后路由selected provider。已有原型时Agent MUST默认按其信息架构、布局和交互开发，除非用户明确要求忽略。

#### Scenario: 用户不需要原型
- **WHEN** 用户明确拒绝本次UI Prototype
- **THEN** Agent MUST继续当前Task或OpenSpec工作
- **AND** MUST不创建原型状态或流程门禁

## ADDED Requirements

### Requirement: 核心规则与技能指引必须按实际影响控制工作量
随包核心规则 MUST在性能原则第 7 条末尾声明验证范围与改动影响匹配，并限定有效证据与必需检查已满足时的追加验证条件；MUST保持术语表达要求不变。`task-verification`、`task-triage`、`code-architecture`、`capability-adaptation` MUST使用简短且可区分的触发描述，正文保留决策与必要边界，较长的分支操作细节 MUST可按需读取。

#### Scenario: 局部修改无需完整架构地图
- **WHEN** 当前改动不涉及结构设计或跨模块重构，且用户未要求完整地图
- **THEN** `code-architecture` MUST只说明相关位置和影响，不强制输出完整目录、对象、方法及调用链地图

#### Scenario: 结构设计需要完整地图
- **WHEN** 用户要求结构设计、跨模块重构或完整代码地图
- **THEN** `code-architecture` MUST提供真实目录、主要对象、代表方法和关键调用链，区分当前与拟议结构

#### Scenario: 只选择检查而不登记报告
- **WHEN** 当前动作仅为选择和执行相关检查
- **THEN** `task-verification` MUST允许只读取选择指导，不要求预读报告登记或地图写入步骤
