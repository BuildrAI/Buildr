## Why

Project Daily Progress 仍散落在全局 Domain、Application、Infrastructure、CLI 与 HTTP Host 中，已迁移的 Task Record 又在每个技术层下保留只有一个文件的 `record/` 末级目录；两者都违背当前模块优先、技术层默认扁平的源码布局。现在收敛这两个遗留点，可以在不改变任何公开行为或 writer authority 的前提下，减少 Bootstrap 兼容接线和无意义目录层级，并为父任务最终架构验收消除明确残留。

## What Changes

- 将 Project Daily Progress 的 Domain、Application、文件 Persistence、CLI/HTTP Adapter 与模块组装迁入 `src/workspace/`，由 Workspace module 提供唯一 capability 和 interface contributions。
- 删除全局旧路径及 Bootstrap/HTTP Host 中的 Daily Progress 业务注册或路由实现，继续复用相同 Project/Task 读取能力和同一 ignored YAML writer。
- 将 Task Record 在 `domain/record/`、`application/record/`、`persistence/record/` 下的单文件实现分别扁平化到对应技术层，更新所有 imports、验证 owner 和 package assertions。
- 检查其他已迁移模块的末级目录，仅移除没有多个私有协作者、真实子模块或实现分类意义的单文件目录；正在独立迁移的 Task Delivery/Finish 范围不在本 Change 中修改。
- 保持公开 CLI、HTTP、JSON、YAML/SQLite schema、Task 引用校验、事务、原子性、错误映射和业务 writer authority 不变。本 Change 不包含破坏性变更。

## Capabilities

### New Capabilities

- `workspace-daily-progress-module-architecture`: 定义 Project Daily Progress 纵向切片在 Workspace 模块中的唯一归属、组装与行为保持边界。

### Modified Capabilities

- `product-source-layout`: 明确模块技术层默认扁平，Task Record 等单文件能力不得保留无真实协作边界的末级能力目录。

## Impact

- 影响 `projects/product/services/buildr/src/workspace/`、现有 Daily Progress 全局路径、`src/task/` 的 Task Record 路径、Bootstrap CLI/legacy 组装和 Local App HTTP Host。
- 同步更新架构验证、package assertions、相关 Unit/Component/System 测试、Service 架构文档与 current knowledge。
- 不修改 React/Vite 前端源码、SQLite migrations、公开 schema、文件格式、命令名称、HTTP endpoint 或运行时外部行为。
