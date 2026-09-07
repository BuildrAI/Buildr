## Context

Task Record 当前已经位于 `src/task` 并使用 TypeScript，但 `task-record.ts`、`task-record-application.ts` 与 `task-record-repository.ts` 分别集中了承载领域结构、应用输入输出和四张表持久化。HTTP 还有同形复制 mapping，CLI 的失败分支直接读取 Persistence；Buildr Web 的 Task 页面、请求生命周期与 typed Client 分散在 `pages` 和 `api`。

本次跨 `buildr` 与 `buildr-web` 两个 Service 整理同一 Task Record 纵向切片。外部行为、SQLite schema 和任务数据保持不变；`recordDigest` 继续用于判断页面提交是否基于当前数据，但不是持久版本，也不要求跨实现版本保持相同摘要值。

## Goals / Non-Goals

**Goals:**

- 形成清晰的 Interfaces → Application → Domain/Persistence 分层。
- 用明确领域对象和应用 DTO 代替 `string[]` 领域表达与公开 `Record<string, unknown>`。
- 将 `tasks`、`task_projects`、`task_services`、`task_changes` 的 SQL、Row mapping 和批量操作拆到四个 Repository。
- 由 Application 决定业务事务范围，Persistence 用同一个 `DatabaseSync` 和一个同步事务执行四个 Repository 操作。
- HTTP/CLI 复用同一 Application，前端 Task Record 能力收敛为一个 feature。

**Non-Goals:**

- 不修改 HTTP URL、JSON 字段、CLI 命令或参数。
- 不修改 SQLite table、column、index、foreign key、migration 或现有数据。
- 不引入 ORM、DI container、全局 Store、Command、VO、额外 Result、独立 Mapper/Codec 文件。
- 不增加生产响应的运行时 Schema 校验。
- 不保证重构前后的 `recordDigest` 字节相同，也不改为持久 `version`。

## Decisions

### 1. 四个 Repository 共享一个应用事务

`TaskRepository` 负责 `tasks` 主表、父子关系查询和同步事务入口；`TaskProjectRepository`、`TaskServiceRepository`、`TaskChangeRepository` 分别负责关系表。Application 在事务回调中读取完整 Task、检查 `expectedRecordDigest`、应用业务规则并依次写四张表；四个 Repository 接收同一个 transaction context，不自行 `BEGIN`、`COMMIT` 或打开连接。

列表读取先查询符合条件的 Task ID 与主表，再按 Task ID 集合批量查询三张关系表，保持当前排序、筛选和无 N+1 查询。Row Mapper 与 JSON Codec 保持为各 Repository 内部函数。

替代方案是继续使用单一大 Repository；它能保持原子性，但继续混合四张表查询、映射、事务和父子读取，不解决当前维护问题。另一个方案是让每个 Repository 自己管理事务；这会产生部分提交，因此不采用。

### 2. 领域对象与应用 DTO 分开

Domain 定义 `Task`、`TaskProject`、`TaskService`、`TaskChange`；`TaskResult`、`TaskResultHistory`、`TaskRetrospective`、`ParentCompletion` 作为 `Task` 内部结构保留在 `task.ts`。关系对象可以携带所属 `taskId`，Application 在组装完整 Task 时保证它与主对象一致。

Application 只接收和返回明确 DTO。HTTP Schema 仍是协议 authority，生成后端 Application DTO 与前端 DTO；生成关系只发生在构建阶段，Application 运行时不导入 HTTP Interface 实现。HTTP 与 Application 结构相同时直接传递，确有差异时才在 Interface 内局部转换。

领域类主要负责结构、类型和基本合法性；状态变化、外部引用、父子关系和业务事务继续由 Application 负责，不为形式完整强行增加行为对象。

### 3. `recordDigest` 只保持页面数据有效性语义

Application 对当前规范化 Task Record 计算非持久摘要并随 read/result DTO 返回。mutation 在同一 SQLite 事务内重新读取当前数据并比较 `expectedRecordDigest`；不一致时返回现有 `task_record_conflict`。

实现可以因领域对象和 DTO 重组产生新的摘要值。验收只证明同一当前数据在一次实现中稳定、内容变化后摘要变化、陈旧提交被拒绝；不比较重构前后的摘要字节。

### 4. 请求运行时校验，响应测试校验

HTTP Interface 在调用 Application 前复用已编译 Ajv validator 校验请求。成功响应与错误响应由生成 DTO、严格 TypeScript、真实 HTTP Contract Test 和 Browser smoke 校验，不在生产请求链中重复运行响应 validator。

这保持当前失败模型，同时删除没有协议差异的 `task-record-http-mapping.ts`。

### 5. CLI 失败结果不再读取 Persistence

CLI 继续负责参数解析、文件参数读取、文本/JSON 输出和退出码。业务失败后需要当前 Task 时，只调用 Application 的当前读取方法或消费 Application 错误中已提供的当前摘要；不直接引用 Persistence 类型。现有 blocked envelope、`record`、`recordDigest`、diagnostic 和 next action 保持不变。

### 6. Task Record 前端采用 feature 内聚

`src/features/task-record` 包含 Task 页面、页面内组件、`useTaskRecord`、Task typed Client、纯工具和 generated DTO。`src/api` 只保留通用 fetch、session、workspace 选择和其他尚未迁移能力的 Client。Review、Verification、Parent Coordination、Change 与 UI Prototype 仍由各自能力 Client 读取，Task 页面只组合这些独立结果并保持局部失败隔离。

Service 规则同步定义 `features` 与现有 `pages/api` 的过渡边界；不要求本次迁移其他业务页面。

## Risks / Trade-offs

- [四个 Repository 误开独立事务] → transaction context 由唯一入口创建，Repository API 不暴露独立提交。
- [列表拆分后产生 N+1] → 关系表只接受 Task ID 集合批量读取，并保留查询计数测试。
- [领域与 DTO 重组改变 JSON 或错误] → 用现有 fixtures 对所有 operation 做结构和错误回归，不要求旧 `recordDigest` 相同。
- [CLI 去除 Persistence 后丢失 blocked 当前值] → 为失败路径增加 Application 级回读测试。
- [前端搬迁破坏竞态保护或专业结果隔离] → 复用并测试现有 AbortController、请求代次和局部错误处理。
- [大范围路径变化遗漏 generator/test/doc] → 由 generated inventory、架构 verifier、全局旧路径扫描和 current knowledge reconcile 收口。

## Migration Plan

1. 先建立领域文件和应用 DTO，保持旧 Persistence 可用。
2. 拆分四个 Repository 并让 Application 控制共享同步事务。
3. 迁移 HTTP、CLI、模块端口和后端调用方，删除旧 mapping 与大 Repository。
4. 迁移前端 feature，更新生成工具、规则和测试引用。
5. 收敛当前认知，运行类型、契约、数据库、系统和生产 Web 验证。

回滚通过撤销本 Change 的代码与文档完成；本次没有数据库 migration 或不可逆数据转换。

## Open Questions

无。
