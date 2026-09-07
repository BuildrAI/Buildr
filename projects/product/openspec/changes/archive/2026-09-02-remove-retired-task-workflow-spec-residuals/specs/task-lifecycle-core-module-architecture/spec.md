## ADDED Requirements

### Requirement: Task核心迁移必须保持当前外部行为等价
Task module结构变化 MUST保持Task Record、Environment、Review、Verification、Retrospective、Overview与Parent Coordination的公开行为、持久化和package/runtime parity；已退役模块不属于兼容范围。

#### Scenario: checkout与npm candidate执行当前Task能力
- **WHEN** 两种入口执行同一当前Task操作
- **THEN** 输出、写入与错误语义 MUST等价
- **AND** MUST不装配退役descriptor或compatibility port

## REMOVED Requirements

### Requirement: 核心迁移必须保持 Finish 集群边界与兼容入口可退出
**Reason**: 把旧Finish集群描述为仍在迁移的当前能力。
**Migration**: 旧Finish集群已直接删除。

### Requirement: 核心迁移必须保持外部、持久化与发布行为等价
**Reason**: 验收场景仍执行Development与Planning Identity。
**Migration**: 只验证当前存在的Task能力。
