## Why

Buildr 的业务模块与 Web 实例生命周期已经迁入明确模块，但公共 HTTP 宿主、Doctor 和最后一批兼容装配仍留在旧 `interfaces/local-app` 与 `legacy-runtime-module`，使 Bootstrap 仍需同时理解新旧两套入口。现在上游 Controller、Read Model 和 Diagnostic contribution 已经稳定，可以在依赖链末端一次完成 Runtime Host、Doctor 与遗留退出，同时保持全部公开行为和 writer authority 不变。

## What Changes

- 将 HTTP Server、Router、Session、安全边界、bounded read worker 和 `web-dist` 静态托管迁入 `src/web/http/`。
- 将 Doctor 迁入 `src/system/doctor/`，通过各模块公开的 Diagnostic/Read Model 与物理健康适配聚合只读诊断。
- 由模块 contribution 完成业务 HTTP Controller 与 Diagnostic 的最终显式装配，公共宿主不再直接拥有业务路由。
- 删除旧 `src/interfaces/local-app/http/` 业务路由、`legacy-runtime-module` 和已失去用途的临时 Facade。
- 原子更新 Bootstrap、Application Payload、验证 owner、发布物检查、迁移台账与服务架构文档，并验证循环依赖和 writer 唯一性。
- 不改变公开 CLI、HTTP、JSON、Session/安全语义、SQLite schema、migration/checksum、事务、锁、幂等、原子性、端口/实例行为或业务 writer authority；不修改 React/Vite 前端源码与正式构建 authority。

## Capabilities

### New Capabilities

- `runtime-host-doctor-module-architecture`: 定义 Web HTTP 公共宿主、System Doctor、模块 contributions 最终装配与遗留运行时退出的结构和行为等价约束。

### Modified Capabilities

无。

## Impact

主要影响 `projects/product/services/buildr/src/web`、`src/system`、`src/bootstrap`、旧 `src/interfaces/local-app/http`、服务验证与发布物检查，以及 Buildr 服务架构和当前知识文档。公开产品协议、SQLite 数据和 sibling `buildr-web` 的源码/构建职责不受影响。
