## Context

Task source snapshot 先把原任务基线读入临时 Git index，再对“基线路径与当前 `ls-files` 路径的并集”执行一次精确 `git add -A`。未提交归档重命名中的旧路径仍属于 Git index，但工作树中已经不存在；Git 因精确 pathspec 不匹配而终止，`prepare` 在 carrier 创建前失败。

Finish current row 为控制面 authority，只保留五阶段 compact facts 和 owner facts，不保留阶段 command/operation 明细；详细操作属于独立 Execution Record。当前恢复判断把任何 `prepare` attempt 都归为 `uncertainPhase`，因此即使 run 已 terminal failed、没有 carrier/lease/delivery/cleanup，也不能由新 handoff 取代。

## Goals / Non-Goals

**Goals:**

- 用临时 index 精确构造包含当前新增、修改和删除的 Task source tree，且不触碰原 Task index/工作树。
- 只允许“prepare 在 carrier ownership 形成前 terminal failed，且后续阶段从未开始”的旧 run 被新 current handoff 取代。
- 对已有 carrier、lease、delivery、retained activation、prepared completion、cleanup 或无法证明的阶段状态继续 fail closed；preflight-only 保留既有 token 兼容，prepare 则只接受无 token 的 terminal failure。
- 兼容已经产生的 legacy `task-finish.carrier-prepare-failed` run，使本次真实阻塞任务可由新 handoff 恢复。

**Non-Goals:**

- 不让同一 failed run 原地重试，不为 terminal failure 生成 resume token。
- 不放宽 blocked prepare、Delivery Adaptation、target race、retained activation 或 cleanup 的 same-run 恢复语义。
- 不读取 Execution Record 反向决定 Finish owner state，不新增 SQLite 字段或恢复 manifest。
- 不自动删除未知 carrier 目录或其他恢复资源。

## Decisions

### 1. Snapshot 分开处理“当前存在路径”和“应删除路径”

临时 index 仍以原任务基线 `read-tree` 初始化。当前 inventory 分为：

- present paths：当前 tracked/untracked 且工作树未删除的 deliverable paths，用 NUL pathspec 执行精确 `git add -A -f`；
- removed paths：原基线中已不再 tracked，或当前 `git ls-files --deleted` 证明工作树已删除的 deliverable paths，用临时 index 的 `git update-index --force-remove -z --stdin` 表达删除。

这样 rename 仍规范化为 delete + add，与现有 `--no-renames` Task Contribution identity 一致。备选方案是对共同父目录执行 `git add -A`，但会扩大 snapshot path scope；按文件系统 `exists` 过滤则容易误判 symlink、Git index 与特殊文件状态，因此不采用。

### 2. 用 closed owner facts 判断 replaceable，不把 phase attempt 本身当副作用

新增窄 predicate，允许两类 terminal run：

- 既有 preflight failed/blocked，且没有任何 later phase 或 owner fact；它 MAY 带该 preflight blocked 状态生成的 token；
- preflight passed、prepare terminal failed，failure 精确属于 `carrier-preparation`，没有 carrier、lease、resume、delivery、prepared completion、completion，且 verify/deliver/cleanup 都保持 pending/0 attempts。

prepare 中的 target fetch 只是确定性观察并可能更新 Task checkout 的 remote-tracking ref，不是 Delivery Carrier 或外部交付 ownership；它不单独阻止新 handoff。blocked prepare 仍含 same-run resume 语义，不进入 replaceable。

备选方案是允许所有“无 carrier”的 prepare failure，但 carrier 创建失败可能遗留 ownership 无法证明的现场；只按 carrier 是否为空过宽，因此不采用。兼容 legacy run 时接受既有 `carrier-preparation + task-finish.carrier-prepare-failed` 组合；新的具体 snapshot error 会保留稳定 code，仍受同一 owner-fact fence 约束。

### 3. Supersede 只发生在新 handoff 和新 commit message 已就绪后

入口继续先检查 current Development handoff 与新的 delivery commit message。只有新 invocation 的 Execution Record 已成功打开后，才把旧 run 标为 superseded、释放 current slot并创建新 run。旧 invocation 的 Execution Record 保留原 prepare failure；不会改绑旧 run、复用旧 message 或删除未知资源。

## Risks / Trade-offs

- [Git inventory 对 sparse checkout 等特殊状态的解释可能不同] → 以 `ls-files --deleted` 与 baseline/current 集合运算为 Git authority，并增加删除/重命名回归测试；不使用裸文件系统扫描。
- [legacy generic failure code 可能覆盖其他已清理的 carrier preparation failure] → 只有 terminal failed、无 resume、无 owner facts、后续阶段零 attempt 才可取代；任何 cleanup diagnostic 或 owner fact都阻塞。
- [新 predicate 误把运行中或损坏状态当安全] → 只接受 closed phase/status 组合；未知状态和不一致一律进入 `current-run identity conflict`。

## Migration Plan

无需 schema 或数据迁移。部署后，新实现可直接读取既有 current row；符合窄条件的旧 run 在下一次带新 handoff和新 commit message的 Finish invocation 中被 supersede。不符合条件的 run 保持原状。

回滚只需回滚代码；已由新实现成功 supersede 的旧 run 仍由既有 Execution Record 保留诊断，新 run 使用现有 schema。

## Open Questions

无。
