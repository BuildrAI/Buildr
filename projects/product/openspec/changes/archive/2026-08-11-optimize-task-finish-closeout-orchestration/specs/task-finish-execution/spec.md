## ADDED Requirements

### Requirement: Task Finish Result 必须报告只读解析上下文
`buildr.task-finish-result/v2` MUST以additive `resolvedContext`报告本次run从既有Task、Development handoff、Environment和delivery target事实中解析出的最小上下文，包括`buildr.task-finish/v1` capability identity、Task/handoff/Candidate/Content Target identity、Agent、target branch、remote、Workspace Node identity与该集合的确定性identity。`resolvedContext` MUST只由产品生成，不得作为run输入、可编辑execution capsule、独立数据库列、Receipt、恢复manifest或第二authority。

#### Scenario: 新run形成解析上下文
- **WHEN** `task finish run`通过入口readiness并创建新的Finish run
- **THEN** run与后续inspect/terminal Result MUST返回由同一run identity确定性形成的`resolvedContext`
- **AND**调用方 MUST不需要提交contract版本、handoff、Environment、Candidate或delivery plan

#### Scenario: inspect读取terminal Result
- **WHEN**调用方按run id inspect已完成或blocked的Finish Result
- **THEN** `resolvedContext` MUST与该run采用的identity保持一致
- **AND** reader MUST NOT重新解释当前Task、Environment或后续变化来改写历史解析上下文

#### Scenario: 读取缺少字段的既有v2 Result
- **WHEN** Workspace中存在本变更前写入且没有`resolvedContext`的合法`buildr.task-finish-result/v2`
- **THEN**兼容reader MUST允许该字段为null或按已保存run identity只读派生
- **AND** MUST NOT迁移历史Result、建立补写任务或把缺失字段解释为交付失败
