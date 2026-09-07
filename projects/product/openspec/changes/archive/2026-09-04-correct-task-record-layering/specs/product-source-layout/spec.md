## MODIFIED Requirements

### Requirement: Task Record 分层实现必须保持明确文件职责
Task Record MUST在`src/task`的扁平技术层中维护普通Domain数据类、Application DTO与用例、四个单表Repository、HTTP/CLI Interface和唯一模块注册。Infrastructure MUST提供唯一普通SQLite TransactionManager；Application MUST拥有业务规则、完整DTO组装和事务范围并直接组合四个Repository；CLI/HTTP MUST只调用Application。Domain MUST不包含协议解析或业务流程，Repository MUST不调用其他Repository或管理transaction，HTTP MUST不为同形Application DTO保留复制mapping。

#### Scenario: 扫描 Task Record 后端源码
- **WHEN** 架构 verifier 扫描 `src/task` 的 Task Record import graph 与文件清单
- **THEN** Domain MUST不依赖Application、Persistence、Interfaces或Infrastructure
- **AND** `task.ts`、`task-project.ts`、`task-service.ts`与`task-change.ts` MUST是全部Task Record Domain文件
- **AND** `task-result.ts`、`task-retrospective.ts`、旧`task-record.ts`、旧`task-record-repository.ts`与`task-record-http-mapping.ts` MUST不存在
- **AND** Interfaces MUST只通过Application API读取或修改Task Record

#### Scenario: Bootstrap 注册 Task Record
- **WHEN** `src/task/module.ts` 组装 Task Record
- **THEN** 它 MUST注入同一TransactionManager、四个独立Repository、Project/Service reader、Change resolver与其他明确协作者
- **AND** 对其他模块公开的Task Record Application与窄兼容读取能力 MUST保持当前调用行为

#### Scenario: 普通业务模块使用 SQLite 事务
- **WHEN** Task Record、Task Review或Task Verification执行普通SQLite mutation
- **THEN** 对应Application MUST决定transaction范围并使用Infrastructure TransactionManager
- **AND** 业务Persistence文件 MUST不再重复实现`BEGIN IMMEDIATE|COMMIT|ROLLBACK`
