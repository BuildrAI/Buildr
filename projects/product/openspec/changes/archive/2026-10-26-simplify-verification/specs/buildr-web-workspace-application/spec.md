## REMOVED Requirements

### Requirement: 首次开始工作必须触发scope内Declaration Intake
**Reason**: 清理旧分类、入口及技能职责，保留对应行为证明。
**Migration**: 由本变更四类检查、两个项目技能及同文件的新要求承接。

## ADDED Requirements

### Requirement: 首次开始工作必须触发scope内声明核对
Buildr Web生成Start Work Agent prompt时 MUST要求Agent在任务分流前通过 `buildr` 准备指引与 `project-testing` 只读检查所选Project及可选Service的Preparation与Verification声明。Prompt生成 MUST不读取代码树来生成声明候选，也 MUST不写Project文件。

#### Scenario: Project-only开始工作
- **WHEN** 用户选择Project但不选择Service
- **THEN** prompt MUST触发Project-only 声明核对
- **AND** MUST明确Service不是必需范围

#### Scenario: Service-scoped开始工作
- **WHEN** 用户选择一个Service开始工作
- **THEN** prompt MUST触发Project与该Service的声明核对
- **AND** MUST不检查或安装未选择Service

## MODIFIED Requirements

### Requirement: Buildr Web Task Verification Agent action不得依赖后端prompt
Buildr Web MUST在前端形成携带Task ID的最小指令，要求Agent读取项目验证技能（project-verification）与真实现场。前端 MUST不调用、声明或依赖Verification prompt API；后端不存在该route。

#### Scenario: 用户交给Agent验证
- **WHEN** 用户在证据页发起Task Verification Agent action
- **THEN** 前端 MUST生成短指令且不修改Verification Report
- **AND** Agent自行选择并调用已有测试工具
