## Context

Buildr 的模块迁移已确立“业务模块优先、模块内按技术层分离、技术层默认扁平”的结构。Project Daily Progress 仍由全局 `domain/application/infrastructure/interfaces` 分别承载，并由 `legacy-runtime-module.mjs` 直接注册 Store/Application、公共 CLI registry 直接接线、HTTP Host 直接实现路由。Task Record 虽已迁入 `src/task/`，Domain、Application、Persistence 各自仍套有仅含一个文件的 `record/` 目录。

本次是父任务 `reorganize-buildr-service-architecture` 的收敛切片。Daily Progress 的公开能力已经稳定，因此只改变源码所有权、组装入口与目录位置，不改变文件或 API 契约。Task Delivery/Finish 正在另一 Child 中迁移，其 `finish/` 目录和文件不属于本 Change。

## Goals / Non-Goals

**Goals:**

- 把 Daily Progress 完整纵向切片放入 Workspace module，并消除全局旧入口。
- 让 Workspace module 私有组装唯一 Daily Progress Store/Application，并向 Bootstrap 贡献 CLI/HTTP Adapter。
- 扁平化 Task Record 的三个单文件末级目录，并对已迁移模块执行有依据的同类检查。
- 保持公开 CLI、HTTP、JSON、YAML/SQLite schema、Task 引用、事务、锁、幂等、原子性和 writer authority 不变。
- 更新 imports、Bootstrap 组装、verification owner、package assertions、测试与 current knowledge。

**Non-Goals:**

- 不重写 Daily Progress 的业务模型、文件格式、Skill 工作流或前端页面。
- 不引入 SQLite 存储、Git 扫描、定时任务、第二套 Store 或兼容 re-export。
- 不修改 React/Vite 源码、Session、安全边界或公共 HTTP Host 的通用职责。
- 不修改正在独立迁移的 Task Delivery/Finish 文件；父任务最终 conformance 再统一检查其目录理由。

## Decisions

### 1. Daily Progress 归入 Workspace，而不是 Project 或全局 Domain

Daily Progress 以 canonical Workspace root 为存储根，按已登记 Project code 分区，并需要同一 Workspace 中的 Task 只读校验。它是 Workspace 内的 Project-scoped 能力，因此归入 `src/workspace/` 最能表达 authority 和依赖方向。

备选方案是在顶层建立 `daily-progress/` 模块，但这会让一个依赖 Workspace registry、Project registry 和 Task reader 的能力成为新的横向模块，并增加 Bootstrap 依赖。继续留在全局技术层则无法完成父任务的模块收敛。

### 2. Store 进入 Workspace Persistence，通用文件机制仍归 Infrastructure

现有 ignored YAML 的路径、解析、校验和原子替换属于 Daily Progress 的业务存储映射，迁入 `src/workspace/persistence/project-daily-progress-repository.mjs`。其底层 filesystem 与原子写机制继续复用全局 Infrastructure 提供的技术能力，不复制文件 API 或事务实现。

备选方案是保留 `src/infrastructure/filesystem/project-daily-progress-store.mjs`，但该文件理解 Project code、日期、Daily Progress schema 和 authority，超出了通用 Infrastructure 边界。

### 3. Workspace module 贡献 CLI 和 HTTP，公共 Host 只负责协议宿主

`src/workspace/module.mjs` 在 Project/Service Application 后注册 Daily Progress Repository/Application，导出命名 Application capability，并将 Daily Progress CLI commands 与 HTTP handlers 合并到自身 contributions。公共 CLI registry 只消费 contribution；Local App HTTP Host 继续负责 Session、安全、Workspace 定位、closed body reader 与响应发送，不再匹配 Daily Progress 业务路由。

为了保持外部行为，迁移复用现有 Adapter 的参数解析、schema identity、status/error mapping 和 endpoint 路径，不新增 legacy facade。

### 4. 技术层默认扁平，目录例外必须由内容证明

Task Record 三个 `record/` 目录各自只有一个实现文件，且没有该层私有协作者或实现分类，因此文件直接落在 `domain/`、`application/`、`persistence/`。检查其他已迁移模块时，仅对同样无理由的单文件末级目录执行扁平化；协议分类目录（如 `interfaces/cli`、`interfaces/http`）、包含多个协作者的能力目录、真实子模块或明确实现类型目录保留。

不采用“所有技术层保持对称目录”的方案，因为它增加导航层级却不表达真实边界。也不机械删除所有单文件目录，因为部分目录代表稳定协议或实现类别，而非业务能力包装。

## Risks / Trade-offs

- [Risk] 大量 import 路径变更遗漏动态入口或 package assertion → 使用全仓 `rg` 检查旧路径，并运行架构、package、Unit/Component 与代表性 CLI/HTTP 验证。
- [Risk] HTTP 路由迁移改变匹配顺序或错误映射 → 保留现有匹配表达式和调用参数，在 Workspace contribution 中按原顺序接入，增加行为回归测试。
- [Risk] Workspace module 新增 Task reader 依赖形成模块循环 → 只注入 Task Record 的窄只读 capability，不从 Workspace 源码导入 Task module；Bootstrap 通过命名 capability 解析依赖。
- [Risk] 机械扁平化误删有意义目录 → 使用“多个私有协作者、真实子模块、明确实现分类”三项判据，显式排除协议目录与在途 Finish 切片。
- [Trade-off] Daily Progress 与 Workspace module 的文件数增加，但所有权、组装入口和查找路径变得唯一且可验证。

## Migration Plan

1. 建立 Workspace Daily Progress Domain、Application、Persistence、CLI/HTTP 文件，保持实现逻辑不变。
2. 扩展 `src/workspace/module.mjs` 的依赖、私有注册、命名 capability 与 interface contributions。
3. 移除 legacy runtime、公共 CLI registry 和 HTTP Host 的 Daily Progress 业务接线及全局旧文件。
4. 扁平化 Task Record 三个文件并批量更新 imports、tests、package 和架构 assertions。
5. 检查其他已迁移模块末级目录并只处理满足无效判据的目录。
6. 更新 current knowledge，执行 OpenSpec、架构、package、Unit/Component 与公开 CLI/HTTP 回归验证。

回滚以本 Change 的 Git commit 为单位恢复旧路径和旧 module wiring；由于没有数据 migration、schema 或 writer authority 变化，不需要数据回滚。

## Open Questions

无。Task Delivery/Finish 的目录结构由其独立 Child 和父任务最终 conformance 决定。
