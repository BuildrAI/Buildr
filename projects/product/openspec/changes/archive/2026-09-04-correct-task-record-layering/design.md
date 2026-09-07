## Context

前一轮已把 Task Record 文件移动到新的目录，但 `task.ts` 仍有三百余行解析和业务校验，`Task` 只是 `private record` 包装器，三个关系类没有 `taskId`；`task-repository.ts` 仍统一开启事务、校验父子关系并调用另外三个 Repository。Buildr Web 虽已移动到 feature，两个大页面仍直接持有请求、状态和 mutation，组件中也仍有直接 API 调用。

用户确认采用 Java Spring Boot 常见分层：Domain 是普通数据类，Application 拥有业务逻辑和事务范围，Persistence 只拥有单表 SQL，Infrastructure 提供通用事务机制。Task 内部结果、历史、父任务完成和复盘对象归属 Task，继续与 `Task` 定义在同一 `task.ts`，不按非独立表拆文件。

## Goals / Non-Goals

**Goals:**

- 让 Task 六类数据对象只表达字段，不承担解析、创建/恢复、修改或校验流程。
- 让 `TaskRecordApplication` 直接编排四个 Repository，并集中现有业务、错误、结果、关系和摘要语义。
- 建立唯一通用 SQLite 业务事务管理器，供 Task、Review、Verification Application 复用。
- 将 Task Record 前端收敛为 `pages/hooks/components/api`，页面和组件不直接请求后端。
- 保持现有 CLI、HTTP、JSON、SQLite、错误、父子任务、复盘和页面交互兼容。

**Non-Goals:**

- 不新增 `task-result.ts` 或 `task-retrospective.ts`。
- 不引入 ORM、DI container、TypeScript `enum`、全局 Store、Command/VO 或额外 Adapter 层。
- 不改变 SQLite migration；Migration 不使用普通业务事务管理器。
- 不要求 `recordDigest` 跨实现版本字节相同。
- 不重新设计页面视觉和交互。

## Decisions

### 1. Task Domain 使用普通数据类

`task.ts` 定义 `Task`、`TaskStatus`、`TaskResult`、`TaskResultHistory`、`ParentCompletion` 与 `TaskRetrospective`。后三个关系文件分别定义带 `taskId` 的 `TaskProject`、`TaskService` 与 `TaskChange`。所有类只保存字段；由于 Product 启用 `erasableSyntaxOnly`，`TaskStatus` 使用 `as const` 集合与联合类型，不使用运行时 TypeScript `enum`。

`task.ts` 不再拥有 `normalizeTaskRecord`、`normalizeParentCompletion`、输入对象解析、业务错误、状态/结果一致性、复盘或 Parent 完成校验。数据库 Row 类型检查和 JSON column decode 留在所属 Repository；Application DTO 和业务输入规范化留在 Application。

### 2. Application 直接编排四个 Repository

`TaskRecordApplication` 在一个事务回调中分别读取/写入 `TaskRepository`、`TaskProjectRepository`、`TaskServiceRepository` 和 `TaskChangeRepository`。完整 Task Record 只是 Application 输出 DTO，由四类数据组装；不再把包含 `scope` 和 `changes` 的协议对象冒充 Domain `Task`。

列表查询由 Application 组合批量结果：关系 Repository 按筛选返回 taskId 集合，`TaskRepository` 查询主表及父子摘要，随后三个关系 Repository 按全部 taskId 批量读取。任何列表规模都不得按单 Task 重复查询三张关系表。

### 3. Infrastructure 提供唯一普通写事务

`src/infrastructure/sqlite/transaction.ts` 提供注入式 `TransactionManager.run(targetRoot, action)`。它解析 canonical Workspace、打开 writable store、拒绝已存在事务、执行 `BEGIN IMMEDIATE`、同步调用 action、提交或回滚并关闭连接。`TransactionContext` 对 Application 是不透明传递对象；Repository 使用它取得当前 `DatabaseSync`，Application 不导入或操作 `DatabaseSync`。

回调返回 Promise 时事务管理器必须回滚并报错。第一版拒绝嵌套事务，不引入 Savepoint。Migration 涉及 ledger 与 `PRAGMA foreign_keys`，继续使用 `workspace-sqlite.ts` 的专用编排。Task Review 与 Task Verification 的普通 current 写事务迁到公共管理器，消除重复实现。

### 4. Repository 只拥有单表数据访问

`TaskRepository` 只访问 `tasks`，包括主记录、Parent/Children/ancestor、主表筛选和主表写入；另外三个 Repository 只访问对应关系表。Repository 不调用其他 Repository，不决定事务范围，不校验外部 Project/Service/Change，不生成结果历史、Parent 授权或 `recordDigest`。

每个 Repository 内部保留自己的 Row parsing、JSON codec 和 SQL，不增加独立 Mapper/Codec 文件。Application 传入同一个 `TransactionContext`，从而保证四张表一次成功或一次回滚。

### 5. 接口与 DTO 保持现有契约

HTTP JSON Schema 继续生成后端 Application DTO 和前端 DTO；运行时只校验请求，响应由严格类型与真实 Contract Test 校验。CLI 把文本参数转换为同一 Application DTO。HTTP/CLI 都只调用 Application，不导入 Persistence。

`recordDigest` 由 Application 对当前组装的 closed Task Record DTO 计算，并在事务中比较陈旧写入。重构只保持页面有效性语义，不保留旧摘要值。

### 6. 前端采用四个平级目录

`src/features/task-record/{pages,hooks,components,api}` 是最终结构，不再建立 `logic/list/detail/actions/model/utils` 等中间层。`pages` 只读取路由、调用 Hook 和组装组件；`hooks` 管理服务器数据、mutation、请求取消和竞态；`components` 只接收 props 与回调；`api` 只封装 Task Record endpoint 和 generated DTO，不依赖 React。

`src/api/index.ts` 不再反向导入 Task feature。Task feature API 直接复用全局 HTTP/session/workspace transport。Review、Verification、Parent Coordination、Change、Prototype 与 Project Document 保持各自 Client；Task Hook 可以组合其只读结果，但不得把它们并入 Task Record API 或 authority。

## Risks / Trade-offs

- [事务移出 Repository 后遗漏原子检查] → 在同一 TransactionContext 中完成 current read、digest、父子观察、四表写入与写后回读。
- [通用事务回调误用 async] → 类型说明加运行时 thenable 检查，回滚后返回稳定错误。
- [四 Repository 列表组合产生 N+1] → 只允许批量 taskId 查询并增加查询次数回归测试。
- [Domain 与协议 DTO 分离后字段漂移] → HTTP Contract、CLI/System 与 closed DTO fixture 保持现有字段和省略规则。
- [页面拆 Hook 后竞态或局部失败退化] → 保留 request generation、AbortController、focus refresh、独立 evidence error 和 DOM selector Browser 测试。
- [前序归档规范已写入错误结构] → 当前 Change 使用完整 MODIFIED Requirement 覆盖，不修改历史 archive。

## Migration Plan

1. 增加公共 TransactionManager 及同步、回滚、嵌套和连接关闭测试。
2. 重写 Domain 数据类，并将解析/业务校验移入 Application、Row 校验移入 Repository。
3. 重写四个 Repository API 与 Task Application 事务编排；迁移 Review/Verification 普通事务。
4. 调整 module、HTTP、CLI、专业调用方和测试端口。
5. 将前端 `logic` 迁为 `hooks/api`，抽取页面状态和组件，删除页面/组件直接 API 调用。
6. 更新规范、架构、Service 说明和验证所有权，执行完整验证和 Completion Review。

本次没有数据 migration；回滚只需撤销代码、规范和文档变更。

## Open Questions

无。
