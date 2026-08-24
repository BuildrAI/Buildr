## Why

Task Record 的参考切片已经证明 Schema、Ajv、生成 DTO 与类型化 Client 可以形成端到端流水线；Task 专业阶段的 HTTP 边界仍由多个 handler、字段白名单和页面局部类型共同维护，Environment、Development、Review、Verification、Retrospective、Finish、Execution Record 与 Parent Coordination 的字段漂移仍会在运行时才暴露。现在沿用已交付的参考机制迁移这一组真实的专业 API，可让 Agent 和开发者共享稳定的机器契约，同时保持各专业 authority 与生命周期不变。

## What Changes

- 为 Task 专业阶段 HTTP 操作建立按能力归属的 Draft 2020-12 请求、成功响应和错误 Schema，并登记稳定 `$id` 与最小 operation catalog。
- 复用参考切片的 Ajv strict compiler、生成器和 drift check；校验不转换、不填默认、不删除未知字段，并保留现有安全检查、错误优先级和 writer authority。
- 将专业 Interface DTO 显式映射到既有 Application Command/Query，不让 HTTP DTO 穿透到 Domain、Persistence、SQLite 或生命周期状态机。
- 为 Buildr Web 提供专业阶段能力级 typed Client，页面消费生成 DTO；保留低层 transport，不扩大页面状态或引入前端 Ajv。
- 增加真实 HTTP Contract Test、生成漂移检查、受影响 typecheck/build 与必要的 Task 页面/浏览器验收。
- 未迁移的 Workspace、Agent Assets、Runtime/System 或其他非本 Child API 只输出诊断，不成为本 Change 的全局完成门禁。

本 Change 不改变公开路径、成功 payload major、错误 envelope、Task Domain、Application 生命周期、Repository/SQLite schema、writer authority 或 Parent/Child 语义。

## Capabilities

### New Capabilities

- `task-professional-http-contracts`: 定义 Task 专业阶段 HTTP operation 的 Schema authority、严格校验、DTO 投影、typed Client 与契约测试边界。

### Modified Capabilities

无。现有 Task 专业能力的可观察业务语义保持不变；本 Change 新增的是其 HTTP Interface 的机器契约投影。

## Impact

- Buildr：Task 专业 HTTP interface handlers、各能力的 Schema/operation catalog、通用 contract registry/validator 复用点、DTO 生成工具与后端生成物、Contract Test。
- Buildr Web：生成 DTO、Task professional capability clients，以及 Environment/Development/Review/Verification/Retrospective/Finish/Execution/Parent 页面的数据访问边界；不引入新的页面信息架构。
- 构建与依赖：复用 P0 已进入 canonical dev 的 Ajv、生成器和 tracked DTO 基础；不新增独立的 HTTP framework 或 OpenAPI authority。
- 交付协作：Change 只覆盖本 Child 的专业 API，后续 Workspace、Agent Assets、Runtime/System Child 继续沿参考切片扩展。
