## Context

现有 task environment lifecycle 已经能创建 canonical checkout、自动准备 checkout-local Agent runtime，并由 `worktree context` 核对 receipt、repository membership、`allowedExecutionRoots` 与 checkout-local CLI source。该证据只覆盖文件系统与命令执行上下文；它无法区分“原 session 把工具 `cwd` 指向新 worktree”和“Agent runtime 以 environment root 启动或重新进入并在 session start 发现 checkout-local Skills”。

Codex 的 Rules activation 是 `path-read`，Skills activation 是 `session-start`。因此 runtime projection 完成后，Rules 可随路径读取生效，但 Buildr 不能承诺同一 session 立即重新发现 Skills。设计必须把 Buildr 可验证的本机事实与 Agent/runtime host 提供的 session 事实分开，同时让下游 Skill、验证和收尾能消费统一 evidence。

## Goals / Non-Goals

**Goals:**

- 让 task environment 明确经历 `environment-ready -> handoff-required -> adopted`，采用完成前不得开始 proposal、编辑、构建或验证。
- 绑定 environment identity、session workspace root、checkout-local runtime source identity、adapter activation 与 Agent session 声明。
- 对缺失、陈旧、跨 environment 或只证明命令 `cwd` 的 evidence fail closed。
- 为 Codex 和其他 adapter 保留各自 activation 边界；只有 runtime 明确支持 reload 时才允许 reload adoption。
- 保持合并后从 retained checkout sync 主 Workspace runtime 的既有责任边界。

**Non-Goals:**

- 不让 Buildr 启动、控制、迁移或监控 Agent session，也不接入 Codex 私有会话状态。
- 不提供 OS/container 级隔离，不把 Agent 声明提升为密码学身份认证。
- 不承诺已运行 session 因 runtime 文件变化而即时重发现 Skills。
- 不从未合并 task checkout 更新原 Workspace 或 user destination runtime。

## Decisions

### 1. 将 environment readiness 与 session adoption 分成两类 evidence

`worktree create/inspect/context` 继续生成 Buildr 可直接验证的 environment evidence，并新增 `runtimeExpectation`：adapter、environment root、runtime source root、runtime projection identity、Rules/Skills activation、允许的 adoption mode 与是否要求新 session。

另设 task-local adoption receipt，记录 Agent/runtime host 提供的 `sessionHandle`、`sessionRoot`、`rootEvidenceSource`、`adoptionMode`、`startedOrReenteredAt`，以及 adoption 时重新核验的 environment/runtime identities。receipt 只表示“Agent 对 host-visible session context 的声明已与 Buildr 期望值匹配”，不得描述为 Buildr 直接内省或认证了 Agent。

选择该分层而不是让 `worktree context` 根据进程 `cwd` 自动通过，因为工具进程 `cwd` 正是现有证据缺口；也不读取 Codex 私有数据库或 UI 状态，因为这会把 Buildr 变成 runtime-specific session connector。

### 2. 使用显式 adoption/handoff 协议

task-worktree provider 在创建新 environment 后返回 `handoff-required` 和 Agent-readable next action。当前 session 必须请求 runtime host 以 environment root 启动新 session，或使用该 runtime 明确支持且可证明的重新进入/显式 reload 能力。新 session 再从 checkout-local CLI 提交 host-visible session evidence，CLI 校验并写入 adoption receipt。

`session-start` activation 只接受 `new-session` 或 runtime host 能证明等价重新进入的 mode；单纯改变工具 workdir、shell `cd`、重新运行 doctor/sync 或手工读取 Skill 文件均不满足。`explicit-reload` 只有同时提供 descriptor guidance 和 host evidence 时可以采用 `reload`；`immediate`/`path-read` 仍必须证明 session root，但不额外声称 session-start 事件。

选择显式协议而不是自动采用，是为了让无法提供 session evidence 的 runtime 保持诚实的 `handoff-required`，同时给 task Skills 一个稳定门禁。

### 3. adoption receipt 绑定 identity，任何相关漂移使其失效

receipt 绑定 task/environment id、owner Agent、repository plan digest、environment root、adapter、checkout-local runtime source root 与 projection identity。environment 被重建、repository plan 改变、runtime sync 改变 projection identity、session root 改变或 session handle 不匹配时，`worktree context` 返回 `adoption-stale`/`session-mismatch`，要求重新 handoff/adopt。

下游 consumers 只接收同一 context 返回的 `adoption.status=adopted`；不得只检查 receipt 文件存在。receipt 属于 Buildr-owned local task state，不进入 Git tracked source，也不跨 clone 复用。

### 4. 公开 evidence assurance 与不可证明项

JSON 明确区分：

- `environmentEvidence.assurance=buildr-verified`：checkout、CLI、runtime projection 与 identity 由 Buildr 核验；
- `sessionEvidence.assurance=agent-attested`：session root/start/reentry 来自 Agent/runtime host 可见上下文，Buildr 只核对结构与期望值；
- `adoption.status=handoff-required|adopted|stale|blocked`。

如果 runtime host 不暴露 session root 或 session handle，Buildr 返回缺失字段与 next actions，不生成 warning 冒充成功。公开文档必须解释该 assurance 边界。

### 5. 收尾与主 runtime sync 保持单向边界

task environment adoption 只授权该 environment 的任务执行，不改变原 Workspace runtime。Task Finish 仍先完成验证、集成和入口安全迁移；合并后从 retained checkout 对原 Workspace 执行 sync/doctor。adoption receipt 不复制到 retained checkout，并随 task environment 安全清理。

## Risks / Trade-offs

- [Agent/runtime host 只能提供声明而非 Buildr 可独立内省的事实] -> JSON 暴露 `agent-attested` assurance，保存匹配的 environment/runtime identity，缺失时 fail closed，绝不声称密码学认证。
- [强制新 session 会打断当前对话连续性] -> handoff evidence 返回 task/change/environment、Git 状态与下一动作；runtime 支持可证明 reload/reentry 时允许按 descriptor 使用，不统一承诺热加载。
- [runtime sync 会频繁使 adoption stale] -> 只绑定影响发现结果的 projection identity；adoption 后若确需改变 runtime，明确重新 handoff/adopt。
- [旧 consumers 不认识新增状态] -> JSON 以新增字段向后兼容；Skill consumers 在本 change 同步升级，并对字段缺失按 legacy `handoff-required` 处理而非静默通过。
- [用户误把 session adoption 当作完整隔离] -> context 继续披露 Git metadata shared、external systems project-owned，并把 adoption 限定为 runtime discovery provenance。

## Migration Plan

1. 扩展 runtime adapter evidence 与 task environment local receipt/schema，不迁移已有 tracked 数据。
2. 更新 create/inspect/context 与 task-worktree consumer，使新创建 environment 默认要求 adoption；已有 legacy receipt 返回明确的 legacy/待采用状态。
3. 更新 OpenSpec、验证与收尾 guidance 消费 adoption evidence，并补齐 contract/integration tests。
4. 发布后通过 retained checkout 更新 workspace runtime；发生回滚时忽略或删除新增 local adoption receipts，旧 worktree receipt 保持可检查但不得被新版 consumer误判为 adopted。

## Open Questions

无阻塞实现的问题。具体 CLI 参数名和 session evidence 文件格式可在实现中按现有 public schema 命名约定确定，但不得改变上述 assurance 与 fail-closed 边界。
