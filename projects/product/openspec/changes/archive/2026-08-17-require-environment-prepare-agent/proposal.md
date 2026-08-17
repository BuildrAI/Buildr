## Why

`task environment prepare` 省略 `--agent` 时会静默登记 Codex，并把默认任务分支写成 `codex/<task-id>`。Cursor 等其他宿主按字面省略参数后，Finish Doctor 会按 Environment 里的 Codex 检查，导致本机 Cursor 任务被当成 Codex 任务。现在必须让调用方写明当前宿主，不再用产品默认值猜身份。

## What Changes

- **BREAKING**：`buildr task environment prepare` 的 `--agent` 从可选变为必填；省略时 MUST 以 CLI syntax 失败、非零退出，且 MUST NOT 默认为 `codex` 或任何其他 adapter。
- 首次 prepare 的 Application 在缺少 adapter 时 MUST fail closed；已有 Environment 恢复时仍以 Receipt 登记的 adapter 为准，显式传入的 `--agent` 不一致则继续 mismatch。
- 未显式 `--branch` 时，默认任务分支 MUST 为 `<adapter>/<task-id>`，跟随本次实际 adapter，不得硬编码 `codex/`。显式 `--branch` 仍优先；恢复 MUST 继续匹配已保存 Git evidence。
- 帮助、CLI Reference、`task-environment` Skill 与相关测试 MUST 要求写出当前宿主；Buildr MUST NOT 静默探测当前 Agent host。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `cli-product-surface`: prepare 的 `--agent` 改为必填，usage/help 不得再把它写成可选或暗示可省略。
- `task-environments`: 首次 prepare 必须登记调用方给出的 adapter；缺 adapter 不得默认 Codex；默认 Git 分支前缀跟随实际 adapter。
- `agent-task-workflows`: 正式准备/恢复 Environment 时，`task-environment` Skill 必须把当前宿主写入 `--agent`，不得省略。

## Impact

- Buildr CLI `task environment prepare` 解析、帮助与 CLI Reference。
- Task Environment Application 的 adapter 解析与默认分支。
- `task-environment` Skill 示例与停止条件。
- 现有省略 `--agent` 或断言 `codex/<task-id>` 默认分支的测试与文档。
- 已存在的 Environment Receipt 不迁移；新行为只约束新的 prepare 调用。不改变 Doctor、Finish `--agent`、共享 Skill receipts 或 GitHub probe。
