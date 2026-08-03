## Context

Task Finish 的 `deliver` 会在短 target lease 内比较候选冻结时记录的 `expectedTargetRef` 与当前目标分支。比较失败时产品正确返回 `task-finish.target-race`，但 run executor 把它和所有普通暂态阻塞一样处理：下一次持 token 调用跳过所有已通过阶段，只再执行 `deliver`。旧 expected ref 不会改变，因此恢复没有可达的成功路径。

恢复仍必须保留候选冻结、验证 Result、目标 lease 和单一 canonical run store 的 authority；调用方不能选择新 target、提供新 candidate identity 或提交恢复计划。

## Goals / Non-Goals

**Goals:**

- 只让 qualified `task-finish.target-race` 在持有当前产品生成 token 时重新准备候选、验证并交付。
- 使新候选明确绑定恢复时的目标分支，并使旧候选及其验证/交付输出不再被 Finish 复用。
- 保持五阶段模型、CLI surface、run schema 与其他暂态恢复行为兼容。

**Non-Goals:**

- 不提供通用 restart/recover 命令、调用方恢复 manifest、任意 phase reset 或 target 覆盖。
- 不在 `deliver` 内 merge、force push、解决内容冲突或绕过 lease。
- 不删除或改写 Task Verification Application 的 current Result；新候选由现有 applicability 规则使旧 Result stale 后重新验证。

## Decisions

### 1. 仅识别 deliver 的 `task-finish.target-race`

在现有 exact resume-token 校验成功之后，executor 仅在 run 是 `blocked`、resume phase 与 primary failure 都为 `deliver`，且 failure code 是 `task-finish.target-race` 时进入候选恢复。这个谓词来自产品持久化状态，没有新增调用方输入。

不把所有 blocked run 统一重置：cleanup、retained install 和 target lease 等候选仍然有效的情况继续从原最早 blocked phase 恢复，避免不必要的验证和候选变更。

### 2. 保留 preflight，失效 prepare 及其下游

目标 ref 前进不改变已通过的廉价 preflight 门禁，却使 freeze、verification、delivery 和 cleanup 的候选依赖输出失效。恢复将 `prepare`、`verify`、`deliver`、`cleanup` 重置为 pending，清空相应阶段输出、`frozenCandidate`、verification、delivery 与 completion；保留 preflight 的通过证据，并累积阶段 attempts/duration 以保留运行历史。

随后复用已有 `prepare`：它重新 rebase 到当前目标、完成 fixed point 并冻结新候选。已有 `verify` 只会对新 frozen target 复用 current Result；否则由现有 Application 写入新的 Result。这样不需要第二 writer，也不会把旧验证误报为新候选通过。

### 3. 复用现有 schema 与 token

恢复逻辑只解释既有 v1 run 的 phase、primary failure、resume token 与 outputs，不新增 run directory、版本迁移或兼容 reader。旧产品写出的 qualified blocked run 在升级后可由同一个 token 进入该逻辑。

## Risks / Trade-offs

- [目标分支再次前进] → 新 `deliver` 再次返回 `target-race`；下一次仍只能持新的产品 token 重建候选并重新验证。
- [恢复成本上升] → target-race 必须重新验证；这是候选 identity 已变化时避免复用旧 evidence 的必要成本。
- [错误扩大重置范围] → 通过精确 failure code 与 deliver phase 限定，并为非 target-race 保留原有恢复测试。

## Migration Plan

1. 部署当前 executor 后直接读取现有 v1 run。
2. 使用已有 exact resume token 恢复 qualified target-race；无需手工改 run、rebase 或生成新 manifest。
3. 若恢复期间再次发生 ref 漂移，保持 blocked 并由产品生成新的 token；不回退或覆盖目标分支。

## Open Questions

_None._
