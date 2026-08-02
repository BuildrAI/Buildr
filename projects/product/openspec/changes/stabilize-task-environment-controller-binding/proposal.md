## Why

Task Environment 当前把 retained Buildr 的 `controller.identity` 同时当成 Environment ready 门槛、动态资源 owner 和 Verification context identity。结果是 canonical Workspace 的 Buildr 从 M1 正常前进到 M2 时，即使 Task checkout、provider evidence、projection、依赖和资源都没有变化，仍会把停留在 M1 的 Task Environment 误判为 broken，甚至尝试用 controller handoff 改写 Receipt。

Task Environment 的源码版本基础应来自 Task checkout/provider evidence。retained Buildr 只负责以可信、干净的实现执行 Environment 操作；它自己的 content hash 不是 Task checkout 的版本 authority。

## What Changes

- 明确 Task Environment 的源码基础由实际 scope、execution root 与 Git provider 的 start point、branch、HEAD、clean/registration evidence 决定；retained Workspace 前进不自动 fetch、rebase、同步或失效 Task checkout。
- 保留 Git-backed retained Environment Manager 的 source clean 门禁：实际执行源码的 `bin/`、`src/`、`package/`、`package.json`、`package-lock.json` 必须没有 staged、unstaged 或 untracked 变化，`.buildr/` 不参与检查。
- `controller.identity` 仅保留为创建 Receipt 时的 Buildr 实现指纹和兼容诊断信息；后续 content identity 变化不阻断 `inspect`、`prepare`、资源操作或已授权 `cleanup`，也不触发 handoff、rebind 或 generation transition。
- candidate task worktree 中的 Buildr 仍只能只读检查自己的 Environment，不能创建、恢复、认领资源、释放资源或清理该 Environment。
- Preview 动态资源 ownership 改为绑定 Task ID、canonical Workspace、Environment root、resource ID、provider identity 与 handle，不再比较 controller hash。
- Verification evidence applicability 改为绑定 Project policy、Task/Candidate repository identity、实际 Environment/execution root、Runtime/CLI/依赖/projection、Workspace Node 与 checks，不再纳入 retained controller content identity；Task Finish prepare/recovery input identity 也只保留 manager adapter 与实际 Environment/Candidate facts。
- 不增加 Environment update/rebase 命令、通用状态机、revision、历史记录或新 Receipt；Task 是否吸收主 Workspace 变化继续由 Task Development/Finish 的显式 Git 操作决定。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-environments`: 纠正 Task checkout/provider evidence、Environment Manager trust、Receipt controller 指纹与动态资源 ownership 的 authority 边界。
- `task-verification`: 移除 retained controller content identity 对 Verification evidence applicability 的影响，保留 Candidate、Environment/projection/check identity 门禁。
- `agent-task-workflows`: 让实现型 workflow 绑定 Task execution context，而不是稳定 controller content identity。
- `concurrent-task-acceptance`: 让双 Task 验收按 Task/Workspace/scope/provider/allowed roots 区分 Environment。
- `worktree-local-app-preview`: 让 Task Preview 登记与停止只依赖 Environment resource/provider ownership。
- `task-finish-execution`: 让 cleanup handoff 通过可信 retained Environment Manager 执行，而不比较其 content hash。

## Impact

- 修改 `services/buildr/src/application/task-environment/task-environment-application.mjs`，保留 manager clean/candidate guard并删除 content identity drift 与 cleanup handoff。
- 修改 Local App Preview owner/caller 结构和 `preview-ownership` 测试，使资源 ownership 使用 Environment/resource/provider facts。
- 修改 Verification evidence identity material、Task Finish prepare input identity 和测试，证明 retained controller 指纹变化不会单独改变 applicability/recovery identity。
- 更新 Task Environment / Task Verification specs、Buildr package Skill/contract、CLI/JSON 文档和 current knowledge；不修改 Task Finish 的 `.buildr/` clean 判定，也不触碰 `introduce-task-review-results`。
