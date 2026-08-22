# Workspace Control Plane 设计

## Context

当前 Buildr Service 已有 Workspace、Package Assets、Workspace Operations、Project/Service declaration 与 product resource 相关实现，但部分职责仍集中在全局 `src/application` 或由 Bootstrap 直接注册。Child 2 需要完成结构迁移，不改变这些能力的事实 authority、公开入口或运行副作用；同时为后续 Task Execution/Verification 提供稳定的 Workspace/Project Query。

## Goals / Non-Goals

**Goals:**

- 以 `workspace`、`agent-assets` 和 `infrastructure/product-resources` 三个 owner 收敛现有控制面职责。
- 将普通跨模块调用收敛到 Application/Query 入口，保留业务 writer 在原 owner 内。
- 让 Bootstrap 仅负责显式组合 provider，删除旧全局模块注册和旧导入。
- 用静态架构检查、现有行为测试和 targeted tests 证明迁移前后等价。

**Non-Goals:**

- 不改变 CLI/HTTP/JSON/SQLite、Doctor、Environment Receipt、同步、投影、锁、事务或安全边界。
- 不实现 Task Application Service、Verification Result、Internal Workflow Route、Public JSON Contract、Release Version 或 Web HTTP 拆分。
- 不引入新的 runtime/dependency、完整 JSON Schema、Ajv、DTO 或 typed API client。

## Decisions

### 1. 按业务控制面拆 owner，而不是按旧文件机械搬迁

Workspace owner 持有 Workspace/Project/Service registry、onboarding、mutation recovery 与声明 intake 的 Application 编排；Agent Assets owner 持有 package asset maintenance 与 runtime projection；product-resources 只提供 manifest/resource path/enumeration 等产品资源技术能力。这样跨模块协作依赖公开入口，避免把旧全局文件换目录后仍保留隐式 writer。

备选方案是保留 `src/application` 作为总门面，仅拆内部文件；该方案无法证明唯一 owner，也会继续让后续 Task 依赖全局入口，因此不采用。

### 2. 保留技术 Infrastructure 的通用机制与业务 Persistence 分离

filesystem、Git、process、atomic write、SQLite 等只保留通用技术 capability；Workspace、Agent Assets 等业务事实的 Repository/Mapper/Writer 继续由各自 owner 管理。product-resources 不解释 Workspace 或 package 业务语义，只返回受约束的产品资源事实。

备选方案是把 manifest 和 package 业务读写全部下沉 Infrastructure；这会复制业务 authority，违反现有 Infrastructure boundaries，因此不采用。

### 3. 以兼容 facade 迁移调用点，再删除旧路径

先在新 owner 暴露等价 Application/module 入口，逐个迁移 Bootstrap、CLI、测试和内部调用；完成行为验证后删除旧 `package-assets` 与 `workspace-operations` 路径。任何 facade 只能是短期迁移桥，不保留第二套 writer 或长期 public API。

### 4. Query 只读且窄

为后续 Child 提供 Workspace/Project Query 时只暴露后续 Task 所需的稳定 identity、registry 与路径事实，不暴露 Persistence、SQLite connection 或声明 writer。Query 的结果不复制 Environment Receipt 或 Verification Result。

## Risks / Trade-offs

- **[Risk] 旧导入遗漏导致运行时注册缺失** → 先建立静态 import/registration inventory，迁移后运行 package check、workspace fixture、CLI 与架构 contract tests。
- **[Risk] 目录迁移改变相对资源路径** → 由 product-resources 统一解析 manifest/path，并为 manifest、package check、runtime projection 增加路径等价测试。
- **[Risk] facade 形成双 owner** → 每个 facade 只转发到新 owner，完成迁移后在 contract test 中禁止旧路径 import，并删除 facade。
- **[Risk] 后续 Child 依赖不稳定 Query** → 在本 Child 的 spec、design 和 tasks 中固定 Query 的只读边界与返回最小事实，禁止 Task 直接导入 Workspace Persistence。

## Migration Plan

1. 盘点旧全局模块的 exports、Bootstrap 注册点、CLI 路由和测试覆盖，建立 owner map。
2. 创建新 owner 的 Application/Query 与 product-resources 入口，保持原实现可测试、可回退。
3. 迁移 Bootstrap、CLI 和内部消费者，补齐结构 contract 与行为回归测试。
4. 在 Child worktree 中执行 package/workspace/doctor/affected tests，确认旧路径无引用后删除旧模块。
5. OpenSpec strict validate、convergence preflight 通过后收敛并归档 Change；如行为回归失败，回退到迁移前提交并保留新 owner 设计，不修改外部契约。

## Open Questions

- 具体旧模块中哪些 exports 已被 Child 1 或后续 Child 4 触碰，需要在 owner inventory 阶段按当前 baseline 再确认；若发现跨 Child 责任，保留接口但不扩大本 Child。
