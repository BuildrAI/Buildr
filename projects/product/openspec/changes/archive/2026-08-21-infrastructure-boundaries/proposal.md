## Why

Buildr Service 当前的 SQLite、文件系统、Git、进程、网络和平台适配入口分散在多个位置，基础设施机制与业务持久化职责边界不够明确，增加了后续模块迁移和并行开发的冲突风险。现在先收敛通用 Infrastructure，可以为 Task、Workspace 等业务能力提供唯一、可复用且可验证的技术机制，同时保留既有公开行为和存储语义。

## What Changes

- 建立统一的 Infrastructure 入口，承载 SQLite 连接、全局有序 migration、事务/锁、文件系统、Git、进程、网络、平台、clock 和 crypto 等通用机制。
- 清理散落或重复的基础设施连接、事务和读写入口；保留一个连接、事务和全局 migration 执行权威。
- 将业务 Repository、DAO、Mapper 和存储对象留在 Task、Workspace 等所属模块的 `persistence`，Infrastructure 不解析业务语义。
- 同步更新 Bootstrap 组装、Application payload、imports、Verification owner 和相关测试。
- 保持公开 CLI、HTTP、JSON、SQLite schema、migration 顺序/checksum、事务、锁、幂等、回滚和原子性语义不变。

## Capabilities

### New Capabilities

- `infrastructure-boundaries`: 定义 Buildr Service 通用技术机制的唯一 Infrastructure owner、SQLite 与全局 migration 的连接/事务/锁边界、业务 Persistence 的事实所有权，以及结构迁移对公开入口和存储行为等价性的可验证约束。

### Modified Capabilities

- 无。此 Change 不改变现有公开 CLI、HTTP、JSON 或业务数据契约。

## Impact

- 影响 `projects/product/services/buildr/src` 的 Infrastructure、Task、Workspace、Bootstrap 和 Application 组装代码，以及对应测试和 Verification selector。
- 影响 Application payload 的内部模块路径与打包入口，但不改变发布包的公开入口或运行时协议。
- 不新增运行时依赖，不改变 SQLite 表结构、migration 数据或业务 writer authority。
