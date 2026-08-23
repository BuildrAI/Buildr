## ADDED Requirements

### Requirement: Buildr Web instance lifecycle 的公开说明不得泄漏旧产品名
instance、health、启动、停止和生命周期诊断的公开说明 MUST 使用 Buildr Web Runtime 术语；已发布 instance/health schema identity MUST 保持稳定并继续被 reader 接受。

#### Scenario: 读取运行状态
- **WHEN** CLI 或 Web 读取 Buildr Web instance/health 状态
- **THEN** 可见产品名 MUST 为 Buildr Web
- **AND** 旧 `buildr.local-app-*` schema identity MUST 仍可验证

