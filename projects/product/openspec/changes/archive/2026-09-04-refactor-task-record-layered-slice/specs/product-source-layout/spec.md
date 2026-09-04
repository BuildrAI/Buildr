## ADDED Requirements

### Requirement: Task Record 分层实现必须保持明确文件职责
Task Record MUST在 `src/task` 的扁平技术层中分别维护领域对象、Application DTO 与用例、四个表 Repository、HTTP/CLI Interface 和唯一模块注册。Application MUST组合 Domain 与 Persistence；CLI MUST NOT直接导入 Persistence 类型或读取 Repository；HTTP MUST NOT为同形 Application DTO 保留复制 mapping。

#### Scenario: 扫描 Task Record 后端源码
- **WHEN** 架构 verifier 扫描 `src/task` 的 Task Record import graph 与文件清单
- **THEN** Domain MUST不依赖 Application、Persistence 或 Interfaces
- **AND** Interfaces MUST只通过 Application API 读取或修改 Task Record
- **AND** `task-record-http-mapping.ts` 与旧单文件 `task-record-repository.ts` MUST不存在

#### Scenario: Bootstrap 注册 Task Record
- **WHEN** `src/task/module.ts` 组装 Task Record
- **THEN** 它 MUST以同一 Structured Store 能力创建四个 Repository 和统一 Application
- **AND** 对其他模块公开的 Task Record Application 与窄兼容读取能力 MUST保持当前调用行为
