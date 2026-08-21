## Why

Buildr 的 Rule、Skill、Command、Component、Builtin、Capability Binding 与 Agent runtime 投射目前分散在通用 `application`、`infrastructure/runtime` 和 Bootstrap 兼容入口中，导致源资产 authority、组件原子性与可重建投射边界难以从模块结构直接识别。Workspace Core、Infrastructure 和 Bootstrap 基础已经完成迁移，现在可以把这些紧密耦合的职责一次收敛为完整的 Agent Assets 平台，避免继续保留多套临时入口。

## What Changes

- 新建 `src/agent-assets/` 模块，在模块内按 Domain、Application、Persistence、Infrastructure 与 Interfaces 技术职责组织 Rule、Skill、Command、Component、Builtin、Capability Binding 和 Runtime Projection。
- 将现有 `application/domains/{rules,skills,commands,components,runtime}`、`application/runtime`、`application/package-maintenance` 与 `infrastructure/runtime` 中属于 Agent Assets 的生产职责迁入该模块。
- 通过 `agent-assets/module.mjs` 向 Bootstrap 注册 CLI、HTTP、runtime projection、诊断与 lifecycle 能力，退出已迁移职责在 `legacy-runtime-module.mjs` 中的直接注册。
- 接收 Workspace Core Handoff 中遗留的 Component、Rules、Commands、Skills/Builtin 与 runtime projection 职责；Change、OpenSpec、Publication 和通用 Project Verification 的归属继续 deferred。
- 同步更新 imports、Application Payload、Doctor 消费路径、Verification owner、测试和 Buildr 服务架构文档。
- 保持公开 CLI、HTTP、JSON、manifest schema、Component 原子性、Capability Binding、投射冲突防护、runtime receipt、render/sync 清理语义和 writer authority 不变。
- 本变更不包含破坏性变更。

## Capabilities

### New Capabilities

- `agent-assets-module-architecture`: 规定 Agent Assets 平台的模块职责、内部技术分层、公开组装入口、源资产与 runtime projection authority 边界，以及兼容入口退出要求。

### Modified Capabilities

无。现有 Rule、Skill、Command、Component、Builtin 和 runtime projection 的产品行为规范保持不变，本次只迁移实现所有权和内部组装边界。

## Impact

- 代码：`projects/product/services/buildr/src/agent-assets/`、现有 `src/application/domains/`、`src/application/package-maintenance*`、`src/application/runtime.mjs`、`src/infrastructure/runtime/`、Bootstrap、CLI/HTTP 注册和 Doctor 消费路径。
- 测试与发布物：架构边界、模块装配、runtime adapter、Rule/Skill/Command/Component/Builtin、sync/render、Application Payload、npm candidate 和 Verification owner 测试。
- 文档：`projects/product/docs/architecture/service-architecture.md` 与 OpenSpec current knowledge。
- 对外接口、数据格式、Workspace 源资产、运行时投射和安装行为保持兼容。
