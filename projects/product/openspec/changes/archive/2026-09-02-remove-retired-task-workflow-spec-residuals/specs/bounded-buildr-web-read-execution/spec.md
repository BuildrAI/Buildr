## ADDED Requirements

### Requirement: 只读 executor 必须保持当前 Task read authority 与输入边界
Task只读executor MUST只分发当前存在的Task Overview、Environment、Review、Verification、Coordination与Retrospective read操作，并保持有界执行、取消和资源回收。

#### Scenario: 读取任务详情
- **WHEN** Buildr Web通过executor读取Task详情
- **THEN** executor MUST返回目标Application的当前read model
- **AND** MUST不读取或恢复已退役研发与旧收尾事实

## REMOVED Requirements

### Requirement: 只读 executor 必须保持 Task read authority 与输入边界
**Reason**: 场景仍要求返回Task Development和terminal association。
**Migration**: 只分发当前存在的专业read操作。
