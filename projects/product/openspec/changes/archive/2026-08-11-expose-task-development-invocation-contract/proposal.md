## Why

Task Development 内部 driver 当前只提供一行通用 usage，复杂 action 的字段结构、必填项与最小合法输入只能通过阅读 Application 实现或测试推断。本次复盘已经观察到一次因输入层级错误产生的无效调用，因此需要让 Agent 在执行前取得与真实校验逻辑一致的可发现调用契约。

## What Changes

- 为 Task Development driver 提供 action 级 `--help`，展示用途、公共参数与输入发现入口。
- 为每个 action 提供机器可读 `--schema`，描述 `--input-json` 的 closed JSON shape、必填字段与约束。
- 为需要结构化输入的 action 提供最小合法 `--example`；无输入 action 明确返回空对象示例。
- 让 Application 的字段白名单与 driver 输出的 schema 共用同一份 action contract，避免手写帮助与真实校验规则漂移。
- 保持现有 action、默认 operation result、profiling、Receipt 与 Application 语义兼容；不新增公共 `buildr task development` CLI。

本变更不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-development`：增加内部 driver 调用契约的 action 级可发现性与同源约束。

## Impact

- 修改 `services/buildr/src/interfaces/internal/task-development-driver.mjs` 的参数发现行为。
- 在 Task Development Application 附近增加可复用的 action contract 定义，并让顶层字段校验消费该定义。
- 增加 Unit/Integration/Contract 测试，覆盖 help、schema、example、未知 action/选项和原有 operation 兼容性。
- 不增加第三方依赖，不改变 SQLite、Development Receipt、Local App 或公开 CLI。
