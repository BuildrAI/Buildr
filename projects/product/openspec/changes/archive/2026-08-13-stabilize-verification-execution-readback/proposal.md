## Why

正式 Verification 已在执行前创建持久 execution record，但 Agent 只能从同步命令终端取得最终结果；终端或工具 session 丢失后，公共 CLI 无法重新定位同一次执行，Agent 往往只能重跑 50～110 秒的验证。Buildr 需要让既有 execution record 真正承担稳定回读与重复启动保护，同时保持 Task Verification Result、Execution Record 和 transient evidence 的现有权威边界。

## What Changes

- 为 Task execution record 增加公共只读 `list` 与 `inspect` CLI，按 Task、专业视图和 record identity 返回 compact 状态、时间、失败与正文文件入口。
- 为正式 Verification invocation 形成 closed `invocationIdentity`，绑定 Task、target、Project/declaration 与规范化 capability 集合；该字段仍属于现有 execution record authority。
- `verification run` 在启动 capability 前检查相同 `invocationIdentity` 的 active record；默认返回既有执行并且不启动第二份进程，只有显式 `--retry` 才创建新 run 与独立 record。
- 保持 `verification run --json` 的单一 JSON object、同步执行和既有 Result 分离语义；不引入后台队列、第二执行状态存储或自动采用 Verification Result。
- 增加 CLI、Application、SQLite migration、JSON contract 与并发/恢复测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-verification`: 增加 invocation identity、active execution 重复启动保护与显式 retry 语义。
- `task-execution-artifacts`: 在既有单一 Application/SQLite authority 中保存 invocation identity，并开放 Task-scoped compact list/inspect read model。
- `cli-product-surface`: 增加 Agent 可发现的 Task execution record list/inspect CLI 与 `verification run --retry`。
- `public-json-contracts`: 定义 list/inspect 与重复启动结果的 closed portable JSON contract。

## Impact

- `buildr` Service 的 Verification Application、Task Execution Record domain/Application/repository、CLI registry/adapter 与 JSON schema registry。
- Workspace SQLite 连续 migration 与 package baseline。
- Task Verification、execution record、CLI、JSON contract 的 Unit、Component、Contract、Integration/System 测试和实现型文档。
- 不修改 Buildr Web 既有 execution record HTTP/API authority，不新增依赖，不执行发布或 self-bootstrap activation。
