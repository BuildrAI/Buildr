## ADDED Requirements

### Requirement: Workspace 生命周期必须管理 Node toolchain 声明
`buildr init` MUST 首次确定并写入 Workspace Node version，`buildr sync` MUST 只消费并收敛已有声明。Node toolchain MUST 属于 Workspace Domain，并 MUST 与 Agent runtime projection 生命周期分离。

#### Scenario: 初始化新 Workspace
- **WHEN** Agent 使用受支持 Node 执行 `buildr init`
- **THEN** Buildr MUST 将当前 CLI 的精确 Node version 写入 canonical Workspace metadata
- **AND** MUST 在 init 成功前准备并验证对应受管 runtime

#### Scenario: 同步已有 canonical Workspace
- **WHEN** Workspace 已声明精确 Node version 并执行 `buildr sync <agent>`
- **THEN** Buildr MUST 在 render Agent runtime 前收敛该 Node runtime
- **AND** MUST NOT 允许 adapter 选择、保存或修改 Node version

#### Scenario: 迁移缺少声明的已有 Workspace
- **WHEN** 旧 Workspace metadata 没有 Node 声明且执行显式 `sync`
- **THEN** Buildr MUST 把当前受支持 CLI Node 的精确版本作为一次性 migration 写入并报告 changed path
- **AND** 后续 sync MUST 只恢复该版本，不得再次选择
