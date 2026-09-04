## MODIFIED Requirements

### Requirement: 通用 Infrastructure 机制拥有唯一入口

Buildr Service SHALL 将 SQLite connection/store、普通业务 transaction、全局 migration、filesystem、Git、process、network、platform、clock 和 crypto 等通用技术机制集中在 Infrastructure，并由 Bootstrap 显式注册唯一实现；同一机制 MUST 不存在第二套长期 connection、transaction、migration 或读写实现。普通 SQLite writer MUST复用同一个同步 `TransactionManager`；Application MUST决定业务事务范围，Repository MUST只消费调用方传入的 `TransactionContext`并执行自身SQL。

#### Scenario: Bootstrap 组装唯一 Infrastructure provider

- **WHEN** Buildr Service 启动 CLI、HTTP Host 或 Application payload
- **THEN** Bootstrap 通过显式模块注册提供同一组 Infrastructure capability，所有消费者使用该组装结果，且静态结构检查不发现重复 provider 或隐式扫描注册

#### Scenario: Application 执行普通 SQLite 写事务

- **WHEN** Task Record、Task Review、Task Verification 或其他 SQLite-backed Application 需要原子修改业务数据
- **THEN** Application MUST调用注入的 `TransactionManager.run(targetRoot, action)`并在action中决定需要共同成功的Repository操作
- **AND** TransactionManager MUST解析canonical Workspace、打开writable数据库、执行`BEGIN IMMEDIATE`、同步action、`COMMIT|ROLLBACK`和关闭连接
- **AND** Repository MUST NOT自行开启、提交、回滚或嵌套业务事务

#### Scenario: 普通事务回调返回异步结果

- **WHEN** `TransactionManager` 的action返回Promise或其他thenable
- **THEN** TransactionManager MUST rollback并返回稳定的同步回调诊断
- **AND** MUST NOT在异步工作完成前提交事务

#### Scenario: 普通事务尝试嵌套

- **WHEN** TransactionManager发现当前connection已经位于transaction中
- **THEN** 第一版实现 MUST rollback本次未完成工作并明确拒绝嵌套
- **AND** MUST NOT静默复用、再次BEGIN或自动引入Savepoint

#### Scenario: SQLite migration 保持原有执行语义

- **WHEN** workspace SQLite 打开并执行全局 migration
- **THEN** migration 按既有顺序和 checksum，在既有锁、事务、幂等、回滚和原子性边界内执行，且不会创建第二个并行 migration runner
- **AND** migration MAY保留涉及ledger和`PRAGMA foreign_keys`的专用事务编排，不强制使用普通业务TransactionManager
