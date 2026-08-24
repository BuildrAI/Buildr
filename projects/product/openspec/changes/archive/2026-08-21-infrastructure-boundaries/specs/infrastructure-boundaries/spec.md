## ADDED Requirements

### Requirement: 通用 Infrastructure 机制拥有唯一入口

Buildr Service SHALL 将 SQLite connection/store、全局 migration、filesystem、Git、process、network、platform、clock 和 crypto 等通用技术机制集中在 Infrastructure，并由 Bootstrap 显式注册唯一实现；同一机制 MUST 不存在第二套长期 connection、transaction、migration 或读写实现。

#### Scenario: Bootstrap 组装唯一 Infrastructure provider

- **WHEN** Buildr Service 启动 CLI、HTTP Host 或 Application payload
- **THEN** Bootstrap 通过显式模块注册提供同一组 Infrastructure capability，所有消费者使用该组装结果，且静态结构检查不发现重复 provider 或隐式扫描注册

#### Scenario: SQLite migration 保持原有执行语义

- **WHEN** workspace SQLite 打开并执行全局 migration
- **THEN** migration 按既有顺序和 checksum，在既有锁、事务、幂等、回滚和原子性边界内执行，且不会创建第二个并行 migration runner

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
