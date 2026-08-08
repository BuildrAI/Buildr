## Why

Skill 投射所有权回执是 Buildr 用来证明 runtime 文件身份、更新权和清理权的控制状态，但当前保存在各 Agent runtime 根下的 `buildr/skill-projection-receipts/`。这让 Buildr 私有治理状态与 Agent 实际消费的 runtime 资产混在同一命名空间，也无法从路径直接看出“Buildr 为哪个 Agent、哪种 destination、哪类 Skill 投射保存的所有权回执”。

## What Changes

- **BREAKING**：将 workspace Skill 投射所有权回执迁移到 `<workspace>/.buildr/agent-runtime/workspace/<adapter>/skill-projection-ownership-receipts/<runtime-path>.json`。
- **BREAKING**：将 user Skill 投射所有权回执迁移到 `<user-home>/.buildr/agent-runtime/user/<adapter>/skill-projection-ownership-receipts/<runtime-path>.json`，避免用户 home 同时作为 workspace 时发生 destination 冲突。
- 保持实际 Skill 投射目录不变；例如 Codex 仍从 `.agents/skills/` 或用户级 `.agents/skills/` 消费 Skill。
- render、sync、Doctor、runtime check、Component lifecycle 和冲突预检统一使用新路径。
- 把旧 adapter runtime 根中的 `buildr/skill-projection-receipts/` 作为一次性迁移输入：只有旧回执有效且对应 runtime 文件仍可证明时才迁移；迁移成功后删除旧回执，不保留长期双 authority。
- Workspace 初始化和 sync 幂等维护 `/.buildr/agent-runtime/` Git ignore；用户级路径天然位于 workspace Git 范围外。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-first-runtime-projection`：修改 Skill 投射受管文件回执的位置、destination 隔离和旧路径迁移契约。
- `managed-skill-assets`：修改 user/workspace Skill ownership receipt 的定位与整包更新边界。
- `agent-readable-doctor`：修改 present runtime inventory 与投射诊断读取的回执位置和兼容迁移诊断。
- `buildr-package-assets`：新增 `/.buildr/agent-runtime/` 的受管 Git ignore 基线。

## Impact

- Runtime infrastructure：Skill inventory、receipt path resolver、render plan、reconcile 和 adapter detection。
- Product applications：Doctor、runtime check、Component install/uninstall、builtin lifecycle 和 workspace sync。
- Workspace/user filesystem：新增 destination-aware Buildr 控制状态路径，受控清退旧 runtime metadata 路径。
- Tests/docs：更新所有 adapter 的路径契约、迁移/冲突/幂等回归、CLI/reference 文档和发布说明。
