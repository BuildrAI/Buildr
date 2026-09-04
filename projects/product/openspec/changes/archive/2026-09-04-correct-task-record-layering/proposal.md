## Why

前一轮 Task Record 重构只移动和拆分了文件，实际仍把业务校验留在 `task.ts`、让 `TaskRepository` 统管事务及另外三个 Repository，并让前端页面继续承载大量请求和状态。该实现与用户已经确认的 Java Spring Boot 常见分层不一致，需要在交付前纠正。

## What Changes

- 将 `Task`、`TaskProject`、`TaskService`、`TaskChange` 改为只表达字段的普通数据类；`TaskResult`、`TaskResultHistory`、`ParentCompletion`、`TaskRetrospective` 作为 `Task` 的内部类型继续定义在 `task.ts`，不建立独立文件或 Repository。
- 把输入规范化、业务错误、状态与结果、父子关系、引用、结果历史和 `recordDigest` 逻辑集中到 `TaskRecordApplication`。
- 在 Infrastructure 建立全产品复用的同步 SQLite `TransactionManager`；Application 决定事务范围和四表写入顺序，四个 Repository 只执行所属表 SQL。
- 将 Task Review 与 Task Verification 的普通写事务迁到同一 `TransactionManager`；数据库 Migration 保留特殊编排。
- 将 Buildr Web Task Record feature 固定为 `pages/hooks/components/api` 四个目录；页面只编排，Hook 管理请求与状态，组件只接收数据和回调，API 不依赖 React。
- 删除前端旧 `logic` 目录和页面/组件中的直接 API 调用，保持现有用户交互、URL、JSON、SQLite schema、错误和 `recordDigest` 页面有效性语义。
- 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `infrastructure-boundaries`: 增加唯一通用 SQLite 业务事务管理器及同步、非嵌套边界。
- `task-record`: 纠正 Task 普通数据模型、Application 业务与事务职责、四 Repository 单表职责。
- `product-source-layout`: 纠正 Task Record 后端文件职责和 Infrastructure/Application/Persistence 依赖方向。
- `buildr-web-client`: 将 Task Record feature 从 `pages/components/logic` 纠正为 `pages/hooks/components/api`，禁止页面和组件直接请求后端。

## Impact

- 后端：`src/infrastructure/sqlite`、Task Record Domain/Application/Persistence/Interface/module，以及 Task Review、Task Verification 的写事务。
- 前端：`src/features/task-record`、全局 API 入口、DTO generator、页面和组件测试。
- 规范与认知：Infrastructure、Task Record、Product source layout、Buildr Web Client，Service 架构和两个 Service 当前说明。
- 数据与接口：不修改 SQLite migration、HTTP/CLI/JSON 或现有任务数据。
