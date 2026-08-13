## Why

Buildr 自举 Workspace 中可能同时保留多个不同 Finish run 合法拥有的 recovery carrier。当前 bundled self-bootstrap runner 只证明并排除当前 run 自己的 carrier，因此会把其他合法 carrier 当作未知 dirty path 阻塞；Agent 只能逐个调查 owner、状态和恢复顺序，增加误操作风险与人机往返。

## What Changes

- 在现有 `buildr-self-bootstrap-sync` bundled runner 的副作用前增加只读多 run carrier 预检。
- 从 carrier 目录名解析候选 run identity，并只通过现有 `task finish inspect --run ... --detail full --json` 读取每个 owner 的当前或终态事实。
- 核对 carrier 的真实目录、非符号链接、canonical Workspace containment、Result 声明路径、run identity、状态、恢复令牌与允许动作，生成确定性的 owner-ordered recovery plan。
- 当存在合法 predecessor 时，返回完整顺序、授权点、owner command 与预期 effects；当前调用保持 blocked，不代替其他 Finish owner 执行 cleanup、activation 或 resume。
- 对未知目录、无法读取的 run、identity/path/token 漂移、不可恢复状态或重复/循环依赖继续 fail closed，且不忽略、不删除任何 foreign carrier。
- 不新增 Product Application、CLI authority、SQLite 表、Receipt、队列或跨 owner mutation 权限。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-closeout-orchestration`：增加 bundled self-bootstrap runner 对多个合法 Finish recovery carrier 的只读发现、owner 验证、确定性排序和 fail-closed 恢复计划要求。

## Impact

- Workspace-only Skill：`skills/buildr-self-bootstrap-sync/SKILL.md`。
- Bundled runner：`skills/buildr-self-bootstrap-sync/scripts/closeout.mjs`。
- Buildr Service integration/contract tests；runner 仍不进入 npm package 或普通用户 Workspace。
- Product canonical spec、Change Brief 与必要的技术架构说明。
- 不产生发布、安装、真实 Finish resume、carrier 删除或其他外部副作用。
