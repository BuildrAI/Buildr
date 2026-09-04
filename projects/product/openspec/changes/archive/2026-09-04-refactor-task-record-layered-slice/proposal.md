## Why

Task Record 已完成 TypeScript 与模块迁移，但领域结构、应用输入输出、四张关系表读写、CLI/HTTP 入口和前端页面仍集中在少量大文件中，层间还存在匿名对象、持久化类型泄漏和同形映射。现在需要在不改变现有任务行为和数据契约的前提下，把这条参考切片整理成可继续维护的分层实现。

## What Changes

- 将 Task Record 领域结构拆为 `Task`、`TaskProject`、`TaskService`、`TaskChange` 及 Task 内部结果、历史、复盘和父任务完成类型。
- 为 Task Record 应用层建立明确的输入/输出 DTO，移除 `Record<string, unknown>` 作为公开应用输入输出。
- 将四张表的 SQL 与映射拆为四个 Repository，由应用层决定一次业务操作的事务范围，四个 Repository 复用同一 SQLite 事务。
- 让 HTTP 与 CLI 继续调用同一 Application；HTTP 同形 DTO 不再经过无意义复制映射，CLI 失败结果通过 Application 读取当前 Task，不直接依赖 Persistence。
- JSON Schema 继续定义请求与响应契约并生成前后端 DTO；运行时只校验请求，响应通过严格类型检查和真实 HTTP Contract Test 校验。
- 将 Buildr Web 的 Task Record 页面、组件、Hook、typed Client 和 generated DTO 收敛到 `features/task-record`，保留通用 HTTP/session/workspace transport 在 `src/api`。
- 保持现有 HTTP URL、JSON、CLI、SQLite schema、错误语义、事务行为和基于 `recordDigest` 的页面数据有效性机制；不要求重构前后的摘要值相同。
- 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-record`: 明确四个表 Repository、共享事务、领域对象和 `recordDigest` 页面数据有效性语义。
- `http-contract-reference-pipeline`: 同形 HTTP/Application DTO 直接传递，运行时请求校验与响应契约测试边界保持明确。
- `product-source-layout`: 更新 Task Record 分层文件组织、模块端口与 CLI/Application/Persistence 依赖边界。
- `buildr-web-client`: 明确 Task Record feature 的页面、组件、Hook、typed Client 与共享 transport 边界。

## Impact

- 后端：`projects/product/services/buildr/src/task/{domain,application,persistence,interfaces,module.ts}` 及直接消费 Task Record port 的 Task Review、Task Verification、Parent Coordination、Change、Worktree、Preview、Daily Progress。
- 前端：`projects/product/services/buildr-web/src/{pages,api,features}`、应用路由、页面组件和 Service 规则。
- 工具与验证：Task Record DTO generator、generated inventory、架构检查、HTTP Contract、SQLite、Task System、Web build 与 Browser smoke。
- 当前认知：Service 架构、Buildr/Buildr Web Service 说明及相关路径引用。
