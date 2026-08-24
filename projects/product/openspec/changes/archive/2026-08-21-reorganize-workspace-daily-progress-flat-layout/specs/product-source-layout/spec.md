## MODIFIED Requirements

### Requirement: Product 源码必须按职责和依赖方向分层
Buildr `src/` MUST 优先按真实业务或产品模块组织已迁移能力，并在模块内部使用 `domain/`、`application/`、`persistence/` 和 `interfaces/` 表达技术职责；跨模块平台能力与尚未迁移的能力 MAY 在渐进迁移期间继续位于明确的全局技术层。模块的每个技术层 MUST 默认扁平，并 MUST 由文件名表达具体能力；只有某项能力包含多个需要独立维护的私有协作者、构成真实子模块或存在明确实现分类时，才允许建立末级能力目录。Buildr MUST 保持接口调用应用用例、应用组合领域与持久化能力、纯领域模型不依赖 adapters 的显式边界，并 MUST NOT 为目录对称创建空层、单文件能力目录、重复实现或旧路径兼容 facade。

#### Scenario: CLI 或本机应用调用 Workspace 用例
- **WHEN** CLI、HTTP 或 Web adapter 读取或修改 Workspace
- **THEN** interface MUST 调用所属模块或现有 `application` 暴露的用例
- **AND** domain MUST NOT 导入 CLI、HTTP、Web、filesystem、process、runtime、persistence 或测试模块
- **AND** application MUST NOT 依赖具体 interface implementation

#### Scenario: 迁移带文件操作的旧领域 handler
- **WHEN** 旧模块同时包含用例编排、filesystem 读取或 mutation
- **THEN** 用例编排 MUST 进入所属模块的 application owner，而不是仅因旧目录名进入 `domain/`
- **AND** filesystem 或数据库映射 MUST 进入所属模块的 persistence，或继续使用具有明确跨模块职责的 infrastructure adapter
- **AND** Product MUST NOT 为目录对称创建没有真实模型职责的空 domain 层

#### Scenario: 架构 verifier 扫描 imports
- **WHEN** Product 验证检查全局技术层与模块内部的 `src/` import graph
- **THEN** verifier MUST 按文件的真实技术职责拒绝反向依赖、循环依赖和绕过 application composition 的跨模块隐式调用
- **AND** 诊断 MUST 标识违规 source 与 target module

#### Scenario: Task Record 作为首个纵向切片完成迁移
- **WHEN** 架构 verifier 检查 Task Record 的 Domain、Application、Persistence、CLI/HTTP Adapter 和模块注册入口
- **THEN** 这些实现 MUST 仅存在于 `src/task/` 的对应扁平技术层，并由 `src/task/module.mjs` 提供单一运行时注册入口
- **AND** `src/task/domain/record/`、`src/task/application/record/` 与 `src/task/persistence/record/` MUST 不存在
- **AND** 旧全局技术层 MUST NOT 保留 Task Record 实现、re-export 或兼容 facade
- **AND** Task Record 公开 CLI/HTTP/JSON、SQLite schema、事务、错误映射和唯一 writer MUST 保持不变

#### Scenario: 已迁移模块包含单文件末级目录
- **WHEN** 架构 verifier 在模块技术层中发现只包含一个能力文件的末级目录
- **THEN** 该目录 MUST 具有多个私有协作者、真实子模块或明确实现分类之一的可验证理由
- **AND** 无上述理由的文件 MUST 位于对应技术层根目录

