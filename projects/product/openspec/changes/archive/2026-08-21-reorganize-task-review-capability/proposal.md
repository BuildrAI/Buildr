## Why

Task Review 的领域、应用、持久化和接口实现仍散落在全局技术层与 Bootstrap 兼容注册中，所属模块和 writer authority 不够直观。基础设施与 Bootstrap 合约已经收敛，现在可以把这项专业能力作为窄纵向切片迁入 `task` 模块，降低后续 Task 能力迁移的共享入口冲突。

## What Changes

- 将 Task Review Domain、Application、Repository、CLI 与 HTTP adapter 迁入 `src/task` 对应技术层，并保持技术层内 flat-first。
- 由 `src/task/module.mjs` 通过窄端口提供 Task Review Application、持久化读能力以及 CLI/HTTP contributions。
- 从 legacy runtime 和直接 CLI/HTTP 组装中移除 Task Review 的第二套注册入口；既有 consumer 通过明确兼容端口继续工作，直到各自迁移。
- 同步更新 imports、Bootstrap 组装、Application Payload、Verification owner 和相关测试。
- 不改变公开 CLI、HTTP、JSON、SQLite schema、Review Result、Planning/Completion applicability 或 Task Review writer authority；不包含 Task Retrospective 与 Web Runtime 重构。
- 本变更不包含破坏性变更。

## Capabilities

### New Capabilities

- `task-review-module-architecture`: 定义 Task Review 纵向能力在 `task` 模块中的分层归属、窄模块入口、唯一装配和兼容退出边界。

### Modified Capabilities

无。既有 `task-review-results`、`cli-product-surface`、`public-json-contracts` 和 HTTP 行为要求保持不变。

## Impact

- 影响 `projects/product/services/buildr/src/task`、Task Review 旧实现位置、Bootstrap/CLI/HTTP 组装、Application Payload 输入和 Task Review 相关测试。
- 不新增运行时依赖，不修改 sibling `buildr-web`、React/Vite 源码或 `web-dist` 正式构建 authority。
