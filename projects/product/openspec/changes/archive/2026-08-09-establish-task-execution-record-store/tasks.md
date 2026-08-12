## 1. Domain 与 SQLite authority

- [x] 1.1 实现 execution record closed Domain、owner/kind、状态组合、固定quota/retention常量与eligibility规则。
- [x] 1.2 新增下一连续SQLite migration和repository，覆盖唯一open、quota reservation、seal、resolution、cleanup CAS与读取索引。

## 2. 受限正文 Store 与 Application

- [x] 2.1 实现版本化redactor、closed body files、4 MiB/16 MiB安全截断、path/symlink/regular-file防护及staging/atomic publish。
- [x] 2.2 实现Task Execution Record Application的open、seal、inspect/list、resolution与单记录cleanup，并注册composition；不增加CLI或producer接线。

## 3. 验证与迁移覆盖

- [x] 3.1 增加Domain/正文Store Unit tests与Application/repository Integration tests，覆盖secret/path、quota、幂等、部分失败、retention和tombstone。
- [x] 3.2 扩展Workspace SQLite migration tests，覆盖fresh schema、从每个旧ledger连续升级、FK/closed checks/rollback且不恢复`task_lifecycle_current`。

## 4. 当前认知与Change收敛

- [x] 4.1 对齐Brief、technical architecture、Buildr Service说明与glossary中的四类治理、execution record authority及无Consumer/Adoption边界。
- [x] 4.2 运行targeted tests、`openspec validate --strict`、affected Product验证与current knowledge inspect，并通过deterministic convergence/archive使Change ready交付。
