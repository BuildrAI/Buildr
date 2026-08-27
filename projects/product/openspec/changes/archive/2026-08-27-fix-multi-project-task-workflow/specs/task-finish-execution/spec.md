## ADDED Requirements

### Requirement: shared Environment的交付对账必须恢复repository context
当matching Task Environment为ready但因shared placement没有Git provider repository set时，delivery reconciliation MUST保留该Environment的execution与cleanup事实，并从current immutable handoff、Task scope、registries和真实Git topology重建只读repository delivery context。该fallback MUST只用于reconciliation；自动Finish MUST继续要求适用的受管repository set。

#### Scenario: ready shared Environment没有repositories
- **WHEN** delivery reconciliation读取到ready shared Environment且`repositories`为空，但handoff scope可唯一解析真实Git repositories、remote与target
- **THEN** reconciliation MUST重建repository plans并验证真实remote containment
- **AND** MUST不返回`task_finish.repository_set_missing`、修改Environment Receipt或创建Delivery Carrier

#### Scenario: shared context存在仓库歧义
- **WHEN** handoff scope映射到多个无法唯一选择的Git root、branch或remote
- **THEN** reconciliation MUST零写入返回对应repository identity diagnostic
- **AND** MUST不把shared Environment ready当作delivery proof

#### Scenario: 自动Finish使用shared Environment
- **WHEN** 调用方请求自动Finish而ready Environment没有受管repository set
- **THEN** 自动Finish MUST保持blocked并要求选择合法Delivery路径
- **AND** MUST不借用reconciliation fallback创建或修改carrier
