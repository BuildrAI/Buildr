## Why

Workspace 模块已经完成目录分层和 TypeScript 迁移，但当前 Application、Repository、Interface 与 Module 仍通过共享 `runtime: any`、`Object.assign(runtime, ...)` 和方法名列表隐式协作。`workspace-application.ts` 同时承担查询、写入、提示生成和诊断，使真实依赖、只读边界和 writer authority 难以从类型与组合结构中确认。

## What Changes

- 仅拆分职责混杂且体量较大的 Workspace Application：查询进入 Query Application，修改进入 Command Application；Prompt 与诊断按真实职责归入现有应用或私有协作者，不额外建立空泛 Application。
- Project、Service 与 Project Daily Progress 保持各自独立的领域和 Application；当前文件体量可维护，不机械拆成 Query/Command。
- 让 Repository 和 Workspace Management Fence 使用明确类型与窄依赖，由 Workspace module 通过类似 Task Record 的私有组合对象完成唯一组装；允许私有组合使用 `Object.assign`，但不再把 Workspace 内部能力写入进程级共享 runtime。
- `module.ts` 只声明依赖、建立私有组合、暴露稳定能力端口并组织 Interface contribution；CLI/HTTP 仍由所属 Workspace 模块贡献。
- 原子迁移现有 `workspace.application`、`project.application`、`service.application` 与 `workspace.query` 消费者，保持能力身份、公开 CLI、HTTP、JSON、YAML、Registry、错误和写入语义不变。
- 本切片不处理 729 行 Workspace CLI 的 Project/Service 创建实现，也不整理 Buildr Web 页面；它们由后续独立子任务完成。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-control-plane-module-architecture`: 明确 Workspace 模块必须使用声明依赖和受类型约束的私有组合，不得向进程级共享 runtime 注册或查找内部能力。
- `product-source-layout`: 补充 Workspace 模块的分层、Interface contribution 与组合根验证要求。

## Impact

- 后端实现：`services/buildr/src/workspace/**`、`services/buildr/src/bootstrap/runtime.ts` 及消费 Workspace capability 的模块。
- 验证：Bootstrap 模块合约、Infrastructure 边界、Product 源码布局、Workspace/Project/Service 集成与系统测试。
- 当前认知：Buildr Service 技术架构和 Service 说明。
- 不涉及数据库迁移、依赖升级、公开 API 或前端可见行为变化。
