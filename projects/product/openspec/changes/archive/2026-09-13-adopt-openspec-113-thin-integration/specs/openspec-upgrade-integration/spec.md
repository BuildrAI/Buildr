## REMOVED Requirements

### Requirement: Buildr 只支持经过评估的 OpenSpec 集成版本
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

### Requirement: Buildr OpenSpec guard 只保留上游未提供的契约安全
**Reason**: 由上游执行与薄接入替代原阶段约束。
**Migration**: 使用本变更新定义的上游委托、相关检查及保守恢复。

## ADDED Requirements

### Requirement: OpenSpec 113 发布必须一致接入
Buildr MUST使依赖、命令声明、组件版本、支持版本、原样上游技能与完整性一致指向 OpenSpec 1.13.0，并用实际包验证标准规范、异常与恢复兼容。

#### Scenario: 升级候选验证
- **WHEN** 准备交付升级后的 Buildr 源码
- **THEN** 所有版本与源资产一致且相关检查通过；主机安装不被候选静默修改
