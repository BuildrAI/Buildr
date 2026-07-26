## Why

新的持久化 Task Finish 与 task environment execution binding 已经完成职责收敛，但审查发现 run 路径、步骤证据、共享 lease 和 CLI bootstrap 仍存在可绕过或自锁的边界；同时普通 Rule/Skill 内容修改被过宽地纳入 session activation 专项验收。现在需要把实现、契约、路由描述和反例测试统一到同一安全语义，避免健康 doctor 掩盖真实执行风险。

## What Changes

- 限制 finish run identity 与持久化路径，防止 run id 越过 canonical runs root。
- 为 finish step completion 建立最小 evidence 门禁，并要求 `integration-push` 必须携带匹配的远端 ref observation。
- 为共享 lease 增加 owner/token fencing 与失效检查，防止旧持有者删除新 lease 或在失去 lease 后提交成功。
- 调整 task environment CLI identity bootstrap：创建结果允许当前对话继续，但后续 execution binding 必须收敛到 environment-local CLI，不能由创建者 CLI identity 永久锁定。
- 普通 task environment 不再返回 session handoff/adopt next action；只有 runtime discovery/loading/activation 机制本身发生变化且专项验收要求 activation proof 时，才消费 activation evidence。
- activation evidence 同时绑定规范化 session root 与 handle；root 或 handle 变化时不得返回已验证。
- 统一 `task-finish` Skill frontmatter、package manifest 与 workspace manifest 的 routing description，并增加一致性验证。
- 不包含破坏性外部 API 变更；旧 finish run 若不满足新增证据要求，将 fail closed 并要求重新领取对应步骤。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `task-finish-execution`: 收紧 run identity、step evidence、远端 observation、lease fencing 与恢复语义。
- `task-environments`: 修正 environment-local CLI bootstrap、普通 execution readiness 和专项 activation evidence 边界。
- `agent-task-workflows`: 明确普通 Rule/Skill 内容修改不要求新 session，只有 runtime activation 机制专项验收才检查 activation evidence。
- `buildr-package-assets`: 要求内置 Skill 的 package/workspace manifest description 与 Skill frontmatter 保持一致。
- `workspace-first-runtime-projection`: 将 activation guidance 限定为 discovery/loading/activation 机制专项验收，不把普通资产内容修改当作 session 门禁。

## Impact

- Buildr CLI：`buildr task finish inspect|advance|resume`、`buildr worktree create|context|adopt`。
- 持久化状态：`.buildr/task-finish/runs/`、`.buildr/task-finish/leases/`、task environment receipts/adoption receipts。
- 工作资产：`task-worktree`、`task-finish`、相关 capability contracts、package/workspace Skill manifests。
- 验证：finish-run unit/CLI tests、worktree integration tests、package/static contract tests，以及反例回归覆盖。
