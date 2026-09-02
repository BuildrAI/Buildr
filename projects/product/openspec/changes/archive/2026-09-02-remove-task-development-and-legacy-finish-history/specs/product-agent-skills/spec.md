## ADDED Requirements

### Requirement: Package 不得投射 Task Development 或旧 Finish Skill 依赖
Buildr package MUST不再提供`task-development` Skill、`buildr.task-development` contract/provider/binding，也 MUST不在OpenSpec、Current Knowledge、Release或Task Skills中要求Task Planning Identity、Development Receipt、Task Candidate或旧Finish Application。

#### Scenario: 初始化或同步Workspace
- **WHEN** current package向Agent runtime投射Skills与capability bindings
- **THEN** 输出 MUST不存在Task Development Skill、contract、provider或consumer dependency
- **AND** OpenSpec、Review、Verification、Environment与默认task-finish MUST保持可发现

## REMOVED Requirements

### Requirement: Task Development Skill不得编排Task Verification
**Reason**: Task Development Skill整体删除。
**Migration**: Task Verification继续由自己的Skill指导Agent。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入
