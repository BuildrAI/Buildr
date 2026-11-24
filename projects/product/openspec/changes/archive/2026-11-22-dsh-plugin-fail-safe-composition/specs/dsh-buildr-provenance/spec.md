## ADDED Requirements

### Requirement: 宿主不兼容时来源增强自动降级为原生模式
当增强组合因宿主契约不兼容、激活失败回滚或启动熔断器触发而未接管官方核心模块时，系统 MUST 保留官方模块运行并公开表达降级状态：
- `buildrCompositionRuntime.status()` MUST 返回 `state: 'degraded'`、明确的 `reason`（`incompatible-host | activation-failed | circuit-breaker`）以及不泄露凭据或本机绝对路径的诊断摘要；
- 宿主激活状态（`activation`）在网关仍有效时可附带结构化 `compositionDegraded` 提示，正常激活时保持原结构不变；
- 降级模式 MUST NOT 改写现有持久化会话与历史来源事件，且不得误停用或挂起官方根模块及客户端模块。

#### Scenario: 降级模式下查询组合状态并保留原会话
- **WHEN** 宿主不兼容导致增强组合降级为原生模式
- **THEN** `buildrCompositionRuntime.status()` 返回 `state: 'degraded'` 与具体 `reason`，且不含凭据或本机绝对路径
- **AND** 原有持久化会话、未采集记录和原生组件继续正常工作，薄网关入口保持激活
