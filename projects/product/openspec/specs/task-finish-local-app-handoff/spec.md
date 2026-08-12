# Task Finish Local App Handoff

## Purpose

Define the safe Local App handoff required before task-finish cleans an integrated task worktree.
## Requirements

### Requirement: 同端口迁移失败必须阻止 cleanup
task-finish MUST 将端口交接视为 worktree cleanup 的前置条件；不得以随机端口、不同端口或只完成 CLI 重装替代成功的同端口迁移。

#### Scenario: 原端口无法重新启动
- **WHEN** 旧实例停止后，保留 checkout 无法在记录端口启动或无法通过健康检查
- **THEN** task-finish MUST 停止删除 task worktree 与本地任务分支的后续动作
- **AND** MUST 保留 task worktree、端口事实与失败原因
- **AND** MUST 报告不得使用新端口替代的原因和恢复路径

#### Scenario: 成功交接后的清理证据
- **WHEN** 新实例已经在记录端口健康运行且其 CLI 入口解析到保留 checkout
- **THEN** task-finish MAY 删除已集成且干净的 task worktree
- **AND** 最终报告 MUST 包含迁移前后端口、入口来源、实例健康结果和 cleanup 结果

### Requirement: Task Finish 必须按 task environment repository set 收尾
当任务包含多个 Git repositories 时，task-finish MUST 以同一 environment receipt 为边界逐仓核对候选、验证、目标 integration branch、提交和集成状态；只有全部 required repositories 安全完成且 task-owned 本机资源已处理后，才能清理 environment。

#### Scenario: 多仓任务全部可收尾
- **WHEN** environment 的全部 required repositories 都有匹配候选 evidence、改动属于当前任务、目标分支唯一且集成前置条件满足
- **THEN** task-finish MUST 向用户一次披露逐仓提交/集成/推送计划和 environment cleanup 范围
- **AND** MUST 逐仓调用 selected providers 并保留每项 result evidence
- **AND** 全部成功后 MUST 按 nested repositories 后 root 的顺序清理 environment

#### Scenario: 一个 repository 无法消歧
- **WHEN** 任一 repository 的目标分支、远端、任务改动、验证 evidence 或 integration state 无法确认
- **THEN** task-finish MUST 停止尚未执行的破坏性动作并保留整个 environment
- **AND** MUST 报告阻塞 repository 与其他 repositories 已完成/未执行的实际状态

#### Scenario: 多仓远端操作部分成功
- **WHEN** 一个 repository 已成功 push、后续 repository push 失败或远端发生竞争更新
- **THEN** task-finish MUST NOT 回滚、force push 或隐藏已经成功的远端状态
- **AND** MUST 保留 task environment，报告逐仓远端 ref 和安全恢复路径

#### Scenario: 其他 task environment 使用相同 source repositories
- **WHEN** 同一 source repository 还存在其他 task environments 的 worktrees 或 branches
- **THEN** task-finish MUST 只集成和清理当前 environment receipt 中的 checkout/branch/resources
- **AND** MUST NOT 停止、迁移、删除或改写其他 environment 的任何成员

### Requirement: Task Finish 必须保留运行中 Buildr Web 的端口
当 task-finish 需要将本机 Buildr 入口从即将清理的 task worktree 迁移到保留 checkout，且存在健康的 Buildr Web 实例时，provider MUST 在停止旧实例前记录其已认证 loopback URL 与端口，并 MUST 使用同一端口启动保留 checkout 的新实例。

#### Scenario: 健康实例需要随收尾迁移
- **WHEN** 已集成的任务 worktree 仍是当前 Buildr Web 或开发 CLI 的来源，且 `instance.json` 对应实例通过带 secret 的健康检查
- **THEN** task-finish MUST 在停止实例前解析并记录该实例的 loopback port
- **AND** MUST 先从保留 checkout 重装开发 CLI 与 development launcher
- **AND** MUST 使用 `buildr web --port <recorded-port> --no-open` 启动或复用新实例
- **AND** MUST 在删除 task worktree 前验证新实例仍监听该 port 且来源不再指向 task worktree

#### Scenario: 没有健康 Buildr Web 实例
- **WHEN** 没有实例记录、记录无法通过健康检查，或当前实例不依赖即将清理的 task worktree
- **THEN** task-finish MUST 不虚构或保留端口
- **AND** MAY 按既有入口迁移与 worktree 清理流程继续

### Requirement: Task Finish 必须隔离其他任务的 Buildr Web preview
task-finish MUST 根据 preview owner task environment 区分当前任务、默认 Buildr Web 与其他任务预览。当前 environment 拥有的健康 preview 必须在 environment 删除前经认证停止并确认不再健康；其他 environment 拥有的 preview MUST 保持运行，且不得被迁移、停止或清理。

#### Scenario: 收尾当前任务拥有的 preview
- **WHEN** 即将清理的 task environment 拥有健康 preview
- **THEN** task-finish MUST 使用该 preview 的受认证停止流程关闭它
- **AND** MUST 在删除任一仍被 preview 使用的 repository worktree 前确认该 preview 不再健康且其状态记录已被安全清理

#### Scenario: 收尾时存在其他任务 preview
- **WHEN** preview list 中存在 owner environment 不等于当前 task environment 的健康 preview
- **THEN** task-finish MUST 保持该 preview 运行
- **AND** MUST NOT 将它迁移到主 checkout、重新分配端口或删除其状态目录
- **AND** 最终报告 MUST 将其标记为未触碰的并发实例

#### Scenario: 当前任务 preview 无法停止
- **WHEN** 当前 task environment 拥有的健康 preview 无法通过认证停止或停止后仍保持健康
- **THEN** task-finish MUST 停止删除该 environment 的 repository worktrees 与本地任务分支
- **AND** MUST 保留 environment/preview identity、失败原因和恢复动作
