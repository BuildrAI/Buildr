## ADDED Requirements

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
