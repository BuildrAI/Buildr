## Why

Task Finish 当前只按变更路径判断 runtime 影响，并固定执行 `buildr sync`。这符合 Buildr Product 自举，但会在用户自己的 Workspace 开发 Rule、Skill 时错误更新 Builtin、Component 与其他 Workspace 源资产；交付后真正需要的只是从 retained source `render` Agent runtime。

## What Changes

- 为 Task Finish 增加冻结的 retained activation plan，支持 `none`、`render-runtime` 与 `sync-workspace` 三种类型化模式。
- 只有 retained Project/Service 明确声明 `sync-workspace` 资格，且 Task Contribution 命中声明的 package 输入时才执行 `sync`；缺少声明时禁止隐式 sync。
- Workspace 自有 Rule、Skill 等 runtime source 变化执行 `render` 与 Doctor，并要求不产生 tracked Git delta。
- Buildr 自举 `sync` 只接纳可证明为受管投射的 Git delta；有变化时形成独立 convergence commit、普通 push 与最终远端回读，不修改原 Candidate 或 Formal Verification。
- 保持当前 Delivery Carrier、target-race、Delivery Adaptation、Environment cleanup 与五阶段 run/result v2 边界，不引入任意 shell、部署框架或第二份 Candidate authority。
- 增加普通用户 Workspace render、自举 sync、默认 none、未声明 sync 拒绝、tracked delta 和独立 convergence push 的回归覆盖。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: Task Finish 根据 retained activation binding 与 Task Contribution 选择 `none`、`render-runtime` 或 `sync-workspace`，并收敛对应 Git/Doctor 证据。
- `buildr-package-assets`: Product/package verification 覆盖 activation plan、普通 Workspace render、自举 sync 与 convergence delivery。

## Impact

- Task Finish Application、impact/activation 解析、run/result evidence 与恢复语义。
- Product Project 的 retained activation 声明及其校验。
- Task Finish unit、integration、system 与 package/static/runtime parity 验证。
- Task Finish Skill、CLI reference 与 lifecycle architecture current knowledge。
- 不修改 Task Development、Task Verification、Task Review、SQLite Task Domain 或业务测试断言。
