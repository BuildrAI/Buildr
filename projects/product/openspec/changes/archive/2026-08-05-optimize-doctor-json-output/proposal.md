## Why

`doctor --json` 当前默认返回完整资产与 runtime 明细；在较大的 Workspace 中输出已超过 Node `spawnSync` 默认 1 MiB 缓冲区，导致 `sync` 把 `ENOBUFS` 误判为 Doctor 业务失败。默认结构化入口和内部健康判定都应使用紧凑结果，完整明细只在显式诊断时返回。

## What Changes

- **BREAKING**：`doctor --json` 默认返回 compact 结果；调用方需要完整资产、capability graph 或 runtime inventory 时显式传入 `--detail full`。
- `sync`、Component reconcile 等内部 Doctor consumer 显式请求 compact JSON，不依赖 CLI 默认值。
- 内部 Doctor 子进程使用有限的 4 MiB 输出缓冲区，并区分 Doctor 业务失败、进程启动/捕获失败与输出超限。
- 增加大于 1 MiB 的健康 full Doctor 输出、compact 默认输出和内部 consumer 成功/失败分类回归。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-readable-doctor`：调整 JSON 默认详细度和 full opt-in 行为，保持 compact 结果包含稳定健康判定与可执行下一步。
- `buildr-product-capability-sync`：约束 sync 与其他内部最终 Doctor consumer 使用 bounded compact 输出，并准确分类执行失败。

## Impact

- 受影响实现：Doctor CLI 输出选择、`sync` 与 Component reconcile 的最终 Doctor 子进程执行。
- 受影响公开行为：依赖 `doctor --json` 默认返回完整 inventory 的调用方需增加 `--detail full`。
- 不改变 Doctor 检查集合、`ok`/`health` 语义、finding 语义、非 JSON 文本输出或公开 schema identity。
