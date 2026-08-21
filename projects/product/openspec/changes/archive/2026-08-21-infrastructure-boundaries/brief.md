# 收敛通用 Infrastructure 边界

## 一句话摘要

统一 Buildr Service 的通用技术机制入口，保持业务 Persistence owner、公开行为和 SQLite 执行语义不变，为后续能力模块迁移提供稳定基础。

## 背景与问题

SQLite、migration、文件系统、Git、进程、网络和平台适配当前由多个入口与 Bootstrap 组合路径共同承载，业务存储对象与技术机制边界不够清晰。重复连接、事务或读写入口会增加 migration 语义漂移、writer 冲突和后续 Child 并行修改的风险。

## 目标与非目标

目标是建立唯一 Infrastructure mechanism owner，收敛连接、migration、锁、事务和通用 adapter，并让业务 Repository、DAO、Mapper 与 Row 留在所属模块 Persistence；同步保持 Application payload、Bootstrap 和 Verification owner 一致。

非目标是不改变公开 CLI/HTTP/JSON、SQLite schema、业务规则、writer authority、migration 顺序/checksum、事务和运行副作用；不重写整个 Task/Workspace/Web 模块，也不接管 sibling buildr-web。

## 受影响用户或角色

- 维护 Buildr Service 及其 Bootstrap/Application payload 的开发者。
- 后续实施 Task、Workspace、Agent Assets、Web Runtime 和 System Child 的开发者。
- 依赖现有 CLI、HTTP、SQLite 与 Verification 语义的 Buildr 用户和自动化。

## 核心流程

Bootstrap 注册唯一 Infrastructure provider；业务模块通过窄 capability 使用 SQLite、filesystem、Git、process、network 和 platform 机制；模块 Persistence 保留业务映射与 writer；结构、迁移、公开入口和发布物测试共同证明等价。

## 关键变化

- 统一 Infrastructure 入口与 capability contract。
- 清除重复 connection、transaction、migration 和通用读写实现。
- 将业务 Persistence 从通用 Infrastructure 中明确分离。
- 更新 Bootstrap、payload、imports、Verification selectors 和相关测试。
- 保留必要兼容 Facade 的单一转发 owner 与退出条件。

## 影响、风险与兼容性

主要风险是移动入口时遗漏直接消费者，或误把业务存储对象下沉到 Infrastructure。通过 inventory、静态边界检查、migration/事务回归、CLI/HTTP/JSON 等价、payload smoke 和 Verification owner 测试降低风险。兼容性目标为公开入口、数据 schema、writer authority 与运行时副作用零变化。

## 验收摘要

所有通用机制均有唯一 owner 与注册入口；业务 Repository/DAO/Mapper/Row 位于所属模块 Persistence；无第二 connection/transaction/migration/读写实现；migration 顺序、checksum、锁、事务、幂等和原子性保持；公开 CLI/HTTP/JSON、Application payload、npm 入口与 Verification 结果等价。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Infrastructure boundaries spec](specs/infrastructure-boundaries/spec.md)
- [Implementation tasks](tasks.md)
