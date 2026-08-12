## Context

Task Record Application 当前只负责 canonical Workspace 中的最小 Task 事实；`task-triage` 在进入正式持久交付时先调用 Task Record `create`，随后才准备 Environment。Git worktree provider 默认从本地 `HEAD` 建立 checkout，Task Environment 又明确不自动 fetch/rebase，因此 Agent 可能在本地 `dev` 尚未与 `origin/dev` 收敛时创建新任务。

本 Change 只改变 Agent 通过 `task-triage` 创建正式 Task 的编排。Task Record CLI/Application、Local App 人类客户端和 Task Environment 的专业 authority 保持不变。

## Goals / Non-Goals

**Goals:**

- 在正式 Task Record `create` 前让完整 repository set 收敛到最新 `origin/dev` 基线。
- 复用 selected `buildr.git-operations/v1` provider 执行已选定的 fetch/rebase，不在 `task-triage` 复制 Git 操作手册。
- 任一仓库前置事实不成立或操作失败时不创建 Task，并完整报告已经发生的 effects。
- 保持 Task Record、Task Environment 与 Git Operations 的现有 authority 分离。

**Non-Goals:**

- 不让 `buildr task create` CLI、Task Record Application 或 Local App mutation 自动执行 Git。
- 不支持自动选择 `dev` 之外的分支、其他 remote/upstream、merge、stash/autostash、force push 或共享历史改写。
- 不承诺多仓库 Git mutation 的原子回滚，也不创建新的 Git receipt、scheduler、lock 或 transaction framework。
- 不改变已有 Task 的 inspect/resume，也不在 Task Environment 内新增 fetch/rebase。

## Decisions

### 1. 前置门禁属于 `task-triage` consumer 编排

`task-triage` 已拥有 repository set、正式持久交付判断与 Task Record `create` 顺序，因此由它在 create 前选择 Git Operations。Task Record provider 仍只接收 Task 字段；Git Operations provider 仍只执行 consumer 已选定的 repository、operation 与 refs。

替代方案是把 Git 写操作放进 Task Record Application。该方案会破坏数据库事务的单一职责，使 CLI/Local App 创建隐含网络与历史副作用，因此不采用。

### 2. `dev` / `origin/dev` 是自动路径的显式前提

对完整 repository set 先执行零写入 preflight，逐仓库核验：实际 Git root、当前符号分支 `dev`、upstream `origin/dev`、remote identity 可读、index/working tree clean、没有 rebase/merge 等进行中状态。任一事实不成立即阻塞，不猜测其他 branch、remote 或策略。

这保留了用户确认的统一开发分支模型，也避免引入第二套 branch policy 配置。需要其他分支的 Workspace 必须先形成另一项明确政策，不由本 Change 泛化。

### 3. 先 fetch 全部仓库，再按稳定顺序 rebase

通过 Git Operations 对每个 repository 显式执行 `fetch origin dev`；全部 fetch 成功并重新核验 `origin/dev` 后，再按 repository selector 的确定性顺序执行 `rebase origin/dev`。这样能在 tree mutation 前尽早发现网络、remote/ref 和前置事实问题。

`rebase origin/dev` 统一覆盖三种成功状态：already aligned、仅落后时前进、本地未 push commit 与远端同时前进时重放。Result 必须报告 before/after branch/HEAD、tree/history 是否变化及实际 effects。

### 4. 冲突恢复是 rebase operation 的显式有界动作

preflight 已证明仓库 clean 时，rebase 冲突后允许执行 `git rebase --abort`。只有 branch、HEAD、clean 状态都恢复到 pre-rebase identity 才记为 recovered；Task 创建仍保持 blocked。abort 失败或无法证明恢复时保留现场，报告 in-progress/conflict facts 和唯一 next action。

该恢复必须在 Result 中可见，不构成静默 reset/rollback。已经在其他仓库成功的 fetch/rebase 不自动反向回滚，作为部分 effects 如实报告。

### 5. tree transition 后先完成 Workspace 检查

任一成功 rebase 改变已检出 Buildr Workspace tree 时，`task-triage` 在 Task create 前执行当前 Agent Doctor，并按 Core 的 workspace transition 边界处理 actionable drift。Doctor 或必要 runtime 收敛未 ready 时继续阻塞创建，避免新 Environment 从不一致 Agent runtime 启动。

### 6. 使用条件 capability dependency

`task-triage` 增加 optional `buildr.git-operations@1` dependency；只有正式 Task `create` 分支把它提升为 required。纯讨论、只读探索、已有 Task inspect、独立 current knowledge maintenance 和其他无 Git 创建动作保持可用。provider unavailable 时仅阻塞新的正式 Task 创建。

## Risks / Trade-offs

- [自动路径只支持统一 `dev`] → 不满足 `dev` / `origin/dev` 的 repository set 明确阻塞，避免隐式泛化；后续需求另建 Change。
- [多仓库可能部分成功] → fetch 全部优先、rebase 确定性排序，并在失败 Result 中列出每个 repository 的 effects/current facts；不伪造原子性。
- [rebase 改写未 push 本地 commit identity] → 只允许 clean、未共享的本地历史；共享风险无法证明时阻塞，不 force push。
- [remote 在 fetch 后再次前进] → 本门禁保证基于本次 observed `origin/dev` 收敛；后续 Development/Finish 继续承担各自 target race 检查，不把一次 fetch 宣称为永久最新。
- [Local App/直接 CLI 仍可只创建记录] → 明确这是 Agent `task-triage` 工作流保证；Task Record 产品 surface 保持确定性和无网络副作用。
