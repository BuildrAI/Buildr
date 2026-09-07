## ADDED Requirements

### Requirement: Package 必须原子交付独立 Task Review authority
Buildr package MUST原子交付`buildr.task-review@2` contract、provider、binding、Application、SQLite current slots、CLI/HTTP与专项验证，且 MUST不要求Task Development能力存在。

#### Scenario: 安装或升级Task Review
- **WHEN** package投射Task Review资产
- **THEN** Review能力 MUST独立ready
- **AND** Skills manifest MUST不登记Task Development依赖

### Requirement: self-bootstrap activation evidence必须保持无旧收尾authority
self-bootstrap activation MUST报告实际输入、动作、push/readback、开发入口identity和最终Doctor。该报告 MUST保持response-only，不得写入SQLite、Task Record、Review、Verification或新的聚合store。

#### Scenario: 直接交付后执行自举同步
- **WHEN** matching Task成果已由Git证明交付
- **THEN** self-bootstrap MUST依据当前Git和retained checkout执行适用动作
- **AND** MUST不读取旧Finish Result或研发回执

### Requirement: Package 必须原子交付独立 Parent coordination 能力
Buildr package MUST原子交付Parent Coordination Domain、Application、Task-owned历史字段、CLI/HTTP/public JSON、Buildr Web与专项验证，且 MUST不保留Development Receipt兼容。

#### Scenario: 构建Parent coordination package
- **WHEN** package检查Parent能力闭环
- **THEN** schema、registry、source/package/runtime parity与Application接线 MUST一致
- **AND** Parent只读历史 MUST来自Task-owned迁移字段

## REMOVED Requirements

### Requirement: Package 必须原子交付 Task Review authority
**Reason**: 仍要求Skills manifest登记Task Development。
**Migration**: Review独立交付。

### Requirement: self-bootstrap activation evidence必须逐动作可诊断且不建立新authority
**Reason**: 仍使用post-Finish、Development Receipt和Finish JSON作为当前边界。
**Migration**: 直接交付后按Git与retained checkout执行。

### Requirement: Package 必须原子交付 Parent coordination 能力
**Reason**: 仍要求Development Receipt major兼容。
**Migration**: Parent只消费Task-owned事实。
