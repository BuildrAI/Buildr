## ADDED Requirements

### Requirement: Task execution record metadata 必须使用独立有界 SQLite schema
Workspace Structured Store MUST在已退役`task_lifecycle_current`的current migration ledger上，通过下一连续migration建立单张STRICT `task_execution_records`表。该表 MUST以非级联foreign key绑定`tasks(task_id)`，保存closed record/Task identity、owner/kind/run/target/producer、outcome、lifecycle/resolution/body/quota状态、relative locator、digest、stored/original size、truncated、redaction version、reservation与必要retention/cleanup时间事实，并使用稳定唯一键与Task timeline、recent retention、quota/cleanup查询所需indexes。Structured Store MUST NOT建立Consumer/Adoption关系、BLOB/任意JSON payload、通用event/audit/history、execution resource、`task_facts`或新的Task lifecycle聚合表。

#### Scenario: fresh Workspace初始化execution record schema
- **WHEN**current runtime首次writable打开新的canonical Workspace Structured Store
- **THEN**连续migration MUST建立`task_execution_records`、closed checks、foreign key、唯一键与查询indexes
- **AND**MUST NOT创建第二数据库、正文表、通用metadata表或`task_lifecycle_current`

#### Scenario: 从migration 0010连续升级
- **WHEN**健康数据库已应用到`0010_add_task_retrospective_disposition.sql`
- **THEN**migration runner MUST按package中的下一连续script原子建立execution record schema并登记matching checksum
- **AND**MUST NOT修改任何既有migration bytes、迁移旧YAML/临时文件或补造历史record

#### Scenario: row违反closed状态组合
- **WHEN**repository尝试保存未知owner/kind/status、open terminal outcome、retained缺失body identity或cleaned仍保留locator/quota charge
- **THEN**SQL CHECK与Domain normalization MUST拒绝mutation并rollback
- **AND**其他Task records与专业current rows MUST保持不变

#### Scenario: Task进入终态后读取record
- **WHEN**completed或abandoned Task仍有未到期execution record或cleaned tombstone
- **THEN**Structured Store MUST继续允许Application读取和按retention处理它们
- **AND**Task terminal transition MUST NOT级联删除record metadata或body
