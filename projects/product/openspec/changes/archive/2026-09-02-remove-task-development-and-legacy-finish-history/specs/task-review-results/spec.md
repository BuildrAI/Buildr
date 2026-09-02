## ADDED Requirements

### Requirement: Review subject 不得依赖 Task Planning Identity 或 Task Candidate
Task Review MUST允许Agent用当前方案文件、Git tree/commit、文件产物、部署或外部系统结果的真实identity作为subject。Application MUST不调用Task Planning Identity、Task Development或旧Finish history。

#### Scenario: 审查OpenSpec方案
- **WHEN** Agent选择审查当前proposal、design、delta specs和tasks
- **THEN** Result MUST记录Agent实际使用的subject identity与reviewed范围
- **AND** checkbox或provenance变化是否影响旧结论 MUST由Agent重新读取真实artifacts后判断
