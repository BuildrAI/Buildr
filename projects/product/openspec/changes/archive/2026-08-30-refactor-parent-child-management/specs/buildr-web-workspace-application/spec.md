## REMOVED Requirements

### Requirement: Parent coordination 接口必须共享同一 Application
**Reason**: 父子协调退出固定研发与贡献执行链，改由已有任务和可读产物组织工作。
**Migration**: 原记录保留只读；使用任务关系、计划文档与显式父任务完成依据，不再调用旧写入口。

#### Scenario: 旧要求随协调流程退役
- **WHEN** 新的父子管理方式启用
- **THEN** MUST 保留历史内容只读，并停止执行本要求规定的旧协调流程

## ADDED Requirements

### Requirement: 父任务界面必须展示成果和明确完成确认
Buildr Web MUST 展示整体目标、计划入口、实际子任务及结果、独立父任务状态和完成依据；父任务完成确认 MUST 展示所观察范围，要求总体验收说明、子任务处置和明确确认，再通过同一任务应用写入。

#### Scenario: 旧父任务
- **WHEN** 有子任务但没有旧专用计划
- **THEN** MUST 仍显示子任务结果和父任务完成确认。

#### Scenario: 明确确认
- **WHEN** 用户阅读当前结果后确认完成父任务
- **THEN** MUST 提交当前观察身份、验收与界面授权来源；不递归修改子任务。

#### Scenario: 冲突
- **WHEN** 提交前其他入口改变结果
- **THEN** MUST 显示冲突并刷新，旧确认不自动重放。

#### Scenario: 历史完成
- **WHEN** 旧完成结果没有授权依据
- **THEN** MUST 如实展示历史未记录，不补造授权。
