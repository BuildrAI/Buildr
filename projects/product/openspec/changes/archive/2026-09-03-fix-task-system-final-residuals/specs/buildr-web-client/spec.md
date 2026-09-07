## MODIFIED Requirements

### Requirement: Buildr Web 必须只提交显式协调动作
Buildr Web MUST只通过Task Record Application提交用户明确触发的关系更新、普通任务完成或带完整验收与授权的父任务完成；不得自动创建、完成或abandon Child，不得自动改写Change，也不得维护Parent Plan reconciliation。

#### Scenario: 用户确认Parent reconciliation
- **WHEN** 用户基于current Task Record与父子快照提交完整验收和明确授权
- **THEN** UI MUST展示Application实际结果或冲突
- **AND** 后续Child专业动作与状态 MUST保持独立

## REMOVED Requirements

### Requirement: Buildr Web 必须展示统一与分专业 execution record 视图
**Reason**: Task Execution Record 与旧 Finish current 已整体退役，当前页面只展示 Task Record、Review、Verification、父任务协调和复盘文档。

**Migration**: 任务目标/结果使用 Task Record；审查与验证使用各自独立证据卡片。

#### Scenario: 打开当前 Task 详情
- **WHEN** 用户打开 Task 详情
- **THEN** Web MUST不请求或展示 Execution Record 浏览器
- **AND** MUST按需读取当前仍存在的专业事实

### Requirement: Buildr Web 必须按需展示受限正文
**Reason**: 该正文读取要求专属于已退役 Execution Record body API。

**Migration**: 保留 Task Record 拥有的固定复盘 Markdown 只读接口；不提供任意执行正文读取。

#### Scenario: 请求旧执行正文
- **WHEN** 客户端请求旧 Execution Record body route
- **THEN** HTTP MUST返回 route 不存在
- **AND** MUST不扫描或猜测本机路径
