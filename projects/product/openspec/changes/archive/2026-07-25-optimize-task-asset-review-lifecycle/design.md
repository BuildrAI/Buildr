## Context

`task-asset-review/v2` 通过用户级 Application Support 和 `workspace.id` 让多个 worktree 共享 observation。这解决了 task checkout 被清理后状态丢失的问题，但把 Workspace 自有的临时治理状态放到了一个用户难以发现、与当前 Workspace 路径无关的位置。

现有 helper 的状态为 `observing -> awaiting-human -> accepted -> deleted`。资格审查、handoff 和完成证据主要依赖 Skill 文案，helper 只验证状态和任意 destination 是否存在：它没有无候选的 `discarded` 动作，不验证 handoff 是否进入独立任务，也不区分 tracked asset、product follow-up 和 no-change 的完成证据。这使错误调用仍可能满足机械门禁。

## Goals / Non-Goals

**Goals:**

- 将 observation authority 固定到 canonical Workspace 的 `.buildr/asset-review/inbox/`，并通过 workspace 根 `.gitignore` 保证其 untracked。
- 让主 checkout、task worktree 和其嵌套执行路径解析到同一个 canonical Workspace inbox。
- 安全吸收 v2 用户级 inbox 的既有 observation，不覆盖、不合并不一致内容。
- 让无候选丢弃、人工决定、独立 handoff 和最终完成证据成为可验证状态机。
- 通过 `buildr.task-asset-review/v3` 明确破坏性 guarantee 变化，并同步所有消费者和投射面。

**Non-Goals:**

- 不把 observation 纳入 Git；长期 tracked 历史仍只保存在 `asset-maintenance/` 或 OpenSpec。
- 不引入公共 CLI、daemon、watcher、数据库、全局索引或跨机器同步。
- 不保存完整对话、完整工具日志或隐藏推理。
- 不让 Task Finish 接管候选筛选、资产分类或长期记录生成。

## Decisions

### 1. Workspace 本地状态与 tracked 历史分层

运行中的 observation 写入 `<canonical-workspace>/.buildr/asset-review/inbox/<observation-id>.md`，根 package baseline 的 `.gitignore` 增加 `/.buildr/asset-review/`。该目录随物理 Workspace 移动或删除，但不随 Git clone、commit 或 push 传播。

接受后的长期事实继续使用：Rule、Skill、capability Contract 写入 tracked `asset-maintenance/`；product follow-up 由 OpenSpec proposal/design 吸收。observation 只承担从任务信号到长期资产的临时交接。

没有选择把整个 `.buildr/` 忽略，因为 `workspace.yml` 与 builtin receipts 仍是受管事实；只忽略运行状态子目录。

### 2. canonical Workspace root 解析

helper 先定位当前执行树的 `.buildr/workspace.yml` 并读取 `workspace.id`。当该根属于 Git linked worktree 时，使用 Git common dir 推导主 checkout 候选，并仅在候选存在同 id 的 `.buildr/workspace.yml` 时采用；否则保留当前根。非 Git Workspace 直接使用当前根。

这样 task worktree 不会把 observation 写入会被清理的副本；独立 clone 即使复制了同一个 `workspace.id`，也因物理 canonical root 不同而保持隔离。候选 identity 不匹配时 fail closed，不按目录名猜测。

### 3. v2 legacy observation 安全迁移

首次 `start`、`list` 或 mutation 时检查旧 `<Buildr user state>/asset-review/<workspace-id>/inbox/`：

- 目标不存在且 observation identity 匹配时，使用同文件系统可用的原子 rename；跨文件系统时 copy、fsync/close、identity 复核后删除来源。
- 目标存在且内容完全一致时删除重复 legacy 文件。
- 目标存在但内容不同、文件损坏或 owner/Workspace identity 不匹配时停止迁移，保留两侧并返回诊断。
- legacy inbox 清空后只清理可证明为空的该 Workspace 子目录，不批量删除其他 Workspace 状态。

### 4. 明确资格审查终态

新增 `discard` action：仅允许 `observing` 状态在 provider 已完成覆盖核验并证明没有合格候选时调用，直接删除 observation 并返回 `result: discarded`。它不需要人工 reject，因为没有候选需要人做价值判断；人工 reject 仍只处理 `awaiting-human`。

`finalize` 必须提供结构化候选类型、覆盖结论和证据摘要，成功后返回 `awaiting-human`。已经由当前任务完整修复、完整覆盖或不具长期价值的信号必须 discard，不能再次生成同一修改的候选。

### 5. handoff 与 complete 使用类型化证据

accept 只记录人工决定。handoff 至少包含新的 task id、来源 task id、目标类型和目标资产/change；新 task id 必须不同于来源 task id。

complete 按 outcome 验证：

- `asset-integrated`：要求 asset type/id、tracked maintenance record 路径、commit、target branch 和 remote ref evidence。
- `product-absorbed`：要求 change id、proposal/design 路径和已保存来源事实的证据。
- `no-change`：要求新任务的正式核验结论和稳定证据引用。

helper 只验证证据形状、Workspace 内路径和可读取的本地事实；它不替 GitHub、OpenSpec 或 Agent 判断业务真伪。无法证明时保留 observation。

### 6. capability 升级为 v3

存储 authority 从用户级 identity state 改为 Workspace-local state，突破 v2 Minimum Guarantees，不能继续宣称 v2 conformance。新增 v3 contract，provider 与 Task Finish optional requirement 一次切换；v2 文件可作为历史 contract 保留，但不再 selected/bound。

## Risks / Trade-offs

- [linked worktree 的 canonical root 解析错误] → 同时校验 Git common dir、候选 Workspace manifest 和 `workspace.id`，任何不一致 fail closed。
- [旧 observation 迁移冲突导致任务暂停] → 保留来源和目标，返回精确路径与 identity，不自动择一覆盖。
- [Workspace 被整体删除时 observation 一并丢失] → 这是 Workspace-local untracked 状态的预期边界；接受后的长期事实必须先进入 Git/OpenSpec 才允许 complete。
- [helper 证据字段变多增加调用成本] → 只要求完成门禁所需的最小类型化字段，并由 Skill 提供固定命令示例。
- [v2 到 v3 切换使 Task Finish 暂时 degraded] → provider、contract、manifest、consumer 和 runtime routing 作为同一 package change 原子发布并做组合测试。

## Migration Plan

1. 先发布 v3 contract、provider/helper、consumer binding 和 `.gitignore` baseline。
2. 在临时 Workspace 与真实 linked worktree fixture 中验证 canonical inbox、untracked 和迁移冲突行为。
3. workspace `update/sync` 后，新 helper 在首次访问时迁移该 Workspace 的 legacy observation。
4. 迁移失败时保留 v2 来源并报告；回滚到 v2 provider 时旧来源仍可读取，不发生不可逆批量删除。

## Open Questions

无。用户已明确选择 `.buildr/asset-review/` 且要求 untracked；本设计将“同一 Workspace 共享”解释为同一物理 canonical Workspace 的主 checkout 与 linked task worktrees 共享。
