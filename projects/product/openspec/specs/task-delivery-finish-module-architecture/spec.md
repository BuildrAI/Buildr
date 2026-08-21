# task-delivery-finish-module-architecture Specification

## Purpose

定义 Task Delivery 与 Finish 集群在 `task` 模块中的技术分层、唯一组装、交付副作用边界、旧入口退出和行为等价要求。

## Requirements

### Requirement: Task Delivery 与 Finish 必须归属 Task 模块的明确技术分层
Buildr MUST 将 Task Finish、Terminal Delivery、Delivery Carrier、Adaptation、Reconciliation、Activation、Cleanup、Maintenance、Finish diagnostics、execution evidence、retained/bootstrap recovery 与 Git delivery contribution 的 Application、业务 Persistence 和适用 Interfaces 归入 `src/task` 对应技术层。复杂 Finish Application MAY 使用 `application/finish/` 私有子目录；单文件 Persistence 和 Interface MUST 保持在对应扁平技术层，旧全局目录不得保留第二份实现或转发入口。

#### Scenario: 检查生产源码归属
- **WHEN** 架构验证扫描 Task Delivery 与 Finish 生产实现
- **THEN** Finish Application 私有协作者 MUST 只存在于 `src/task/application/finish/`
- **AND** Terminal Delivery Application、Finish Repository、CLI 与 internal adapters MUST 只存在于 `src/task` 对应技术层
- **AND** 旧 `src/application/task-finish`、`src/application/task-terminal-delivery`、`src/task/persistence/finish` 与全局 Finish/Delivery interfaces MUST 不再提供同一实现

### Requirement: Task 模块入口必须唯一装配 Finish 与 Terminal Delivery
Buildr MUST 由 `src/task/module.mjs` 分别声明 Task Finish 与 Terminal Delivery 的 required capabilities、provided capabilities、CLI/internal contributions 和 lifecycle。Bootstrap MUST 按真实依赖图唯一安装两个 descriptors；Finish current writer、Terminal Delivery projection 与依赖的 Task lifecycle owner MUST 保持各自 authority，不得合并为单一 Task writer。

#### Scenario: 创建完整 Bootstrap runtime
- **WHEN** Bootstrap 安装 Task Record、Environment、Execution Record、Review、Retrospective、Verification、Development、Finish 与 Terminal Delivery modules
- **THEN** registry MUST 只登记 Task Finish 与 Terminal Delivery descriptor 各一次并满足 requires/provides
- **AND** `legacy-runtime-module.mjs` MUST 不直接注册 Finish Repository、Finish Application 或 Terminal Delivery Application

#### Scenario: 创建轻量 Finish inspect runtime
- **WHEN** CLI 执行无需完整 composition 的 `task finish inspect`
- **THEN** lightweight bootstrap MUST 组合 `src/task` 中同一 Finish Repository 与 Application 实现
- **AND** 轻量入口 MUST 不创建第二份 Finish writer或改变公开输出

### Requirement: Finish CLI 与 retained recovery 必须通过 Task 模块入口接入
Task Finish 的 `run|reconcile|inspect`、Task Delivery inspect、maintenance、retained cleanup 与 target lease drivers MUST 由 Task module CLI/internal contribution或公开 port提供。CLI Host、self-bootstrap runner、Doctor、Verification executor与package tooling MUST 不直接取得 Finish Persistence writer，也不得保留重复 route descriptor。

#### Scenario: 构建 CLI command registry
- **WHEN** CLI Host 合并 Bootstrap module contributions
- **THEN** `task finish` 与 `task delivery inspect` routes MUST 各有唯一 Task module owner
- **AND** Help、参数解析、JSON/text输出、exit code与错误映射 MUST 与迁移前等价

#### Scenario: 执行 retained recovery
- **WHEN** self-bootstrap或Finish recovery调用maintenance、retained cleanup、target lease或bootstrap recovery入口
- **THEN** 调用 MUST 解析到 `src/task/interfaces/internal` 或 Task module公开的同一 Application port
- **AND** recovery token、run identity、carrier ownership与恢复副作用 MUST保持不变

### Requirement: 交付副作用与专业 authority 必须保持隔离
Task Finish MUST 继续只消费 current Development handoff，并 MUST NOT 创建或收敛 OpenSpec Change、Content Target、Verification、Completion Review、Candidate或风险接受。Delivery Carrier、Git transition/readback、Adaptation、Reconciliation、Activation、Environment cleanup、Maintenance、diagnostics 与 Task terminal completion MUST 继续由既有唯一 owner执行。

#### Scenario: 启动正式 Finish
- **WHEN** Agent 使用 current Development handoff启动或恢复 Finish
- **THEN** Finish MUST 使用原 Candidate、generation、Content Target、gate associations与Task Contribution
- **AND** 结构迁移 MUST 不增加Formal Verification执行、不修改Development facts或创建替代交付authority

#### Scenario: 交付后维护部分失败
- **WHEN** Activation、Execution Record、Task terminal登记、Environment cleanup或carrier cleanup失败
- **THEN** 对应 attention与恢复入口 MUST保留原语义
- **AND** 已由远端readback确认的Delivery MUST不被撤销或改写为未交付

### Requirement: 迁移必须保持外部、存储、运行与发布行为等价
Task Delivery 与 Finish 迁移 MUST 保持公开 CLI、HTTP、JSON、Result/Receipt schema、SQLite schema、migration顺序与checksum、事务、锁、CAS、幂等、文件原子性、phase、diagnostic、effect、远端目标、复用/适配、恢复、激活、清理和writer authority不变。Development checkout、Application Payload与npm candidate MUST继续提供等价入口，Verification owner与服务架构文档 MUST反映新路径。

#### Scenario: 执行交付闭环
- **WHEN** checkout或npm candidate执行run、resume、reconcile、inspect、terminal delivery、maintenance、self-bootstrap与cleanup场景
- **THEN** operation、status、diagnostic、effects、JSON shape、远端证明、carrier等价和恢复结果 MUST符合既有契约
- **AND** SQLite migration集合、顺序和checksum MUST不发生变化

#### Scenario: 检查发布和验证闭包
- **WHEN** Product构建Application Payload、检查installed layout或选择changed-path verification owner
- **THEN** `src/task/**` 中 Finish 新依赖闭包 MUST被正式产物和既有verification capability覆盖
- **AND** 旧路径 MUST不存在漏包、无owner、重复owner或遗留动态引用
