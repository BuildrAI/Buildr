## ADDED Requirements

### Requirement: 预览实例可见共享登记工作空间
Preview 实例 MUST 在保留自身独立 Workspace registry 的同时，向查询方提供共享 Profile 登记列表的只读视图；共享条目标记来源，移除或其他登记写操作 MUST 不作用于共享登记文件。该可见性 MUST NOT 改变预览实例记录、启动锁或自身登记列表的独立边界。

#### Scenario: 预览展示共享登记条目
- **WHEN** 共享 Profile 登记列表已包含真实 Workspace，任一健康的 Task 或 standalone Preview 查询登记列表
- **THEN** 结果 MUST 合并共享条目并标注其只读来源，同时保留本预览自身登记条目
- **AND** 预览自身登记文件与共享登记文件 MUST 各自保持独立
