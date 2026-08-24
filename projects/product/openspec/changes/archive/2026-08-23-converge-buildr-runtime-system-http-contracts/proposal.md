## Why

Task、Workspace 与 Agent Assets 已沿同一 Schema 契约链路交付，但 Local App host、Installation release-awareness 和 Publication 仍由路由实现、跨进程调用方与页面手写类型分别描述，系统级 operation 也缺少统一的迁移覆盖结论。现在完成最后一个 P2 边界，才能让前后端漂移、跨进程协议错误和遗留未迁移项在构建与测试阶段可见，同时不把契约治理扩大成新的业务门禁。

## What Changes

- 为 Local App health、session quit、instance-secret quit 定义稳定 operation、请求/成功/错误 Schema，并保留现有 session、Origin、instance secret、shutdown 顺序和跨进程调用语义。
- 为 Installation release-awareness 与 Publication list/detail 定义模块内 Draft 2020-12 Schema authority、严格响应 DTO、typed Client 和真实 HTTP Contract Test。
- 将 Publication asset 明确登记为 binary response operation：请求参数和错误保持可审计，成功体不伪装成 JSON DTO，并继续保留路径与内容类型安全边界。
- 建立 Local App 全局 HTTP operation coverage 基线，逐项标明 migrated、binary、deferred 或 not-applicable；Doctor、Launcher CLI 和非 HTTP release 流程不因本 Change 被强制改造成 HTTP API。
- 清理已被等价 Schema/生成 DTO 替代的页面手写类型与断言，扩展确定性 DTO generation/drift check，并完成 Application Payload、npm tarball、tracked `web-dist` 与 Browser Smoke 一致性验收。
- 不包含破坏性变更；既有路径、状态码、错误 envelope、权限和 Application/System ownership 保持兼容。

## Capabilities

### New Capabilities

- `runtime-system-http-contracts`: Local App host、Installation release-awareness、Publication HTTP 契约、binary operation disposition、typed Client 与全局 operation coverage。

### Modified Capabilities

- 无。现有 runtime、installation、publication、launcher、Doctor、release 与 security 行为不变；本 Change 建立其 HTTP 边界契约和一致性证明。

## Impact

- 后端：`services/buildr/src/web/http`、`services/buildr/src/system/installation`、`services/buildr/src/system/publication`、模块 HTTP contribution 组合、契约生成与 Contract/System tests。
- 前端：`services/buildr-web/src/api` 的生成 DTO 和 Runtime/System 能力 Client，以及 `AppLayout`、Articles 页面中对应的手写 payload 类型和断言。
- 构建与发布：Buildr Service 的 Schema/operation coverage/generated drift，Buildr Web typecheck/build、tracked `web-dist`、Application Payload、npm tarball parity 与 Browser Smoke。
- 不新增前端 Ajv、OpenAPI、Web 框架、Electron、Agent Adapter 或全量 TypeScript 迁移；非 Web CLI 冷启动不依赖 DTO 生成器。
