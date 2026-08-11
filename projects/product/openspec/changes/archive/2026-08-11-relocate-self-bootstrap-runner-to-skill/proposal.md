## Why

当前确定性自举收尾 runner 虽然没有公共 CLI 或普通 Workspace 路由，但源码仍位于 Buildr npm package 的 `src/` 发布范围，普通用户会收到其实现文件。这与该能力只属于 Buildr 自举 Workspace、普通用户既不安装也不需要该能力的边界不一致，需要在本次任务形成最终候选前纠正。

## What Changes

- 将 runner 及其命令入口迁入 `buildr-self-bootstrap-sync` Skill 的 `scripts/`，作为该自举 Skill 的内部实现。
- Runner 通过已交付的 Product CLI 只读取得同一 Finish Result，不再导入 Buildr 产品内部 Application 模块。
- 删除 npm package `src/` 中的 self-bootstrap runner 与内部 driver，并以 package dry-run 证明发布内容不再包含 runner。
- 保留现有 `resolvedContext`、固定阶段、幂等恢复、精确 Git 边界和 same-run resume 语义；不改变普通用户 Task Finish 行为。
- 非破坏性变更：现有用户可见 CLI、Result schema 与普通 Workspace 能力不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-closeout-orchestration`：明确 runner 必须由 Buildr 自举 Workspace Skill 自身携带，且不得进入 Buildr 用户 npm package 或普通 Workspace Skill 集合。

## Impact

- Workspace Skill：`skills/buildr-self-bootstrap-sync/`。
- 自举 Component：`components/workspace/buildr-self-bootstrap/` 的完整目录 integrity 与说明。
- Product package：删除 `services/buildr/src/application/self-bootstrap-closeout/` 和内部 driver，更新相关契约/集成测试。
- Current knowledge：Buildr Service 与 OpenSpec lifecycle 对 runner ownership、调用入口和发布边界的说明。
