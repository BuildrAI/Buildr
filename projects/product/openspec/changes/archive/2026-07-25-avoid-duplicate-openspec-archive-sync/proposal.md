## Why

Task Finish 先由 agent 同步 canonical specs、再调用 OpenSpec archive 时，OpenSpec 1.6 会再次尝试应用仍存在的 delta，导致可预期的 “already exists” 失败与额外诊断。

## What Changes

- 明确：手动 sync 已完成且 post-sync guard 通过时，archive 使用 `--skip-specs`。
- 保留默认 archive spec update 路径，未完成手动 sync 或 guard 失败时不得使用该选项。
- 为选择条件增加 Task Finish contract assertions。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: 明确 Task Finish 的 OpenSpec archive 选项选择与停止条件。

## Impact

- 随包 `task-finish`、其 contract tests 和 `agent-task-workflows` canonical spec。
- 不修改外部 OpenSpec CLI/Skills，不新增 capability contract。
