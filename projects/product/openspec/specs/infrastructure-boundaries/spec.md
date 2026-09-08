# infrastructure-boundaries Specification

## Purpose

定义 Buildr Service 通用技术机制的唯一 Infrastructure owner、SQLite 与全局 migration 的连接/事务/锁边界、业务 Persistence 的事实所有权，以及结构迁移对公开入口和存储行为等价性的可验证约束。

## Requirements

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

### Requirement: 业务 Persistence 保留事实所有权

Task、Workspace 和其他业务模块 MUST 在所属模块的 `persistence` 中持有业务 Repository、DAO、Mapper、Row 和存储对象；Infrastructure MUST NOT 依赖或解释业务语义，也 MUST NOT 取得业务 writer authority。

#### Scenario: 业务 Repository 使用通用机制但不下沉

- **WHEN** 业务 Application 读写 Task 或 Workspace 事实
- **THEN** 调用所属模块的 Persistence Repository/DAO/Mapper，并通过 Infrastructure 提供的窄技术 capability 完成底层操作，Infrastructure 目录中不存在该业务事实的第二 Repository 或 Mapper

#### Scenario: 跨模块协作经过公开入口

- **WHEN** 一个业务模块需要另一个模块的事实
- **THEN** 通过公开 Application、Query 或 module contract 获取只读/授权能力，而不是直接导入对方 Persistence 或 Infrastructure 中的业务映射

### Requirement: 结构迁移保持公开行为和发布入口等价

Infrastructure 边界迁移 MUST 保持公开 CLI、HTTP、JSON、SQLite schema、错误映射、Application payload、npm package 入口和 Verification owner 语义等价。

#### Scenario: 公开入口行为等价

- **WHEN** 对同一 fixture 分别运行迁移前后代表性 CLI/HTTP/JSON 操作
- **THEN** 命令入口、HTTP 路由、JSON shape、错误分类和业务 writer 结果保持等价

#### Scenario: 发布物使用同一逻辑入口

- **WHEN** 构建 Application payload 或 npm candidate tarball
- **THEN** 产物继续使用正式 Buildr Service 入口和 web-dist/资源托管路径，不直接执行 development-only 源码或新增第二套 Infrastructure 实现

### Requirement: 通用 Filesystem 必须只提供技术机制
全局 Infrastructure MUST将独占文件锁、原子文件操作、Workspace mutation journal/恢复、受管区块机制、Workspace 路径技术识别与 YAML 技术解析分成少量稳定 owner。它 MUST NOT解析 CLI 参数、决定 Rule scope、维护 Workspace/Agent Assets 业务 Manifest、生成业务诊断或调用 Doctor。

#### Scenario: 扫描 filesystem exports 与消费者
- **WHEN** 架构验证检查 `src/infrastructure/filesystem`
- **THEN** 每个 export MUST属于明确的锁、原子文件、mutation、managed block、path 或 YAML 技术职责
- **AND** Workspace、Agent Assets 与 Diagnostics MUST通过窄技术调用组合自身规则
- **AND** 旧聚合业务注册函数和隐藏 runtime bridge MUST不存在

#### Scenario: 执行锁与恢复测试
- **WHEN** 测试覆盖并发锁、stale owner、fsync/rename、故障注入、journal 恢复与条件写入
- **THEN** 迁移前后的错误码、原子性、恢复条件与实际文件 effects MUST保持等价

### Requirement: 业务模块不得依赖共享运行时方法目录
业务模块 MUST通过 Bootstrap 注入的具名 Infrastructure capability、其他模块公开 capability 或 contribution 协作；MUST NOT依赖含未知方法的共享 runtime 对象，也 MUST NOT动态按方法名取得其他模块内部实现。

#### Scenario: 静态扫描跨模块依赖
- **WHEN** architecture verifier 扫描 `src/modules` 与 `src/web`
- **THEN** 跨模块 import MUST只指向对方 `module.ts` 暴露的公开类型或 capability
- **AND** 模块内部 Persistence、Infrastructure 和 Application implementation MUST不被其他模块直接导入
