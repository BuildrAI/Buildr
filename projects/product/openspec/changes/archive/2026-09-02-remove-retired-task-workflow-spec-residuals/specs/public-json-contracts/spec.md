## ADDED Requirements

### Requirement: Parent启动就绪与refresh结果必须保持独立公开JSON identity
Buildr MUST为Parent启动就绪投影和planning refresh operation登记closed public JSON shape，并在Application、CLI、schema registry与checkout/npm parity中保持一致；payload MUST不暴露Review正文、SQLite locator或本机绝对路径。

#### Scenario: 读取Parent planning refresh结果
- **WHEN** caller请求公开JSON
- **THEN** payload MUST只包含Parent Coordination owner允许的事实
- **AND** MUST不包含研发回执或旧收尾字段

## REMOVED Requirements

### Requirement: Parent启动就绪与refresh结果必须登记公开JSON identity
**Reason**: payload边界仍以完整Development Receipt为当前对象。
**Migration**: Parent公开JSON只描述自身事实。
