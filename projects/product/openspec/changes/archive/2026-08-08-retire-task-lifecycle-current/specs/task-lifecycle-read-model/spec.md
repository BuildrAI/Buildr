## REMOVED Requirements

### Requirement: Task lifecycle current read model 必须由生命周期动作维护
**Reason**: 跨专业持久化投影是重复 current authority，已发生与专业 Environment row 漂移。
**Migration**: 专业 action 只写所属 current row；Development applicability 与查询字段由新连续 migration/专业 writer 保存。

### Requirement: lifecycle read model 必须保留跨专业读取所需的终态摘要
**Reason**: Task、Environment 与 Finish terminal facts 已分别存在于唯一专业表，重复摘要没有独立价值。
**Migration**: Task Overview 联表读取摘要，terminal delivery 直接读取 compact Finish completion。

### Requirement: lifecycle read model 读取必须是纯 SQLite 查询
**Reason**: 纯 SQLite 读取边界继续保留，但不再依赖独立 lifecycle table。
**Migration**: 由新增的 Task Overview 与专业 inspect 保存值读取 Requirements 接替。

### Requirement: lifecycle snapshot 必须明确观察时间和陈旧边界
**Reason**: 观察时间和陈旧边界必须由拥有观察语义的专业 current row表达，而不是跨模块副本。
**Migration**: Development 保存 applicability/observedAt；Environment、Review、Verification 与 Finish 使用自己的保存时间和 identity。

### Requirement: 生命周期 read model 必须保存 terminal association snapshot
**Reason**: Finish completion 已保存同一 terminal association，第二份 snapshot 会漂移并扩大 Finish 成功门槛。
**Migration**: 升级时核验 lifecycle association 均有 matching completion 后删除副本；无法证明时 fail closed。
