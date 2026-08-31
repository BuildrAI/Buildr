## REMOVED Requirements

### Requirement: Task Entry Snapshot 必须提供Parent-aware next
**Reason**: 父子协调退出固定研发与贡献执行链，改由已有任务和可读产物组织工作。
**Migration**: 原记录保留只读；使用任务关系、计划文档与显式父任务完成依据，不再调用旧写入口。

#### Scenario: 旧要求随协调流程退役
- **WHEN** 新的父子管理方式启用
- **THEN** MUST 保留历史内容只读，并停止执行本要求规定的旧协调流程

### Requirement: Parent startup snapshot 必须忽略预计 Child 字段
**Reason**: 父子协调退出固定研发与贡献执行链，改由已有任务和可读产物组织工作。
**Migration**: 原记录保留只读；使用任务关系、计划文档与显式父任务完成依据，不再调用旧写入口。

#### Scenario: 旧要求随协调流程退役
- **WHEN** 新的父子管理方式启用
- **THEN** MUST 保留历史内容只读，并停止执行本要求规定的旧协调流程

## ADDED Requirements

### Requirement: 父任务指引必须独立于研发准备
父任务协调指引 MUST 直接读取当前任务和子任务结果，不要求环境或研发记录，不自动执行计划审查、创建子任务或完成父任务。实际研发仍按独立专业能力执行。

#### Scenario: 无环境
- **WHEN** 父任务没有环境记录
- **THEN** MUST 能返回协调摘要与人工授权边界，不以环境缺失阻塞协调。

#### Scenario: 子任务结束
- **WHEN** 子任务全部终态
- **THEN** MUST 不自动完成父任务或返回已授权结论。
