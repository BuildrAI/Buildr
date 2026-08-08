# local-workspace-application Delta

## ADDED Requirements

### Requirement: 首次开始工作必须触发scope内Declaration Intake
Local App生成Start Work Agent prompt时 MUST要求Agent在任务分流前只读检查所选Project及可选Service的Preparation与Verification声明。Prompt生成 MUST不读取代码树来生成声明候选，也 MUST不写Project文件。

#### Scenario: Project-only开始工作
- **WHEN**用户选择Project但不选择Service
- **THEN**prompt MUST触发Project-only Declaration Intake
- **AND** MUST明确Service不是必需范围

#### Scenario: Service-scoped开始工作
- **WHEN**用户选择一个Service开始工作
- **THEN**prompt MUST触发Project与该Service的Declaration Intake
- **AND** MUST不检查或安装未选择Service
