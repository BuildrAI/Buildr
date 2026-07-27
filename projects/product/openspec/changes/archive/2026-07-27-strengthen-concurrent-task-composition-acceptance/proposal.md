## Why

现有双任务组合验收已经覆盖主要能力，但部分承诺只检查了结果字段或底层原语，没有真正执行任务专属 CLI、嵌套仓环境、产品清理入口和完整失败路径。需要补强验收，使 Candidate 的通过证据能够真实证明多任务并发开发与验证边界，而不是依赖实现推断。

本 Change 不包含破坏性变更。

## What Changes

- 从 Workspace、Product 和 Service 等不同 cwd 真正执行两个任务环境各自 receipt 绑定的 CLI invocation。
- 在同一场景中覆盖包含嵌套独立仓库的任务环境，核对完整 repository membership 与执行范围。
- 让两个 Local App 预览并发启动并保持共存，验证端口、状态目录、实例与任务归属不会串扰。
- 通过 Buildr 产品入口执行任务资源与环境清理，验证归属保护、失败路径清理和 retained Workspace 健康，而不是由验收脚本直接删除 Git worktree。
- 让目标分支竞态经过可恢复的收尾流程，并核对只重跑失效步骤及其下游。
- 强化并发 worker 的生命周期、输出收集和诊断，避免空输出或退出状态竞态造成偶发失败。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `concurrent-task-acceptance`: 将双任务组合验收从结构和原语检查补强为真实入口、多仓、并发启动、产品化清理与恢复路径的端到端证明。
- `task-environments`: 新增 receipt-bound 的本地任务环境清理命令，使 Task Finish 和组合验收能够调用同一套归属、集成、干净状态和多仓顺序保护。

## Impact

- 影响 `concurrent-task-acceptance` 的 canonical specification 和 Candidate required gate。
- 影响并发组合验收脚本、测试夹具及相关集成测试。
- 新增 `buildr worktree cleanup` 本地生命周期入口；它不删除远端分支，也不提供丢弃未集成工作的隐式授权。
- 可能调整验收摘要 schema，以记录 CLI 实际执行、多仓 membership、并发启动、产品清理和恢复步骤证据。
- 不改变任务环境、Local App、验证资源协调或 Task Finish 的既有产品边界。
