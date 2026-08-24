## Why

Task 生命周期核心已经迁入 `src/task`，但 Finish、Terminal Delivery、Delivery Carrier、恢复和清理仍分散在全局 `application`、`interfaces` 与 Task persistence 子目录中。现在需要完成这一高副作用交付闭环的模块归属，避免 Bootstrap、Application Payload、Doctor 和测试继续依赖第二套旧入口。

## What Changes

- 将 Task Finish、Terminal Delivery、Delivery Carrier、Adaptation、Reconciliation、Activation、Cleanup、Maintenance、Finish diagnostics、execution evidence、retained/bootstrap recovery 与 Git delivery contribution 迁入 `src/task` 的明确技术层。
- 由 `src/task/module.mjs` 提供唯一的 Finish/Terminal Delivery Application、CLI、internal workflow、recovery 和 lifecycle 组装入口，退出旧全局注册与直接内部 import。
- 原子更新 Bootstrap、Application Payload、Doctor 读取路径、Verification owner、架构约束、相关测试与 Buildr 服务架构文档。
- 保持公开 CLI、HTTP、JSON、SQLite schema、Result/Receipt schema、交付副作用、远端证明、恢复、激活、清理和 writer authority 等价；不包含 Web HTTP 或 System Doctor 迁移。

## Capabilities

### New Capabilities

- `task-delivery-finish-module-architecture`: 定义 Task Delivery 与 Finish 集群在 `task` 模块中的技术分层、唯一组装、交付副作用边界、旧入口退出和行为等价要求。

### Modified Capabilities

无。

## Impact

- 生产代码：`projects/product/services/buildr/src/task/**`、现有 `src/application/task-finish/**`、`src/application/task-terminal-delivery/**`、Task Finish persistence、CLI/internal adapters 与 Bootstrap 注册。
- 集成边界：Task Development/Environment/Verification/Execution Record ports、Infrastructure Git/process/filesystem、Application Payload、Doctor 与 self-bootstrap runner。
- 验证和文档：Task Finish unit/integration/system tests、架构边界与 verification registry、`projects/product/docs/architecture/service-architecture.md`。
- 不新增依赖，不改变 SQLite migration 集合或公开产品契约。
