## Why

P0 已经证明 Task Record 可以沿 `Schema → Ajv → DTO → typed Client` 形成可验证的 HTTP 契约链路，但 Workspace 与 Agent Assets 管理面仍由路由白名单、CLI 形状和页面 `as` 断言分别描述。现在补上这条边界，才能让工作空间登记、项目/服务元数据和 Agent 资产投影在跨端协作时拥有同一份可执行契约，并在不改变现有 writer 与 ownership 的前提下暴露字段漂移。

## What Changes

- 为 Workspace Control Plane 的登记、读取、元数据更新、Project/Service 查询和文档读取定义 Draft 2020-12 request/success/error Schema 与稳定 operation registry。
- 为 Agent Assets 管理面定义资产目录读取、Builtin/Component/Skill/Rule/Command 状态读取，以及受控写入和 runtime projection/sync 的 request/success/error 契约；写入继续经过现有 Application writer、ownership 和安全检查。
- 复用 P0 的严格 Ajv 编译与 validator catalog；不在 `public-json.mjs` 中承载业务 Schema，不启用输入类型转换、默认值或字段删除。
- 为 buildr-web 增加 Workspace/Agent Assets 能力级 typed Client 和生成 DTO，先替换 Workspace、Project、Service 管理页面的手写 payload 断言。
- 增加请求、成功响应、错误响应和 generated-drift Contract Test；未纳入本 Child 的 Task 专业、Runtime/System 和 Agent Adapter 继续保留现状并形成可审计 disposition。

## Capabilities

### New Capabilities

- `workspace-http-contracts`: Workspace Control Plane 登记、Workspace/Project/Service 查询与元数据管理 HTTP 契约。
- `agent-assets-http-contracts`: Rules、Skills、Commands、Components、Builtin 与 runtime projection 管理 HTTP 契约及其 typed Client 边界。

### Modified Capabilities

- 无。现有 Workspace、Agent Assets 的领域、持久化、writer 和 runtime 治理语义不变；本 Change 只建立 HTTP 边界契约。

## Impact

- 后端：`services/buildr/src/workspace/interfaces/http`、`services/buildr/src/agent-assets/interfaces/http`、模块注册和契约测试；复用 `infrastructure/contracts` 的 P0 通用机制。
- 前端：`services/buildr-web/src/api` 生成 DTO 与 Workspace/Agent Assets 能力 Client，Workspace、Project、Service 管理页面改用 typed Client。
- 构建：Buildr Service 继续承担 Ajv 与 DTO 生成依赖；Buildr Web 只消费生成的 TypeScript DTO。
- 对外兼容：保留现有路径、状态码、错误 envelope、权限/Origin/session 检查和业务 writer；任何接受范围变化只由本 Change 的 Schema 与 Contract Test 明确记录。
