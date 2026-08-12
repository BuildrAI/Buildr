## Why

Task Finish 当前只运行未选择 Agent 的 inventory Doctor；这既不能严格证明普通用户 Workspace 的当前 Agent runtime 已就绪，又会让 Buildr 自举 Workspace 在新版 Component 尚未 sync 时先被 Doctor 阻塞，导致已经追加的 Self-bootstrap 流程没有机会修复现场。需要让普通 Workspace 保持严格失败，同时允许已安装自举增强仅对可恢复的 retained Doctor 阻塞执行一次受控 Sync 并恢复同一 Finish run。

## What Changes

- Task Finish 使用 run 绑定的 Agent 执行 retained Doctor，并让普通 Workspace 的 Doctor failure 继续阻塞 deliver 与 cleanup。
- retained Doctor 阻塞时保存已经完成的 carrier、remote readback、冻结 Task Contribution 与精确 resume evidence，使同一 run 可以在外部条件修复后重试 deliver。
- `buildr-self-bootstrap` 的 `task-finish@append` 覆盖默认停止逻辑：只有冻结贡献命中自举动作、前序交付已完成且唯一当前失败为 retained Doctor 时，才先执行 Self-bootstrap Sync/安装，再用产品 resume token 恢复同一 Finish；恢复后的指定 Agent Doctor 是最终判定。
- Formal Finish 已正常完成时继续采用既有 post-Finish Self-bootstrap activation；普通用户 Workspace 不获得自举 Skill、恢复路由或 Doctor 绕过能力。
- 补齐 CLI/public JSON、package/runtime parity、普通 Workspace fail-closed 与自举 Doctor recovery 的自动化验证。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: retained Doctor 改为指定 Agent 检查，并让 Doctor 阻塞保存可恢复的 delivery evidence。
- `agent-task-workflows`: 自举 append 可以对精确 retained Doctor 阻塞先执行专属 activation，再恢复同一 Finish；普通 Workspace 仍直接失败。
- `buildr-package-assets`: package/runtime verification 覆盖用户 Workspace 严格 Doctor 与自举 Workspace 的 Doctor recovery 分支。

## Impact

- Product Application：Task Finish deliver、blocked Result、resume 与 compact JSON。
- Workspace assets：随包 `task-finish` Skill、仅自举 Workspace 安装的 `buildr-self-bootstrap-sync` Skill 和 contribution。
- Verification：Task Finish unit/integration/system、public JSON contract、package/runtime parity 与 self-bootstrap sequencing。
- 不新增 schema migration、SQLite 表、event/history store、任意 hook、通用 activation DAG 或用户 Workspace 自举依赖。
