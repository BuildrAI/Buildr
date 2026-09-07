## REMOVED Requirements

### Requirement: Task Overview 必须从专业 current facts 组合读取
**Reason**: Task detail 已返回 Task Record 和直接关系，Review/Verification 已有独立 inspect；Overview 没有独立事实或安全职责。
**Migration**: Buildr Web 直接从 Task detail 展示目标与结果，证据页按需调用专业 inspect；删除 `/tasks/:taskId/overview`，不提供转发。

### Requirement: Task Overview 必须返回面向用户的正交结果摘要
**Reason**: `userSummary` 重复 Task Record，且固定文案丢失真实结果、`attention` 永远为空。
**Migration**: 前端直接展示 `result.summary`，局部关注由实际 owner 返回。

### Requirement: Task Overview 与专业 inspect 必须只计算当前owner保存值
**Reason**: Overview 退役；专业 inspect 继续由各自 capability 规范约束。
**Migration**: 删除 Overview 条款，保留 Review、Verification、Parent 和复盘文档的独立读取。

### Requirement: Task轻量查询必须组合本机复盘文档摘要
**Reason**: 该行为属于 Task Record query，不属于退役 Overview capability。
**Migration**: 由 `task-record` 规范继续维护，无数据迁移。
