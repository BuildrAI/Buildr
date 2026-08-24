## Context

上一轮架构已经把 Task Finish 重构为统一 current facts、确定性安全不变量、少量安全原语、Agent 策略与真实远端结果对账。当前仍有一个封闭缺口：旧 run 因原 Task Contribution 漂移而在 prepare 阶段失败，current Handoff 已形成新 Candidate，但新贡献尚未交付远端。普通 `run` 正确拒绝静默换绑，`reconcile` 又必须等待真实 remote containment，因此旧 current row 与 carrier 会持续阻塞新的自动 Finish。

现有旧 run 退休资格能够证明 identity、phase、lease、delivery、retained、completion、cleanup 与 topology，但只能在 reconciliation 已证明 current Handoff 远端包含后调用。它还不能证明旧 carrier 中只有 Product prepare 失败现场、没有 Agent 后续适配内容。直接放宽 remote containment 会产生误删 Agent 工作的风险。

## Goals / Non-Goals

**Goals:**

- 在不要求 current Handoff 已交付远端的情况下，安全退休仅包含 Product 生成失败现场的旧 run/carrier。
- 保持普通 `task finish run` 的 identity conflict 行为，换代必须由 Agent 显式选择并提交 Product 生成的 current facts token。
- 让 `run`、`reconcile`、显式换代和 Task Entry Snapshot 复用同一恢复资格与 blocker 语义。
- 通过精确 carrier 内容证明、current-row digest fence 与幂等顺序避免丢失 Agent 工作、错误 owner 清理和并发覆盖。

**Non-Goals:**

- 不清理历史 run、缺少内容证明的 carrier 或 Agent 修改过的 carrier。
- 不让 `task next` 自动执行换代、远端探测、Git/PR 或 reconciliation。
- 不放宽 reconciliation 的真实 remote containment 要求。
- 不跨 generation 复用旧 Candidate、Verification、Handoff 或 Delivery Adaptation 结论。
- 不提供通用 `reset run`、任意路径删除、SQLite patch 或事故迁移接口。

## Decisions

### 1. prepare 首次返回 carrier 时持久化封闭的可丢弃性证明

只有 Product 完成 carrier 创建并首次以 prepare blocked/failed 将现场交给 Agent 时，才为每个 carrier保存 `carrierDisposability` 事实。它绑定 Task/run identity、repository selector、规范化 topology、carrier ownership、HEAD、index、worktree 与 untracked 内容 identity，以及形成证明的 prepare output/failure identity。证明描述“这是Product首次交接的精确现场”，不声明业务等价或 Delivery；后续恢复不得刷新或覆盖该证明。

显式换代前重新计算同一组事实；路径缺失只在已登记 carrier 的精确资源已经不存在、container 与 owner 仍可证明时视为幂等清理。任一文件、index、HEAD、untracked、symlink、owner、container 或 topology 漂移都会使证明失效并保留现场。

备选方案是仅检查 `git status` 是否干净。prepare 冲突现场本来可能是 dirty，且 clean 不能证明没有独有 commit 或 untracked 内容，因此不采用。

### 2. 统一资格返回事实、blockers 与能力，不返回策略结论

共享恢复判定器在现有 identity/phase/side-effect/topology 资格上增加 carrier 可丢弃性证明，并根据调用目的计算两种独立资格：

- `remote-reconciliation-retirement`：保持 current Handoff 真实 remote containment 要求，用于 `reconcile`。
- `local-stale-run-rollover`：不要求 current Handoff 已远端包含，但只接受已知的 `task-finish.task-contribution-drift-unresolved` prepare blocker；`blocked` run 必须仍持有该blocker生成的原run resume token，`failed` run 必须没有resume；两者都不得有任何 Delivery/Activation 等副作用，且全部 carrier 内容仍与首次交接证明完全一致。其他blocked/failed原因或resume状态一律不具备该资格。

Finish current facts 投影对应 blocker、required prerequisites、资格 identity 和可用能力。它可以表达 `stale-run-retirable`，但不把该分类升级为唯一策略；Agent 仍可选择直接 Git/PR 后 reconcile 或检查/放弃现场。

备选方案是让 `run`、`reconcile` 与 `task next` 各自保留判断。它会继续造成同一现场在入口间给出不同结论，因此不采用。

### 3. 新增显式、token-fenced 的原子 current-run 换代

新增 Product-owned `task finish rollover` 动作。调用方只提交 Task、current facts 返回的一次性 recovery token、current Handoff 所需的语义 commit message 与 canonical target；不得提交 carrier path、状态 patch、claimed clean、remote success 或等价 boolean。

Application 按以下顺序执行：

1. 重新读取 Task、Environment、current Development Handoff 与 Finish current row，校验 recovery token 对应的 facts/qualification identity。
2. 重新观察全部 carrier disposability、ownership、topology、已知prepare drift blocker/resume、lease 与 side-effect facts。
3. 精确清理已证明可丢弃的 carrier；相同资源已不存在时保持幂等，部分失败保留 old current row并返回逐项 effects。
4. 在单一 SQLite transaction 中以旧 run ID、kind、status 与精确 current digest 为 fence，写入绑定 current Handoff 的新 active run，并在新 run 保存有界 `supersededCurrent` 关联。
5. 返回新 run ID 与后续同一 run 的正常 `run`/resume 输入；本动作自身不执行远端交付。

文件系统清理和 SQLite 不可能形成同一原子事务，因此先清理、后换 row。若进程在二者之间中断，旧 row仍是current；重试根据原run ownership接受精确carrier已不存在并继续CAS，不会清理其他资源或创建第二个新run。若SQLite fence失败，保持竞争者写入，报告已发生的精确cleanup effects并不覆盖current。

备选方案是让普通 `run` 自动调用换代。它会在 Agent 可能想保留/检查 carrier 或改走 PR 时产生隐式删除，因此不采用。

### 4. 历史数据关闭式兼容

`carrierDisposability` 作为 run JSON 的新增可选事实，不批量迁移、不回填。历史 run、旧 schema 或旧 prepare failure没有该事实时，`local-stale-run-rollover` 必须返回 unavailable；既有 resume、reconcile、人工检查和放弃路径保持可用。

`reconcile` 继续使用真实 remote containment；它可以复用新的共享判断，但不得把 carrier disposability 变成远端 Delivery 证明，也不得因本 Change 自动接受历史 carrier。

### 5. Task Entry Snapshot 保持只读并增强可行动性

Task Entry Snapshot 不访问远端、不清理 carrier、不写 Finish。它在 Development next 为 Finish 时投影 Finish current facts 的 `recoveryDisposition`、blockers、qualification identity、available capabilities 及可执行命令描述。`stale-run-retirable` 时暴露 `finish-rollover`；证据不足时暴露 `inspect-finish-conflict`，并继续保留 Git/PR、reconciliation、task-development 与 abandon 等合法能力。

兼容 `next.action` 仍可保持 `finish`；消费者不需要先执行一次失败的普通 `run` 才能发现旧 run 冲突。

## Risks / Trade-offs

- [Risk] Product 记录的 carrier identity 不完整，导致 Agent 内容被误删 → identity 必须覆盖 HEAD、index、worktree、untracked、path/owner/container 与 topology，任一未知或漂移都阻断。
- [Risk] cleanup 后、SQLite 换代前崩溃 → 旧 row 保留；精确资源不存在作为同一 old run 的幂等 cleanup 结果，重试仍受原 digest fence 保护。
- [Risk] 并发 writer 在 cleanup 后替换 current row → transaction fence 零覆盖返回；已发生 effects 精确报告，不自动清理新 owner资源。
- [Risk] 多 repository 部分 cleanup → 保存 old current，返回每个 selector 的结果；重试只处理仍属于旧 run的剩余资源。
- [Risk] 新分类演化成全局状态机 → classification 只描述 Product-owned事实与资格，不排序或执行策略。
- [Trade-off] 历史事故仍可能人工处理 → 缺少可丢弃性证明时优先保留现场，避免用兼容逻辑牺牲数据安全。

## Migration Plan

1. 增加 carrier disposability identity 与共享资格的 Unit/Integration 测试，不改变现有入口。
2. 在 prepare 首次返回carrier时写入不可刷新的证明，并验证已知Task Contribution漂移、其他resume及修改/未修改carrier的反例。
3. 增加 fenced SQLite replacement 与显式 `task finish rollover` Application/CLI。
4. 将 current facts 和 Task Entry Snapshot 接入新资格与能力投影，保留普通 `run`、resume 和 reconciliation 语义。
5. 用单仓库、多仓库、部分清理、进程中断、current-row竞争和完整 Task journey 验证。
6. 回滚时移除新 CLI/capability消费；新增可选run字段保持惰性，不迁移或删除用户现场。

## Open Questions

无。显式换代不执行远端交付，避免把一次安全本地转换与后续可恢复的 Finish 五阶段副作用耦合。
