## Context

Task Review 当前已有稳定的 Domain 校验、共享 Application writer、SQLite Repository、CLI 命令和 Web prompt 行为，但实现分布在 `src/domain`、`src/application`、`src/interfaces` 与 `src/task/persistence/review`。Repository 由全局 Task persistence 聚合注册，Application 又由 legacy runtime 注册，CLI/HTTP Host 直接引用 adapter，因此同一能力没有单一模块装配入口。

现有 Bootstrap module registry 已支持 capability、CLI/HTTP contribution 和有退出条件的兼容 Facade；Task Record 已作为参考纵向切片迁入 `src/task`。本切片复用该合约，不改变 Task Review Result 或外部接口语义。

## Goals / Non-Goals

**Goals:**

- 将 Task Review 的 Domain、Application、Persistence、CLI 和直接 HTTP adapter 放入 `src/task` 对应技术层，保持层内扁平。
- 用独立 `task-review` module descriptor 声明依赖、能力端口和 CLI/HTTP contributions。
- 让 Bootstrap 成为唯一装配点，并从 legacy registration、全局 Task persistence 聚合和 Host 直接 adapter import 中移除 Task Review。
- 保持所有公开行为、存储行为、事务边界和 writer authority 等价。

**Non-Goals:**

- 不修改 Task Review Result schema、SQLite schema/migration、公开 CLI/HTTP/JSON 或 applicability 规则。
- 不迁移 Task Development、Terminal Delivery、Retrospective、Verification 或 Web Runtime。
- 不调整本次未触达的 `.mjs`；迁移文件保持 `.mjs`，避免把结构移动扩大为类型迁移。
- 不移除仍被未迁移 consumer 使用的 runtime compatibility methods。

## Decisions

### 1. Task Review 作为独立 module descriptor 安装

`src/task/module.mjs` 同时导出既有 Task Record descriptor 和新的 Task Review descriptor。Task Review 依赖 Task Record persistence read、Workspace structured store 与 Change resolver；安装顺序保持 Task Record 在前、Task Review 在后。

相较把 Review 继续塞入 Task Record descriptor，独立 descriptor 能保留能力边界、依赖和 contribution owner；相较建立新的 `task/review/module.mjs`，继续使用 `task/module.mjs` 符合当前窄模块入口和 flat-first 约束。

### 2. 模块内部以私有 composition 组装 Repository 与 Application

模块从 required capabilities 建立私有 composition，先注册 Repository、再注册 Application，然后只导出：

- `task-review.application`：`inspectTaskReview`、`recordTaskReview`、`generateTaskReviewPrompt`；
- `task-review.persistence-read`：只读 locator/read 方法；
- `task-review.bootstrap-compatibility`：仅供尚未迁移的 runtime consumer 和 fault-injection 测试使用，并带明确退出条件。

Repository writer 不作为公开 persistence port；Task Review Application 仍是唯一 Result writer。兼容 Facade 只投射既有实现方法，不创建第二套状态或实现。

### 3. CLI 和直接 HTTP adapter 由 contributions 接入 Host

`task review inspect|record` 改由 Task Review module 提供 CLI contributions，CLI Host 只合并 registry contributions。`POST /prompts/task-review` 改由模块 HTTP contribution 处理，HTTP Host 只提供通用认证与 body reader。

`GET /tasks/:id/reviews` 继续走现有 bounded read worker 和 Terminal Delivery projection；该路径不是直接 Task Review writer/adapter，且迁移它会跨入 Terminal Delivery 与 Web read-runtime 边界，超出本 Child。

### 4. 保持文件内容与运行语义的机械迁移

移动后的路径为：

- `src/task/domain/task-review.mjs`
- `src/task/application/task-review-application.mjs`
- `src/task/persistence/task-review-repository.mjs`
- `src/task/interfaces/cli/task-review.mjs`
- `src/task/interfaces/http/task-review-http.mjs`

除 import、装配入口和 adapter 提取外，不改 Domain、Application、Repository 与 CLI 行为。Application Payload 继续从 `src` 入口递归打包，不增加别名或运行时转换。

## Risks / Trade-offs

- [未迁移 consumer 仍调用宽 runtime methods] → 通过标明 owner、scope 和退出条件的 compatibility capability 暂时投射完全相同的方法，并由最终 legacy convergence 删除。
- [Bootstrap 安装顺序导致缺少依赖] → descriptor 显式 requires Task Record persistence read，module registry 在安装时 fail closed，并用 snapshot contract test 固定顺序与端口。
- [CLI/HTTP 路由重复] → 删除 Host 中原 Task Review executable routes 与 prompt 分支，由 registry contribution identity 唯一性阻止重复注册。
- [移动路径导致 Verification 漏选] → 同步 owner inputs、architecture checks 和 Task Review unit/integration/system/contract tests。

## Migration Plan

1. 建立 Task Review module ports 与 CLI/HTTP contributions，并更新 Bootstrap 安装顺序。
2. 将五类实现移动到 `src/task` 的 flat-first 技术层，更新全部 imports 和测试路径断言。
3. 删除 legacy Repository/Application 注册与 Host 直接 adapter 路由。
4. 运行 typecheck、架构 contract、Task Review unit/integration/system、公共 JSON/CLI/HTTP 与 package 验证。

若验证失败，回滚本 Change 的源码移动和装配改动即可；本变更没有数据 migration、双写或持久化转换。

## Open Questions

无。
