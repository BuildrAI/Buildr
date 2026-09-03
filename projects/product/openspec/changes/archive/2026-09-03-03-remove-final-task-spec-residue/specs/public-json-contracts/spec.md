## REMOVED Requirements

### Requirement: Task Execution Record 查询必须提供稳定 portable JSON
**Reason**: Task Execution Record已整体退役。
**Migration**: 使用具体owner的Result或重新观察真实现场。

### Requirement: Execution Record recover 必须返回稳定公共 JSON
**Reason**: 通用Execution Record恢复接口已删除。
**Migration**: 由实际长流程owner提供自己的恢复事实。

### Requirement: Parent Coordination 必须只发布单一 v3 紧凑结果
**Reason**: Parent Coordination v3、Contribution和Handoff模型已退役。
**Migration**: 使用已登记的Parent Coordination v4 closed inspect响应。
