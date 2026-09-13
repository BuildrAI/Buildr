## REMOVED Requirements

### Requirement: OpenSpec apply、sync 和 archive 必须使用单一 convergence authority
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

## ADDED Requirements

### Requirement: OpenSpec 接入必须复用上游并保持动作范围
Buildr OpenSpec contributions MUST只补充当前工作根、相关冲突检查和必要恢复；MUST保持独立同步不归档、显式归档按目标执行，不将辅助状态提升为统一工作许可。

#### Scenario: 实现或同步继续
- **WHEN** 用户继续实现或只同步规范
- **THEN** 智能体按授权动作工作，不默认升级为归档
