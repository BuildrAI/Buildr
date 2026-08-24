## Why

Task Execution、Project Verification、Task Environment、Execution Record 与 Git Worktree provider 当前仍有跨层实现和反向依赖，导致模块 owner 不清晰，尤其是 Verification 复用 System Doctor parser。第二轮第三个 Child 需要在不改变既有生命周期和公开行为的前提下完成边界收敛。

## What Changes

- 建立 Task Execution/Verification 的模块级 owner 与 Application/Infrastructure 依赖方向。
- 将 Project Verification declaration parser/validator 从 System Doctor application 依赖中抽出，由 Verification 侧持有，Doctor 只消费诊断适配结果。
- 将 verification execution/evidence/resource/process 组件归入 Verification infrastructure；Task Execution Record 与 Task Environment 继续由 Task application/domain/persistence 持有。
- 将 Git Worktree provider 归入 Task infrastructure，并保持 provider identity、CLI、Environment Receipt、SQLite、事务、锁和 cleanup 行为不变。
- 保留既有 CLI、HTTP、JSON envelope、Result 字段语义和运行副作用；不引入 Ajv、完整 Schema、DTO 自动生成或 HTTP client。

## Capabilities

### New Capabilities

- `task-execution-module-boundaries`: 定义 Task Execution、Verification、Task Environment、Execution Record 与 Worktree provider 的静态 owner、依赖方向和兼容性约束。

### Modified Capabilities

无。既有 Task Verification、Task Environment 与 Task Execution Record 的运行时要求不变，本 Change 只增加可验证的结构边界。

## Impact

- 影响 `projects/product/services/buildr/src` 下的 Verification、Task、Doctor、Bootstrap 组装与 Worktree provider 路径。
- 影响 architecture boundary/contract tests 及相关 import 路径；不改变公开接口和持久化格式。
