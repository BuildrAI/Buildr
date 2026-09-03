## REMOVED Requirements

### Requirement: Task Entry Snapshot 必须作为完整 package surface 交付
**Reason**: Task Entry Snapshot和`task next`已删除。
**Migration**: Agent读取Task Record、现场与适用Skill。

### Requirement: Parent Plan v2 必须在产品包中一致交付
**Reason**: Parent Plan写入和v2运行模型已退役。
**Migration**: 旧计划只在Task Record中作为只读历史。

### Requirement: Parent Coordination v3 必须原子进入全部交付入口
**Reason**: v3及其Contribution/Handoff字段已退役。
**Migration**: Package交付当前v4只读响应和生成DTO。
