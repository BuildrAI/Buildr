## Why

Buildr Service 当前按全局技术层组织 Task Record，领域规则、应用用例、SQLite 映射、CLI/HTTP 入口和运行时注册分散在多个顶层目录，尚未形成可供后续能力迁移复用的模块优先参考实现。父任务已经确认以 Task Record 作为首个纵向切片，因此现在需要在保持全部外部行为和数据 authority 不变的前提下，验证目标目录、依赖方向和渐进迁移方法。

本变更不包含破坏性变更。

## What Changes

- 将 Task Record 的 Domain、Application、Persistence、CLI/HTTP Adapter 迁移到 `src/task/` 内按技术职责分层的纵向切片，并由 `src/task/module.mjs` 提供该切片的单一注册入口。
- 更新现有运行时组装、CLI/HTTP Host、Doctor 读取路径和内部调用方，使其消费新的 Task Record 模块边界；不迁移 Task Environment、Development、Review、Verification、Retrospective、Finish 或 Parent Coordination。
- 同步迁移 Task Record 相关测试、架构检查和 Verification selector，确保旧全局技术层不再保留同一实现或兼容转发层。
- 保持 Task Record 字段、状态语义、Parent/Child 与复盘来源关系、公开 CLI/HTTP/JSON、SQLite schema、事务、错误映射和唯一 writer 不变。
- 记录该切片的迁移边界与验证结果，作为父任务后续能力贡献的可复用范式。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `product-source-layout`: 将 Buildr `src/` 的组织要求从仅按全局技术层分离，扩展为业务模块优先、模块内部按 Domain/Application/Persistence/Interfaces 分层，并以 Task Record 纵向切片建立首个可验证实例。

## Impact

- 影响 Buildr Service 的 Task Record 源码路径、运行时组装、CLI registry、本机应用 HTTP Host、Doctor 内部读取路径、相关测试和 Verification registry。
- 不改变公开命令、HTTP 路径与 payload、SQLite migration/schema、前端契约、npm 入口或发布依赖。
- 不引入新框架、第三方依赖或第二套 Task Record 数据写入路径。
