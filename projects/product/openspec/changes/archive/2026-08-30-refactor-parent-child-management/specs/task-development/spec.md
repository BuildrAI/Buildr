## REMOVED Requirements

### Requirement: Development Receipt 必须承载可选 Parent Plan
**Reason**: 父子协调退出固定研发与贡献执行链，改由已有任务和可读产物组织工作。
**Migration**: 原记录保留只读；使用任务关系、计划文档与显式父任务完成依据，不再调用旧写入口。

#### Scenario: 旧要求随协调流程退役
- **WHEN** 新的父子管理方式启用
- **THEN** MUST 保留历史内容只读，并停止执行本要求规定的旧协调流程

### Requirement: Development Parent Plan 必须兼容 v1 并以 v2 作为 current writer schema
**Reason**: 父子协调退出固定研发与贡献执行链，改由已有任务和可读产物组织工作。
**Migration**: 原记录保留只读；使用任务关系、计划文档与显式父任务完成依据，不再调用旧写入口。

#### Scenario: 旧要求随协调流程退役
- **WHEN** 新的父子管理方式启用
- **THEN** MUST 保留历史内容只读，并停止执行本要求规定的旧协调流程

### Requirement: Parent startup next 不得遮蔽 current Acceptance 后的 Development next
**Reason**: 父子协调退出固定研发与贡献执行链，改由已有任务和可读产物组织工作。
**Migration**: 原记录保留只读；使用任务关系、计划文档与显式父任务完成依据，不再调用旧写入口。

#### Scenario: 旧要求随协调流程退役
- **WHEN** 新的父子管理方式启用
- **THEN** MUST 保留历史内容只读，并停止执行本要求规定的旧协调流程

### Requirement: Development Handoff 必须承载实际 Contribution 事实
**Reason**: 贡献写入随旧协调链退役，研发保留独立事实。
**Migration**: 旧交接与记录保留只读；使用真实任务结果和父任务总体验收。

#### Scenario: 旧贡献写入退役
- **WHEN** 调用原贡献写动作
- **THEN** MUST 零写入返回退役说明，保留旧记录

### Requirement: Task Development 必须拥有终态 Contribution reconciliation evidence
**Reason**: 贡献写入随旧协调链退役，研发保留独立事实。
**Migration**: 旧交接与记录保留只读；使用真实任务结果和父任务总体验收。

#### Scenario: 旧贡献写入退役
- **WHEN** 调用原贡献写动作
- **THEN** MUST 零写入返回退役说明，保留旧记录

### Requirement: 终态恢复输入必须由 action contract 发现
**Reason**: 贡献写入随旧协调链退役，研发保留独立事实。
**Migration**: 旧交接与记录保留只读；使用真实任务结果和父任务总体验收。

#### Scenario: 旧贡献写入退役
- **WHEN** 调用原贡献写动作
- **THEN** MUST 零写入返回退役说明，保留旧记录

## ADDED Requirements

### Requirement: 研发必须退出父子协调写入
研发 MUST 只维护独立研发事实，不再写父计划、贡献绑定或父验收，不要求贡献交接才能交付。历史字段及历史交接 MUST 保留可读，不作为新协调前置。

#### Scenario: 直接协调
- **WHEN** 父任务维护计划与子任务关系
- **THEN** MUST 不写研发回执。

#### Scenario: 旧内部动作
- **WHEN** 调用旧父子研发写动作
- **THEN** MUST 零写入报告退役。
