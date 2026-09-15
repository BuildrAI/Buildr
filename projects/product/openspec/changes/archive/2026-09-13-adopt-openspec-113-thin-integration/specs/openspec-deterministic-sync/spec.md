## REMOVED Requirements

### Requirement: Sync planner必须证明唯一结果
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: Deterministic operation必须使用保守白名单
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: Sync apply必须原子且identity-bound
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: Deterministic sync必须提供Agent fallback证据
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: Deterministic apply必须在提交前验证完整expected Project
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: 新capability Purpose必须来自明确authority
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: Convergence observer必须根据真实文件恢复
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: Convergence transaction必须确认后单独归档
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: 历史收敛接口必须按零消费者门禁退役
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: 全部 Requirements 清退必须删除 canonical capability spec
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: OpenSpec Convergence Receipt必须只承担事务期恢复
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: OpenSpec 收敛必须提供事务期只读检查
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: OpenSpec Converge 必须明确使用 Task execution root
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: Deterministic planner必须提供只读语义就绪预检
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: 语义就绪结果必须绑定当前完整观察
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: Convergence transaction 必须在任何写入前检查 Change checklist
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

## ADDED Requirements

### Requirement: 标准规范转换与归档由锁定上游执行
Buildr MUST委托经过验证的 OpenSpec 1.13.0 处理标准规范解析、重建和归档写入；MUST NOT在正常路径复制标准规范转换算法或默认执行前后两次全项目验证。

#### Scenario: 正常归档
- **WHEN** 已授权归档且相关冲突检查通过
- **THEN** 系统调用锁定上游完成规范写入和归档，并报告真实结果

### Requirement: 跨进程恢复必须依据当前文件
Buildr MUST保留中断前观察与必要恢复信息；重试 MUST复查当前文件与原操作范围，未知混合状态 MUST保持内容并报告 recovery-unprovable。旧恢复材料 MUST保持可诊断，MUST NOT被新成功声明覆盖。

#### Scenario: 中断后存在并发修改
- **WHEN** 原操作中断且文件已经被其他参与者修改
- **THEN** 系统保留当前文件并指出差异，不自动恢复旧内容
