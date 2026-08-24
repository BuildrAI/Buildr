## Why

Buildr 的 Task Record HTTP 边界目前由路由代码、字段白名单和页面断言共同维持，缺少可执行且可复用的单一机器契约；字段漂移只能在运行时暴露。现在以 list、detail、update、complete、abandon 五个稳定操作建立第一条完整参考流水线，可以验证收益并约束后续扩展，而不把全部 HTTP API 一次迁移。

## What Changes

- 为五个 Task Record 操作建立 Task HTTP Interfaces 自有的 Draft 2020-12 Schema authority 与最小 Operation Catalog，覆盖请求、成功响应和统一错误响应。
- 在 Buildr 服务端启动/模块组合时用 Ajv 严格编译并复用请求 validator；关闭类型转换、默认值填充和未知字段删除，保持现有 Origin、session、JSON、body size、路径字段和错误优先级。
- 让 HTTP Interface 将校验后的 DTO 显式映射到既有 Application Command/Query，不改变 Domain、Persistence、SQLite、writer 或生命周期语义。
- 从同一 Schema authority 确定性生成 Buildr 与 Buildr Web 的 TypeScript DTO，并提供构建期 drift check。
- 新增 Buildr Web Task 能力级 typed Client，让 Task 列表和详情页面不再直接猜测 `unknown` payload；保留低层通用 transport 与现有页面交互。
- 为请求、成功响应和错误建立真实 HTTP Contract Test，并以正式 `web-dist` 的既有 Task Browser Smoke 验收参考切片。
- 未迁移 HTTP operation 只形成可见诊断，不成为全局构建、启动或发布门禁。
- 不包含破坏性 API、Domain 或持久化变更。

## Capabilities

### New Capabilities

- `http-contract-reference-pipeline`: 定义模块自有 JSON Schema、严格 Ajv 校验、确定性 DTO 生成、typed Client 与局部漂移检查的参考流水线和扩展边界。

### Modified Capabilities

- `task-record`: 让现有 Task list、detail、update、complete、abandon HTTP 行为受可执行契约约束，并保持既有写安全、错误语义和 Application authority。

## Impact

- Buildr：`src/infrastructure/contracts/` 的通用 validator 机制、`src/task/interfaces/http/` 的 Task-owned contracts/operations/DTO 映射、模块组合、契约生成工具和 Contract Test。
- Buildr Web：生成 DTO、Task typed Client、Task 列表/详情页的 API 消费边界与正式构建产物。
- 依赖：Buildr 增加 Ajv 运行依赖与 JSON Schema 到 TypeScript 的构建期生成依赖；Buildr Web 不引入 Ajv。
- 兼容性：五个 operation 的路径、成功 payload、错误 code/status、安全检查顺序和内部 Application/Domain/Persistence 模型保持兼容。
