# task-environments Specification

## Purpose
定义 Buildr 如何以 canonical task environment 隔离单仓与多仓任务的源码、运行上下文、验证身份和安全清理边界。
## Requirements
### Requirement: Buildr 必须将 task worktree 建模为可核验的任务环境
Buildr MUST 为每个 task id 维护唯一 canonical task environment；该环境 MUST 以 `<workspace>/.worktrees/<task-id>` 为根，包含 Workspace 根 repository worktree，并可包含任务显式选择的独立 Project/Service repository worktrees。

#### Scenario: 创建默认单仓任务环境
- **WHEN** Agent 创建 task environment 且没有选择独立 Project/Service repository
- **THEN** Buildr MUST 在 canonical environment root 创建 Workspace 根 repository worktree
- **AND** MUST 返回只包含该 root repository 的 environment identity

#### Scenario: 创建多仓任务环境
- **WHEN** Agent 显式选择一个或多个 Git Project/Service repository
- **THEN** Buildr MUST 将每个 repository worktree 创建在 environment root 下对应的 canonical `source.path`
- **AND** MUST 保持每个 repository 的独立 Git boundary、branch、HEAD 和 remote identity
- **AND** MUST NOT 将多个 repositories 合并为一个 Git repository、submodule 或共享 index

#### Scenario: Codex 使用多仓任务环境
- **WHEN** Codex chat 以 task environment root 作为本地 project/worktree 目录
- **THEN** Agent MUST 能在同一目录树中访问 Workspace root 和全部选中 repository checkouts
- **AND** Buildr MUST NOT 声称 Codex 的单 repository Git UI 原生聚合了全部 nested repositories

### Requirement: 多仓 repository set 必须显式、稳定且可验证
Buildr MUST 只物化 Agent 显式选择的 repository entities，并 MUST 从 canonical Project/Service registries 与实际 Git boundary 共同解析 repository plan；不得自动包含 Workspace 中全部 repositories 或根据 remote URL 猜测任务范围。

#### Scenario: 从 Service selector 解析 repository
- **WHEN** Agent 选择 `service:<project>/<service>`
- **THEN** Buildr MUST 从 canonical Service Domain 解析 `source.path`、declared remote 和 `integrationBranch`
- **AND** MUST 使用实际 repository root 与 remote URL 核对该声明后才能创建 worktree

#### Scenario: 两个 Service 使用相同 remote URL
- **WHEN** 两个显式选择的 Service source paths 指向相同 remote URL 但具有独立本地 repositories 或 integration branches
- **THEN** Buildr MUST 按 source path 和实际 repository boundary 分别处理
- **AND** MUST NOT 仅因 remote URL 相同而合并、去重或复用错误 checkout

#### Scenario: selector 不是有效 Git entity
- **WHEN** selector 不存在、source 不是独立 Git repository、path 越界或实际 remote 与声明冲突
- **THEN** Buildr MUST 在创建任何新 worktree 前 fail closed
- **AND** MUST 返回失败 selector、声明/实际 identity 和可执行 next actions

### Requirement: Repository worktrees 必须保持 canonical Workspace 布局
独立 Project/Service repository worktree MUST 位于 task environment 内与其 canonical `source.path` 相同的相对路径；Buildr MUST 在写入前证明目标路径没有被父 repository 跟踪、没有被其他 task/repository 占用且不会逃逸 environment root。

#### Scenario: nested Service 目标未被父仓跟踪
- **WHEN** root task checkout 的 canonical Service path 未被父 repository index 跟踪且未被占用
- **THEN** Buildr MUST 允许在该路径创建独立 Service repository worktree
- **AND** 原 Workspace 的 Service checkout MUST 保持不变

#### Scenario: nested target 与 tracked path 冲突
- **WHEN** 目标 path 已由 root 或 Project repository 跟踪、已注册给其他 worktree 或包含未知文件
- **THEN** Buildr MUST 在该 target 零写入失败
- **AND** MUST NOT 以扁平 fallback、symlink、覆盖或删除目标内容规避冲突

### Requirement: Task environment 创建必须完整预检并可恢复
Buildr MUST 在任何 `git worktree add` 前解析并验证完整 repository plan。跨 repository 创建无法原子完成时，Buildr MUST 保留成功步骤、记录 blocked environment receipt 并支持相同 plan 幂等恢复；不得自动删除已创建 checkout 或用户分支。

#### Scenario: 全部 repository 预检通过
- **WHEN** repository paths、remotes、start points、task branches 和 branch ownership 全部有效
- **THEN** Buildr MUST 按 root 后 nested repositories 的确定顺序创建 worktrees
- **AND** 成功结果 MUST 返回 `ready: true` 和每个 repository 的 identity

#### Scenario: 中途创建失败
- **WHEN** 一个 nested repository 在 root 或其他 repository 已创建后失败
- **THEN** Buildr MUST 将 environment 标记为 `blocked`
- **AND** MUST 保留并报告每个 repository 的 created/reused/blocked 状态和 next actions
- **AND** 相同 plan 重试 MUST 幂等复用已正确创建的 checkouts

#### Scenario: 相同 task id 使用不同 repository plan
- **WHEN** 已有 task environment receipt 的 repository set、branch 或 start point 与新请求不一致
- **THEN** Buildr MUST 拒绝静默复用或改写 environment
- **AND** MUST 要求显式恢复、扩展或使用新的 task id

### Requirement: Task environment 必须提供统一 execution context identity
Buildr MUST 提供机器可读的 create/inspect/context 结果，至少记录 task、owner Agent、source Workspace、environment root、repository set、每个 source/checkout repository identity、允许执行根、CLI source、lifecycle state 和隔离级别。

#### Scenario: 从 environment 内检查 context
- **WHEN** Agent 从 environment root 或任一成员 repository path 请求 context
- **THEN** Buildr MUST 返回同一 task environment identity
- **AND** MUST 标识当前路径所属 repository、其 checkout root、branch、HEAD 和 dirty 状态

#### Scenario: 从主工作区冒充任务 context
- **WHEN** 请求路径位于原 Workspace checkout、其他 task environment 或未登记路径
- **THEN** Buildr MUST 返回 context mismatch 并 fail closed
- **AND** MUST NOT 将分支名、remote URL 或相同 HEAD 当作 environment ownership 证明

#### Scenario: 报告隔离级别
- **WHEN** Buildr 返回 task environment context
- **THEN** result MUST 说明 working tree/index 与 Buildr-owned runtime state 的隔离状态
- **AND** MUST 明确 Git objects/refs/worktree metadata 为 repository shared state
- **AND** 外部依赖 MUST 标记为 Project-owned environment；只有多个任务可能修改同一共享状态时，才 MUST 要求项目已有租户、账号、数据前缀、串行化或显式授权边界

### Requirement: Task environment CLI JSON 必须表达多仓事实
`buildr worktree create --json` MUST 返回 task-environment-aware public schema，包含 environment 与 repositories 集合；schema MUST 保留单仓调用的等价顶层生命周期字段，并 MUST 以新 schema identity 暴露不兼容变化。

#### Scenario: 单仓 v2 JSON
- **WHEN** 调用方创建默认单仓环境并请求 JSON
- **THEN** result MUST 使用 `buildr.worktree-create/v2`
- **AND** `repositories` MUST 包含一个 Workspace root entry
- **AND** `state`、`treeChanged`、`ready`、`bootstrap`、`blocked` 与 `nextActions` MUST 保持明确

#### Scenario: 多仓 v2 JSON
- **WHEN** 调用方创建或复用多仓环境并请求 JSON
- **THEN** result MUST 为每个 repository 返回 entity selector、source path、source repository、checkout path、branch、start point、HEAD、clean 和 lifecycle state
- **AND** top-level readiness MUST 在任一 required repository blocked 时为 false

### Requirement: Task environment 清理必须保护全部成员和其他任务
Buildr MUST 只在当前 environment 的全部 repository changes 已安全集成或获得明确放弃授权、checkouts 可清理且任务拥有的本机资源已停止后清理。清理 MUST 按 nested repositories 后 root 的顺序执行，并 MUST NOT 修改其他 task environments。

#### Scenario: 多仓环境安全清理
- **WHEN** 全部成员 repositories 已集成、干净且没有阻塞本机资源
- **THEN** Buildr MUST 先移除 nested repository worktrees，再移除 root worktree 和本地 receipt
- **AND** MUST 返回每个 repository 与 environment 的 removed evidence

#### Scenario: 一个成员 repository 仍未完成
- **WHEN** 任一 repository dirty、未集成、branch identity 不明或仍被 task-owned process 使用
- **THEN** Buildr MUST 保留整个 task environment
- **AND** MUST 报告阻塞 repository/resource，且不得部分删除其他仍用于恢复的成员

#### Scenario: 存在其他并发 task environment
- **WHEN** 同一 Workspace 或任一 source repository 还拥有其他 task worktrees
- **THEN** Buildr MUST 保持其 checkouts、branches、receipts、preview、ports 和状态目录不变

### Requirement: Task environment 必须核验 execution binding
Buildr MUST 以 environment receipt、repository membership/identity、allowed execution roots、environment-bound CLI/runtime projection identity 和明确 target/workdir 判断 `executionReady`。自举 Workspace MUST 使用 environment 内对应的产品 CLI；没有产品源码成员的普通 Workspace MAY 使用 receipt 显式声明的 external-product CLI。Agent session root MUST NOT 是普通 proposal、implementation、verification 或 finish 的必要条件，也 MUST NOT 被要求等于 environment root。

#### Scenario: canonical workspace 对话操作 task environment
- **WHEN** Agent session 从 canonical Workspace 启动，并在 create 后使用 task environment 的明确 target、成员 checkout workdir 和 environment-local CLI
- **THEN** context MUST 在 environment、repository、CLI 与 runtime identity 匹配时返回 `executionReady: true`
- **AND** canonical Workspace 中已加载的能力 MUST NOT 因 session root 不同而失效

#### Scenario: 普通 Workspace 使用外部产品 CLI
- **WHEN** Buildr 产品源码不属于目标 Workspace repository set，receipt 已声明 external-product CLI identity，且命令使用 environment target/workdir
- **THEN** context MAY 返回 `executionReady: true`
- **AND** result MUST 将 CLI source kind 与 `checkoutLocal: false` 明确披露，不得伪装为 environment-local CLI

#### Scenario: 请求路径或 CLI 越界
- **WHEN** target/workdir 不属于 allowed execution roots，或当前 CLI/runtime projection identity 不匹配 receipt 声明的 environment-bound source
- **THEN** context MUST 返回 blocked 并 fail closed
- **AND** MUST 报告不匹配的 target、workdir、membership、CLI source kind 或 identity

#### Scenario: runtime identity 漂移
- **WHEN** environment identity、repository plan 或 runtime projection identity 不再匹配 receipt
- **THEN** context MUST 返回 `stale` 或 `blocked`
- **AND** MUST 要求重新收敛 environment/runtime，而不是创建另一份纯 checkout

### Requirement: Runtime activation evidence 必须是按影响触发的特例
Buildr MUST 只在任务修改 Agent runtime 的 discovery、loading、activation mode、投射路径或相关 metadata，且验收明确要求证明新机制已由 Agent 激活时检查 adapter-specific activation。普通 Rule/Skill 内容修改 MUST 使用源资产、render/sync、runtime projection 与 doctor evidence，不得因此要求新 session。该 evidence MUST 与普通 execution readiness 分离。

#### Scenario: 普通 Rule 或 Skill 内容修改
- **WHEN** 任务只修改 Rule/Skill 内容、capability contract 或 routing description，没有改变 runtime discovery/loading/activation 机制
- **THEN** Buildr MUST NOT 要求新 session、reload、re-enter 或 adoption receipt 作为完成条件
- **AND** create/reuse 结果 MUST NOT 返回 session handoff next action

#### Scenario: Agent 提交 activation evidence
- **WHEN** runtime 机制变更的专项验收提交 reload 或新 session activation evidence
- **THEN** result MUST 将 environment evidence 标为 `buildr-verified`，将 host evidence 标为 `agent-attested`
- **AND** receipt 与再次核验 MUST 同时绑定规范化 session root 和 session handle
- **AND** MUST 明确 Buildr 没有直接内省或自动启动 Agent host

#### Scenario: activation session identity 改变
- **WHEN** 当前 session root 或 handle 与 adoption receipt 不匹配
- **THEN** Buildr MUST 返回 activation evidence mismatch
- **AND** 普通 `executionReady` MAY 保持有效，但专项 activation proof MUST NOT 返回 verified

#### Scenario: Codex 无法绑定既有 environment
- **WHEN** runtime 机制专项验收要求 Codex session-start evidence，但当前 App 不能把新 session 绑定到既有 Buildr worktree
- **THEN** Buildr MUST 报告 activation evidence 缺口
- **AND** MUST NOT 创建指向该 worktree 的另一份纯 checkout或把 adoption receipt 包装成自动 handoff

### Requirement: Task environment 清理必须移除本地 adoption state
Buildr MUST 将 adoption receipt 作为 task environment-owned local state 管理，并 MUST 只在 environment 满足既有安全清理前置条件时一并清理；它不得改变 retained checkout 的主 runtime sync 边界。

#### Scenario: 安全集成后清理 environment
- **WHEN** task environment 已安全集成、成员 checkout 可删除且 task-owned resources 已停止
- **THEN** Buildr MUST 随 environment 清理对应 adoption receipt
- **AND** 主 Workspace runtime MUST 仍从 retained checkout sync 并重新 doctor
- **AND** Buildr MUST NOT 从未合并 task checkout 更新原 Workspace runtime
