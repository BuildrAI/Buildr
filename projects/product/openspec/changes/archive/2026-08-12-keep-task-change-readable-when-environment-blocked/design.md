## Context

Task-scoped Change Resolver 当前调用 `inspectTaskEnvironment`，并在结果不是整体 `ready` 时直接丢弃候选根。`inspect` 会实时检查 runtime、Workspace CLI、preparation、projection、Git provider 与资源；这些事实决定 Environment 能否执行研发动作，却不都决定一个已保存路径上的 Change 是否可以安全只读。

Environment 已有独立的 saved-current reader：`readTaskEnvironmentCurrent` 从 Workspace SQLite 读取并规范化持久化 Receipt，不执行 probe、不回写 Receipt。Receipt 的 scope 同时保存 Task、Project、`sourcePath`、`executionRoot` 与 `validationRoot`，足以作为候选路径的唯一 authority；文件系统只负责确认该目录当前仍存在且不是符号链接。

## Goals / Non-Goals

**Goals:**

- 将 Task-scoped Change 的只读定位能力与 Environment 整体执行 readiness 解耦。
- 仅依赖 canonical Workspace、Task ID、Project registry 与持久化 Receipt 构造候选根。
- 对 Project scope 与路径归属执行显式、可测试的 fail-closed 校验。
- 保持 Task Record、Task Planning Identity、Task Review 和 Local App 复用同一 Resolver。

**Non-Goals:**

- 不改变 `prepare`、`inspect`、Environment `ready / blocked` 或 cleanup 语义。
- 不允许 blocked Environment 执行命令、验证、写入或注册资源。
- 不增加请求 path、cwd、branch、worktree 名等位置提示。
- 不改变 retained-only 全局 Change collection，也不建立第二个 Environment 或 Change store。

## Decisions

### 使用 saved-current reader，而不是 live inspect

Resolver 改用 `readTaskEnvironmentCurrent`。只有返回 `ready` 或 `blocked` 且包含规范化、字段完整的 `environment` 时才继续解析；`unavailable`、`cleaned`、读取失败或 scope/path 证明不完整时不使用候选根。

选择 saved current 的原因是它直接表达持久化 Receipt authority，且没有 probe、副作用或 readiness 聚合。继续使用 `inspectTaskEnvironment` 再对诊断 code 建白名单会把 Resolver 绑定到不断演进的 probe 分类，并可能在新增非路径诊断时再次隐藏文档。

### 独立验证 Project locator

优先使用精确 `project:<code>` scope。该 scope 必须同时满足：

- `kind` 为 `project`、`project` 与请求一致；
- `sourcePath` 与 Project registry 当前路径一致；
- 非共享 scope 的 `executionRoot` 位于 `validationRoot` 内；`shared: true` 时由 Receipt 对该 Project execution root 的显式归属提供证明。

没有直接 Project scope 时，兼容使用合法 `workspace` scope：其 `sourcePath` 必须为 `.`，`executionRoot` 必须位于 `validationRoot` 内，再以 Project registry 的相对路径构造 candidate，并再次确认 candidate 位于两者边界内。若存在同 selector 但 identity 不匹配，则 fail closed，不把不一致 Receipt 解释成其他 scope。

最终 candidate Project root 还必须是当前可读、非符号链接目录；随后继续复用既有 Change path、artifact 与 symlink 校验。这里的目录检查只证明当前可读性，不取得生命周期或 Environment readiness authority。

### 保持现有回退和 provenance

候选根不可信或当前不可读时，Resolver 保持既有 retained Project 回退。候选存在时仍返回 `task-environment-candidate`，同名 retained Change 仍单独返回 `retained-baseline`；两者都不存在时继续返回 `task_change_unavailable`。

Environment 的 runtime、依赖、projection 等阻塞诊断仍由 Environment read model 展示，不再被 Resolver 转换为 Change 不可用。Resolver 不复制这些诊断或建立第二份状态。

## Risks / Trade-offs

- [Risk] 保存的路径存在，但 Git worktree provider 当前已漂移 → Receipt 仍是路径归属 authority；Resolver 只开放只读 Change artifacts，且目录缺失、symlink 或边界不合法时立即回退，不授予任何执行或写入能力。
- [Risk] legacy Receipt 的 scope 形状与当前契约不同 → saved-current reader 仍可规范化兼容数据，但 Resolver 只接受明确 `ready|blocked` 与完整 scope/path 证明；无法证明时保持 unavailable/retained 回退。
- [Risk] Project registry 路径变化后旧 Receipt 指向过期目录 → `sourcePath` 必须与当前 Project registry 精确一致，避免读取旧位置。

## Migration Plan

无需数据迁移。部署后既有 Receipt 会通过相同 saved-current reader 读取；回滚只需恢复 Resolver 的 root selection，实现不会改写 Receipt、Task Record 或 Change artifacts。

## Open Questions

无。
