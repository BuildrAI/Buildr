## MODIFIED Requirements

### Requirement: Workspace 必须持有精确 Node version
Buildr MUST 在受版本控制的 Workspace metadata 中保存精确 `major.minor.patch` Node version，并 MUST 将它作为 Workspace Node identity 的唯一版本 authority。`package.json#engines.node` MUST 只表达产品兼容范围 `>=24.15.0 <25`；Agent runtime、普通 `PATH`、Task Finish 状态和机器绝对路径 MUST NOT 决定或保存 Workspace Node version。未来 Node 主版本 MUST 经过独立适配和验证后才能明确加入产品兼容范围。

#### Scenario: 解析 canonical Node 声明
- **WHEN** Buildr 读取包含 `runtime.node.version` 的 canonical Workspace metadata
- **THEN** Buildr MUST 验证版本是满足产品兼容范围的精确版本
- **AND** MUST 返回由 Workspace id、版本、platform、arch 和 identity schema 构成的稳定 Node identity

#### Scenario: 声明不合法
- **WHEN** Node version 缺失、不是精确版本或不满足 `engines.node`
- **THEN** Buildr MUST 将 Workspace Node 声明标记为 invalid 或 migration-required
- **AND** MUST NOT 从 PATH 选择另一版本并把 Workspace 视为 runtime-ready

#### Scenario: 支持已验证的 Node 24
- **WHEN** npm 或开发入口运行在 Node 24.15.0 或更高的 Node 24 版本
- **THEN** Buildr MUST 将该版本视为满足产品兼容范围
- **AND** Workspace 受管 runtime MUST 继续使用 metadata 声明的精确版本

#### Scenario: 拒绝尚未验证的未来主版本
- **WHEN** npm 或开发入口运行在 Node 25 或更高主版本
- **THEN** Buildr MUST 将该版本视为不满足当前产品兼容范围
- **AND** 错误信息 MUST 指明当前支持 Node 24.15.0 至 25 之前
