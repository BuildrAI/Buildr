## REMOVED Requirements

### Requirement: Buildr 维护 OpenSpec change 契约基线
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: Proposal capability、delta 与基线保持一致
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: 同一 Requirement 的活动 change 冲突必须阻塞
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: 陈旧 Requirement 基线必须阻塞同步
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: 同步结果必须符合 delta 且保持未触达契约
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: OpenSpec 契约门禁提供稳定 CLI 和 Agent-readable 输出
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: 未验证的 OpenSpec 上游版本不得绕过门禁
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: OpenSpec 契约 sidecar 原子写入
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: Contract guard必须与sync receipt共享identity
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: Convergence receipt必须持久化阶段恢复证据
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: OpenSpec delta identity 必须独立于 checkout 位置
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: OpenSpec Contract Guard必须前置语义就绪门禁
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: Semantic readiness preflight必须保持无持久副作用
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

## ADDED Requirements

### Requirement: 前置检查只保护当前相关变更
Buildr MUST提供只读 preflight，解析真实工作根和锁定上游版本，使用上游解析检查同一规范条目的活跃变更冲突。已证明无关的损坏变更 MUST只形成提醒；无法确定重叠范围时 MUST保守报告具体缺口。

#### Scenario: 无关变更损坏
- **WHEN** 另一变更不触及本次规范且其正文校验失败
- **THEN** 当前相关检查可继续并附带提醒

### Requirement: 同步与归档必须保持动作边界
Buildr MUST保留独立同步与归档的区别；sync 接入 MUST NOT调用包含归档副作用的 converge。converge MUST只在归档属于授权目标时执行，inspect MUST只读取恢复现场。

#### Scenario: 只要求同步
- **WHEN** 用户要求更新主规范并保留当前变更
- **THEN** 系统保持变更 active，不调用归档
