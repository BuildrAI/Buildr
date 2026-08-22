# Workspace 与 Agent Assets HTTP 契约迁移

## 一句话摘要

复用 Task Record 参考切片的 Schema/Ajv/DTO 链路，为 Workspace Control Plane 与 Agent Assets 管理面建立稳定、可测试、可生成的 HTTP 边界。

## 背景与问题

Workspace HTTP adapter 当前把请求 body 直接交给 Application，buildr-web 页面通过低层 `unknown` transport 和手写接口描述 payload；Agent Assets 的管理能力主要停留在 CLI 入口，缺少结构化 HTTP operation catalog。字段漂移和错误结构变化只能在页面运行时暴露。

## 目标与非目标

目标是模块内 Schema authority、严格 Ajv 校验、生成 DTO、能力 Client、Contract Test，以及现有 writer/ownership/security 语义的保持。非目标是 Task 专业阶段、Runtime/System、Agent Adapter、OpenAPI 或业务模型重定义。

## 受影响用户与流程

Buildr 用户通过 Workspaces、Projects、Services 管理页面读取或编辑本地工作空间；Agent 或自动化客户端通过同一管理面读取 Agent Assets 状态并执行受控 mutation。HTTP adapter 只做边界映射，实际持久化和 runtime projection 仍由既有 Application/Infrastructure authority 执行。

## 关键变化与风险

- Workspace/Project/Service 路由拥有 request/success/error Schema 与 stable operation id。
- Agent Assets 目录、状态和支持的 mutation 拥有独立 Schema 与 typed Client；未实现的 runtime render/sync 明确 deferred/not-applicable。
- 请求未知字段、错误类型和缺失必填字段在边界失败；Origin/session、target 禁止、ownership 和 required Builtin 保护保持原有优先级。
- DTO 生成漂移阻止受影响构建/Change 收敛，不阻止未迁移 API 的安全读取。

## 验收摘要

受影响 Buildr Service contract/unit/integration/typecheck、DTO drift check、Buildr Web typecheck/build、tracked `web-dist` 与至少一个 Workspace 管理和 Agent Assets inventory smoke 通过；Task/Runtime/System/Agent Adapter 不被改变。

## 技术入口

- `design.md`
- `specs/workspace-http-contracts/spec.md`
- `specs/agent-assets-http-contracts/spec.md`
- `tasks.md`
