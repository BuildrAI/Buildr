## Context

Task Record 当前由以下全局技术层共同实现：

- `src/domain/task-record/` 定义实体归一化、身份和错误语义；
- `src/application/task-record/` 定义共享用例和 read model；
- `src/infrastructure/sqlite/task-record-repository.mjs` 持有 Row/对象映射、事务与关系表读写；
- `src/interfaces/cli/task-record.mjs` 与 Local App HTTP Server 提供公开入口；
- `src/application/compose-runtime.mjs` 分别注册 repository 和 application。

这些实现已经具有可用的层间边界，但文件所有权仍由全局技术层表达。父任务要求先迁移一个窄而完整的纵向切片，以验证模块优先布局；同时，现有 Task Record 是 Environment、Development、Review、Verification、Retrospective、Finish 和 Parent Coordination 的共同基础，任何数据或协议漂移都会扩大影响面。

## Goals / Non-Goals

**Goals:**

- 建立 `src/task/` 下首个可运行的 Task Record Domain/Application/Persistence/Interfaces 切片。
- 只保留一个 Task Record 实现和一个 SQLite writer，保持既有 schema、事务、错误和公开协议。
- 让运行时组装通过 `src/task/module.mjs` 注册 Task Record repository 与 application。
- 迁移全部直接 import、测试和 Verification selector，并让架构 verifier 能检查模块内依赖方向及旧路径消失。
- 提供后续 Task 能力迁移可复用的目录、检查和验证范式。

**Non-Goals:**

- 不迁移 Task Record 之外的 Task 能力，也不统一整个 Task 模块的生命周期或 descriptor contract。
- 不重构全局 CLI registry、Local App HTTP Host、SQLite 连接和 migration runner。
- 不改变 Task Record 数据模型、业务状态机、API、前端、数据库 schema 或 release packaging。
- 不建立兼容 facade、第二套 repository、通用 `shared/` 或预先创建空目录。

## Decisions

### 1. 按真实切片建立最小 `task/` 模块

目标结构为：

```text
src/task/
  module.mjs
  domain/record/task-record.mjs
  application/record/task-record-application.mjs
  persistence/record/task-record-repository.mjs
  interfaces/cli/task-record.mjs
  interfaces/http/task-record-http.mjs
```

只创建 Task Record 实际使用的目录。选择 `record/` 子目录，是为了让同一技术层后续可以容纳 Environment、Review 等独立能力；不把本次切片误称为整个 `task` 模块已经完成。

备选方案是只移动三个核心文件并保留接口原位。该方案不能证明 CLI/HTTP Adapter 的模块所有权，因此不采用。

### 2. `module.mjs` 只拥有运行时能力注册顺序

`registerTaskRecordModule(runtime)` 按 repository、application 顺序注册既有 runtime 能力。全局 composition root 只调用该入口，不再知道 Task Record 的内部文件布局。

CLI command descriptor 仍由现有 CLI registry 组合，HTTP Server 仍拥有 socket、session、origin、通用 body 限额、统一 JSON response 和错误兜底。模块接口只拥有 Task Record 命令适配，以及 Task Record list/detail/update/complete/abandon 的路由识别、字段白名单和用例调用。

备选方案是本次同时引入通用模块 descriptor 并让模块自注册 CLI/HTTP。该方案会提前占用父任务的 Bootstrap 与模块契约贡献，并要求一次改造所有 Host，因此不采用。

### 3. Persistence 按模块所有权迁移，数据库平台继续由全局 Infrastructure 提供

Task Record repository 连同 Row/对象映射和事务边界进入 `task/persistence/record/`。它继续通过 runtime port 使用统一 Workspace SQLite store；DDL migration、连接管理和跨模块数据库平台保留在 `src/infrastructure/sqlite/`。

这样既能表达 Task Record 数据映射的业务所有权，又不复制全局有序 migration 或数据库连接。SQLite schema 和表关系不变，不执行数据迁移。

### 4. 直接迁移，不保留旧路径 facade

所有 Product 运行时与测试 import 一次性更新到新路径，旧 Task Record 文件删除。其他尚未迁移的 Task 能力允许依赖新 Task Record Domain/Application 公开实现，但不得复制规则或从新模块反向导入其旧全局实现。

备选方案是在旧路径保留 re-export，可降低单次 import 修改量，但会形成双重入口并弱化架构 verifier 的迁移完成判断，因此不采用。

### 5. 架构 verifier 识别模块内部层，而不是把 `task/` 当作单一层

verifier 将 `task/domain`、`task/application`、`task/persistence`、`task/interfaces` 映射到对应依赖角色，并单独允许 `task/module.mjs` 组合该模块。它同时检查 Task Record 必需路径存在、旧路径不存在、Application 不拥有接口行为、CLI/HTTP Adapter 调用共享 Application，以及 import graph 无反向依赖和循环。

Verification registry 将 `src/task/**` 纳入 Task lifecycle 与 CLI architecture 的 affected inputs，保证未来修改能够选中真实验证。

## Risks / Trade-offs

- [大量内部 import 路径改变导致遗漏] → 用全仓库旧路径扫描、architecture verifier、unit/integration/system affected verification 三层检查。
- [HTTP 路由提取改变安全或错误行为] → Host 继续提供 write authorization、body reader、JSON/error response；模块保留原有 method、path、字段白名单、状态码和 runtime 调用，并运行 Local App HTTP system tests。
- [模块 composition 与全局 runtime 注册顺序漂移] → `module.mjs` 保留原 repository-before-application 顺序，`compose-runtime.mjs` 在原 Task Record 注册位置调用模块入口。
- [模块边界被误认为整个 Task 已迁移] → 文件名、Change scope、architecture assertions 和迁移记录都明确限定 Task Record；其他 Task 能力继续留在原路径。
- [模块优先规则与渐进迁移期间旧布局并存] → 规范允许未迁移能力暂留全局技术层，但已迁移切片不得保留旧实现或 facade。

## Migration Plan

1. 先更新 capability delta、任务清单和架构 verifier 的预期边界。
2. 移动 Task Record Domain/Application/Persistence/CLI 文件，新增 `module.mjs` 和 HTTP Adapter。
3. 更新 composition root、CLI registry、HTTP Host、Doctor/其他 Task 能力、测试和 Verification selector 的 imports/inputs。
4. 执行旧路径扫描、OpenSpec validation、架构验证、Task Record unit/integration/system 与 affected verification。
5. 验证失败时回滚本 Change 的源码移动和调用方 import；数据库无需回滚，因为 schema 与数据均未改变。

## Open Questions

无。通用 Bootstrap/module descriptor、其他 Task 能力归组和跨模块公开 contract 留给父任务后续贡献决定。
