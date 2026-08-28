## Context

当前产品已经具备两条正确但分散的底层路径：正式 Task 使用 `buildr.task-finish/v1`，无 active Task 使用 `buildr.git-operations/v1` 完成直接 Git 收尾。问题在入口层：`task-finish` 的 description 只声明已有正式 Task，产品入口 Buildr Skill又单独解释无任务收尾，Agent必须先选对入口才能继续。

本次只调整 Skill 的发现与编排层，不合并两套状态 authority，也不把普通 Git 结果写成 Task Finish evidence。

## Goals / Non-Goals

**Goals:**

- 用户只需表达“收尾”或“交付”，由 `task-finish` 识别当前范围和 Task 事实。
- 对匹配的未结束 Task，持续消费 `task next` 并交接当前专业 owner，直到正式交付和安全善后完成。
- 没有匹配 Task 时，完成普通 Git 收尾和可证明归属的本地清理。
- 把 Skill 收敛为少量顺序步骤、两个互斥分支、一个完成标准和一组硬边界。

**Non-Goals:**

- 不改变 Task Finish Application、五阶段执行器、Delivery Reconciliation 或 SQLite authority。
- 不让 `task-finish` 直接执行 Development、Verification、Review 或 Task Environment 的专业写入。
- 不扩展 Git Operations 的单操作契约，不新增 force push、stash、reset 或共享历史改写授权。
- 不把无 Task Git 收尾登记为 Formal Task、Candidate、Verification、Finish 或 Environment cleanup。

## Decisions

### 统一 Skill 入口，保持专业能力分离

`task-finish` 的 model-invoked description 同时覆盖“收尾”和“交付”。加载后第一步只读识别当前工作范围内的未结束 Task：

- 唯一匹配 Task：进入 Task 分支；
- 没有匹配 Task：进入直接 Git 分支；
- 多个匹配 Task、范围或目标不明确：只请求会改变交付对象的最少决定。

不把 `buildr.task-finish/v1` 扩展成通用 Git capability。该 contract 仍只保证 current Development handoff 之后的正式交付；Skill 的无任务分支按需把 optional `buildr.git-operations/v1` 提升为当前分支的 required dependency。

替代方案是继续由产品入口 Buildr Skill 分流两个 Skill。该方案保留了重复路由，并要求用户或 Agent在加载 `task-finish` 前知道 Task 状态，因此不采用。

### Task 分支使用 `task next` 渐进推进

Task 分支不复制完整生命周期手册。它反复读取 `task next`，只加载并调用当前 required/recommended action 对应的 owner；owner成功后重读 current facts。到达 current Development handoff 后，才由 `buildr.task-finish/v1` 完成自动 Finish 或外部交付对账。

这让“推进到结束”成为可检查循环，同时保留 Development、Review、Verification、Environment 和 Finish 的单一 authority。真实业务决定、破坏性授权或 owner blocked 会暂停循环。

### 直接 Git 分支使用独立 Operation Result

无匹配 Task 时，Skill 选择仓库、owned scope、目标 ref、remote 和操作顺序，并逐次调用 Git Operations。默认完成观察、必要的精确 commit、目标同步或集成、普通 push、远端回读，以及只针对可证明归属资源的本地清理。

“收尾/交付”提供这条常规链路的一次连续授权；任何 force push、丢弃内容、共享历史改写、无法证明归属的删除或语义冲突仍需单独决定。

### 文案以中文行为词为主

正文只在首次对齐稳定产品概念时使用中文加英文，命令、contract id、schema 和字段名保持原样。删除哲学复述、历史事故恢复细节和可从 CLI current facts 获得的字段说明；产品安全原语的细节留在 contract、CLI help 和 typed blocker 中。

## Risks / Trade-offs

- **入口扩大可能误吸收普通单次 Git 操作** → description 只覆盖完整“收尾/交付”意图；用户明确只要 commit、push 或 fetch 时仍由 `git-operations` 处理。
- **Task 分支可能形成无限编排循环** → 每次只消费 current `task next`；状态无变化、owner blocked、需要新授权或需要用户语义决定时立即停止。
- **无关 active Task 可能劫持当前仓库收尾** → 只接受与当前 repository set、scope 和用户目标匹配的未结束 Task，历史或无关 Task按不存在处理。
- **清理语义可能扩大删除范围** → 只清理产品 owner 或本次 Git 收尾能够重新证明归属且安全删除的资源；否则保留并报告。
- **正式 contract 与入口 Skill 职责看似不一致** → contract继续定义正式 Task 分支的稳定保证，Skill正文明确无任务分支不产生该 contract 的 Result。
