## 1. Runtime 与 schema 基础

- [x] 1.1 将 Buildr Workspace runtime 和 package engine 收敛到受支持的 Node 24 LTS，并让 bootstrap、installer 与版本诊断保持一致。
- [x] 1.2 建立通用 Workspace SQLite path/connection lifecycle，启用 foreign keys、WAL、bounded busy timeout 和 canonical Workspace 写入边界。
- [x] 1.3 交付 `0000_create_migration_ledger.sql`、`0001_create_task_store.sql`，完整定义 ledger、Task tables、constraints 和 indexes。
- [x] 1.4 实现 migration discovery、连续版本校验、SHA-256 ledger、逐 script `BEGIN IMMEDIATE`/rollback 与版本超前/漂移诊断。
- [x] 1.5 将 migration `.sql` assets 纳入 npm package、package static validation 和 checkout/npm parity 验证。
- [x] 1.6 扩展 Doctor：数据库缺失为未初始化观察，存在时验证 migration identity、foreign keys 和 integrity check，且不泄露数据内容。

## 2. Task Record SQLite authority

- [x] 2.1 实现规范化 SQLite Task repository，以单 transaction 维护 `tasks`、Project/Service scope 和 Change relations，并切换 runtime composition。
- [x] 2.2 保持五个 Task Application actions、closed record schema、reference resolver 和终态语义，改用逻辑 record digest 与 transaction 内 stale-page 检查。
- [x] 2.3 让 inspect/list 在数据库不存在时零写入返回 not-found/空集合，并对 busy、schema drift、constraint 和 corruption fail closed。
- [x] 2.4 删除 filesystem Task Record repository authority，证明旧 `task.yml` 不读取、不导入、不双写、不删除，专业 sibling records 保持不变。
- [x] 2.5 补充 Unit、Component/Integration 和 System 测试，覆盖 fresh init、重复 create、CRUD、list/order、scope/reference、终态、rollback、并发陈旧写和旧文件忽略。

## 3. 客户端与 portable 边界

- [x] 3.1 将 Task CLI public result 切换到 `buildr.task-record-result/v2`，移除 canonical path/storage internals，并更新 JSON registry、fixtures、help 和 checkout/npm parity。
- [x] 3.2 更新 Local App Task API/UI 只消费 Application read model，覆盖未初始化空态、数据库不可用诊断、mutation digest 和 browser/system journeys。
- [x] 3.3 更新 Task Metadata Publication 与 writer declarations：Task Record 返回 local-only 空 path，其他 Development/Verification/Review portable paths 保持可发布。
- [x] 3.4 更新 `task-manager`、`task-triage` 及 required capability contracts/静态门禁，移除手写 YAML、canonical path 和 portable Task Record 假设，不向 Agent 暴露 SQL。
- [x] 3.5 逐一验证 Environment、Development、Review、Verification、Finish、Task-scoped Change resolver 和 lifecycle fixtures 只通过 Task Application 消费新 authority。

## 4. 当前认知与产品说明

- [x] 4.1 维护 Change Brief，并更新 Product glossary 中 Workspace Local Data Store、Workspace File Store、Workspace Structured Store 的边界。
- [x] 4.2 更新产品/技术架构与 Buildr Service current knowledge，明确 Buildr Local 单机 SQLite、Task 首个 consumer、未来 Server/Cloud 非 SQLite 同步。
- [x] 4.3 更新公开产品入口、CLI reference、known limitations 和适用实现文档，说明 Node 24、数据库位置、本地边界、Doctor 与无旧数据迁移。

## 5. 收敛前直接验证

- [x] 5.1 运行 migration focus tests，证明 script 顺序/缺口/checksum/version、原子 rollback、busy、corruption 与 package assets。
- [x] 5.2 运行 Task Record/Local App/metadata publication/lifecycle affected tests，并修复所有回归。
- [x] 5.3 运行 Buildr Product changed/affected 验证、严格 OpenSpec validation 与 current knowledge reconcile，确认所有 Change-owned tasks 已完成且可进入 convergence。
