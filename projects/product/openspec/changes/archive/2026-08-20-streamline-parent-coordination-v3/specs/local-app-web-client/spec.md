## ADDED Requirements

### Requirement: Buildr Web 必须直接消费Parent Coordination v3
Buildr Web MUST只按v3 canonical字段渲染Parent、Child、ordinary与legacy模式，MUST不在API层、类型或组件中保留v2 alias、fallback或第二套进度计算。

#### Scenario: Parent详情加载
- **WHEN** Task detail读取Parent coordination endpoint
- **THEN** Web MUST从`plan`、顶层`contributions`、`startup`、`planningReview`、`parentAcceptance`与`prerequisitesSatisfied`渲染现有界面
- **AND** MUST不读取`parentPlan`、`finalAcceptanceReady`、`plannedContributions`或`nextActions`

#### Scenario: Child详情加载
- **WHEN** endpoint返回`mode: child`
- **THEN** Web MUST从紧凑`parentSource`与canonical binding字段渲染Parent来源
- **AND** MUST不请求或重建完整Parent coordination
