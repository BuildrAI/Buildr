## Context

Buildr Service 已有 `src/infrastructure`、业务模块和 Bootstrap，但部分 SQLite Repository、文件/进程/Git 适配和运行时入口由不同层直接装配，导致技术机制的复用边界和业务 Persistence owner 不够清晰。本 Child 只处理 Buildr Service 内部结构与组装，不改变 Product、Buildr Web sibling 或公开协议。

## Goals / Non-Goals

**Goals:**

- 形成单一的 Infrastructure 技术机制入口：SQLite connection/store、全局 migration runner、filesystem、Git、process、network、platform、clock 和 crypto。
- 让模块 Repository、DAO、Mapper、Row/value objects 继续由所属业务模块的 `persistence` 持有，并通过窄接口消费底层机制。
- 以显式 Bootstrap registration 组装 Infrastructure，清理重复连接、事务和通用读写实现。
- 迁移过程中保持 migration 顺序、checksum、事务、锁、幂等和原子性，并为结构边界增加静态/集成回归检查。

**Non-Goals:**

- 不改变业务表、SQLite schema、公开 CLI/HTTP/JSON、错误映射或 writer authority。
- 不把业务 Repository 搬入 Infrastructure，不重写 Task、Workspace 或 Web Runtime 的完整能力模块。
- 不引入新的 DI 框架、运行时转换、第二套 connection/transaction store 或长期兼容双写。

## Decisions

1. **Infrastructure 只提供机制，不解释业务。**
   - 选择统一底层 adapter 与 lifecycle，而不是把每个业务 Repository 继续作为基础设施入口。
   - 业务模块通过 `persistence` 内的 Repository/DAO/Mapper 使用通用机制；Infrastructure 不依赖 Task、Workspace、Agent Assets、Web 或 Doctor 语义。
   - 备选方案：将所有业务 DAO 集中到 `infrastructure/sqlite`，被否决，因为这会转移事实 owner 并制造跨模块隐式 writer。

2. **SQLite connection 与全局 migration 保持单一权威。**
   - 复用现有 workspace SQLite 打开、锁、事务和 migration 算法，仅移动/收敛入口与注册位置；全局 migration 仍按既有顺序和 checksum 执行。
   - 业务 Persistence 只获得已组装的 connection/transaction capability，不直接创建第二连接或执行全局 migration。
   - 备选方案：每个模块独立数据库/迁移目录，被否决，因为会破坏锁、顺序、checksum 和原子提交语义。

3. **兼容期采用窄 Facade，且只保留一个 owner。**
   - Bootstrap 可暂时保留旧模块注册名作为转发，但转发只指向新 Infrastructure provider；不复制实现，不允许新调用方依赖宽 runtime。
   - 当所有直接消费者迁移并由测试证明后删除旧入口。

4. **验证采用结构 + 行为双重证据。**
   - 静态检查验证 imports、模块 owner、唯一注册和无重复机制入口。
   - 现有 migration、SQLite、CLI/HTTP、Application payload、Verification owner 测试继续运行，比较关键身份和公开输出，证明结构变化没有改变行为。

## Risks / Trade-offs

- [Risk] SQLite 注册或事务边界移动时漏掉隐式消费者 → Mitigation：先建立 import/registration inventory，保持单一 Bootstrap composition，并运行 migration/锁/事务回归测试。
- [Risk] 误把业务存储对象归入 Infrastructure → Mitigation：对每个 Repository/DAO/Mapper 标记业务 owner，结构检查拒绝 Infrastructure 依赖业务模块。
- [Risk] 旧 Facade 形成长期双实现 → Mitigation：记录直接消费者和退出条件，测试只允许 Facade 转发到唯一实现，Child handoff 标记残留入口。
- [Risk] 发布 payload 与 development checkout 路径不一致 → Mitigation：更新 payload manifest/构建选择器并执行 package/application payload smoke，保持 npm 入口不变。
