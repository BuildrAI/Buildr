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
- **THEN** 这些实现 MUST 仅存在于 `src/task/` 的对应扁平技术层，并由 `src/task/module.ts` 提供单一运行时注册入口
- **AND** `src/task/domain/record/`、`src/task/application/record/` 与 `src/task/persistence/record/` MUST 不存在
- **AND** 旧全局技术层 MUST NOT 保留 Task Record 实现、re-export 或兼容 facade
- **AND** Task Record 公开 CLI/HTTP/JSON、SQLite schema、事务、错误映射和唯一 writer MUST 保持不变

#### Scenario: 已迁移模块包含单文件末级目录
- **WHEN** 架构 verifier 在模块技术层中发现只包含一个能力文件的末级目录
- **THEN** 该目录 MUST 具有多个私有协作者、真实子模块或明确实现分类之一的可验证理由
- **AND** 无上述理由的文件 MUST 位于对应技术层根目录

### Requirement: 模块必须通过显式窄合约参与组装
每个已迁移业务模块 MUST 通过根部唯一 `module.ts` 或 `module.mjs` 人工源码提供稳定 closed descriptor，显式声明有名称的 `requires`、`provides`、CLI/HTTP/diagnostic contributions和可选 lifecycle。Bootstrap MUST 显式选择依赖并装配模块，模块 MUST NOT 通过扫描、导入副作用或任意全局 Runtime lookup取得能力。

#### Scenario: Bootstrap 创建 Task Record 模块
- **WHEN** Bootstrap 装配 Task Record
- **THEN** `src/task/module.ts` MUST 只接收 Structured Workspace Store、Project/Service Reader、Change Resolver、operation memoizer和适用的 Parent Coordination Reader等已声明依赖
- **AND** 模块 MUST 提供唯一 Task Record Application API、当前兼容所需的窄 Persistence Read Port及自身 CLI/HTTP contributions
- **AND** Bootstrap、CLI Host与HTTP Host MUST NOT 直接导入 Task Record内部 Application或Persistence实现

#### Scenario: 模块声明无效
- **WHEN** 两个模块或 contributions使用重复identity、required依赖缺失、descriptor包含非法字段或 lifecycle 不完整
- **THEN** Bootstrap MUST 在执行业务命令或启动长期资源前 fail closed
- **AND** 诊断 MUST 标识冲突模块、capability或contribution identity

#### Scenario: 模块拥有生命周期资源
- **WHEN** 一个模块提供真实 `start` 与 `stop` lifecycle
- **THEN** Bootstrap MUST 按确定性注册顺序启动模块并按逆序停止
- **AND** 启动中途失败时 MUST 只逆序释放已经成功启动且由本次Bootstrap拥有的资源

### Requirement: 第二轮收敛后顶层生产职责必须全部有 owner
Buildr Service MUST将公共 contract 技术机制、release version 与 Web HTTP 职责归入明确模块 owner；Bootstrap MUST只负责模块注册、依赖注入、进程入口与生命周期组合。没有独立 owner 的顶层 `src/application`、`src/domain`、`src/interfaces` 生产残留 MUST被删除，已退役的Task internal workflow route MUST NOT保留运行入口或兼容转发。

#### Scenario: Bootstrap 进入 Task internal workflow
- **WHEN** 调用方请求已退役的内部 Task workflow route
- **THEN** Bootstrap MUST返回入口不存在且保持零副作用
- **AND** MUST NOT直接导入旧Task internal runner、维护兼容route mapping或转发到其他Task能力

#### Scenario: 扫描最终生产源码布局
- **WHEN** architecture verifier 枚举 `src` 下生产文件
- **THEN** 每个文件 MUST归属 Bootstrap、Infrastructure 或明确业务模块
- **AND** 顶层 `application`、`domain`、`interfaces` MUST不存在生产文件

#### Scenario: 复核前三个 Child owner
- **WHEN** 最终收敛验证检查 Task Execution 与 Verification 路径
- **THEN** 生产实现 MUST继续位于已交付的 Task 与 Verification owner
- **AND** 本 Change MUST NOT恢复旧顶层实现或第二 writer
