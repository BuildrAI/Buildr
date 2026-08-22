## MODIFIED Requirements

### Requirement: 自动触发必须止于只读发现
Project/Service注册、首次Task scope、构建/依赖/测试入口变化、Environment declaration gap、Verification coverage gap及显式initialize/refresh MAY触发Intake。触发后Agent MUST先只读发现并展示候选或diff，再将变化分类为`routine-maintenance`或`user-decision-required`。仅让声明追上当前用户目标内已确认入口、且不改变Project/Service scope、applicability、required capability、外部效果或安全例外的维护 MAY 由Agent交给对应owner完成；改变任一长期适用性或存在authority冲突的变化 MUST先取得用户对精确目标与内容的确认。

#### Scenario: 既有scope内的routine maintenance
- **WHEN** Intake发现声明只需追上当前Task scope内已由wrapper、lockfile、测试入口或既有权威事实确认的变化
- **AND** 该diff不新增或删除scope、不改变applicability/requiredness、不引入capability、外部效果或安全例外
- **THEN** Agent MAY在当前用户目标授权内把精确diff交给对应声明owner写入并验证
- **AND** MUST报告changed file、identity与owner验证结果，而不要求用户承担内部声明维护步骤

#### Scenario: 用户未授权写入
- **WHEN** 候选会新增或删除Project/Service scope、改变applicability或requiredness、引入新的capability/外部效果/安全例外，或权威证据存在冲突
- **THEN** Intake MUST展示精确目标文件、语义差异、影响和未决项并请求用户确认
- **AND** 在确认前 MUST不创建、更新或删除声明文件

#### Scenario: 用户授权写入
- **WHEN** 用户确认Preparation或Verification声明的精确长期适用性变化
- **THEN** Intake MUST把动作交给对应声明owner Skill
- **AND** owner MUST使用自己的schema、模板和Doctor校验
