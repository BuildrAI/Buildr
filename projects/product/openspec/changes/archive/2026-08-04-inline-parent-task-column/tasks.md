## 1. SQLite Schema

- [x] 1.1 新增连续 `0003` migration，把 Parent foreign key 内联到 `tasks.parent_task_id`、复制 v2 关系、删除关系表并建立主表索引
- [x] 1.2 更新 package migration 静态校验，确保 latest Schema 明确包含内联列且不包含旧关系表

## 2. Repository

- [x] 2.1 将 Task Record 读取、写入、Children 查询和祖先遍历切换到 `tasks.parent_task_id`
- [x] 2.2 保持 transaction、digest、错误诊断和 Parent/Child 公共 read model 不变

## 3. Tests

- [x] 3.1 覆盖 fresh database 的 latest table/column/index/ledger 结构
- [x] 3.2 覆盖 version 1 与 version 2 database 升级到 latest Schema，并验证 v2 Parent/Child 关系保留
- [x] 3.3 运行 Task Record focused tests，确认创建、重设、清除、循环保护和生命周期独立性无回归

## 4. Current Knowledge

- [x] 4.1 更新 Brief、技术架构、Buildr Service 数据说明和任务生命周期架构讨论稿
- [x] 4.2 核对术语不变，记录 knowledge impact 并完成 reconcile

## 5. Validation and Convergence

- [x] 5.1 运行 OpenSpec strict/proposal contract checks 与相关 focused tests
- [x] 5.2 完成 Change checklist，并通过确定性 convergence 同步 canonical spec、归档 Change
