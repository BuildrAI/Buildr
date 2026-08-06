## Context

Task Finish 当前已经拥有稳定的专业边界：消费 current Development handoff，在隔离 Delivery Carrier 上依次执行 `preflight → prepare → verify → deliver → cleanup`，处理 target-race/Delivery Adaptation，完成远端回读、retained activation、Doctor、Environment cleanup，并形成终态交付证明。问题不在这套职责，而在它仍以 `.buildr/task-finish/runs`、`completed` 和文件 lease 保存 current 状态。

Workspace SQLite 已是 Task Record、Development、Review、Verification 与 terminal delivery read model 的单机结构化 authority。继续保留 Finish File Store 会形成第二套 current-state 协议：CLI/Local App 需要配对 run/completion 文件，失败诊断与终态摘要一起长期累积，进程恢复、并发 lease、最终清理也分散在文件和数据库之间。

本 Change 直接切换 authority，不保留长期双写或兼容读取。`Task Finish` 名称、Skill、capability、CLI 和五阶段不变；`task complete` 仍只负责 Task Record 终态，不接管交付执行。

当前 active Change `local-app-read-store-boundary` 同样修改 `workspace-structured-data-store`，但只收窄已解析 root 的只读 provenance 边界。本 Change 新增 Finish schema/transaction 要求，不改写其 Requirement；实现和归档前必须基于最新 canonical specs 重新校验两者可组合。

## Goals / Non-Goals

**Goals:**

- 让 Workspace SQLite 成为 Task Finish run、checkpoint、resume、target lease、completion 和 compact Result 的唯一持久化 authority。
- 保持 Finish 的五阶段、精确恢复、Delivery Adaptation、远端回读和 Environment cleanup 行为不变。
- 将 stdout/stderr、完整诊断与 Delivery Carrier 限定为 run-owned transient data，并在成功后确定性删除。
- 只长期保留足以证明 delivered 的有界终态摘要；blocked/failed run 只保留恢复所需 current 状态。
- 一次性处理既有 `.buildr/task-finish` 数据后退出旧协议，不让新 runtime 长期读取或写入旧目录。
- 让 CLI、Doctor、Terminal Delivery Application 与 Local App 通过 Application/repository 边界消费同一份 SQLite 事实。

**Non-Goals:**

- 不重命名或移除 `task-finish` Skill、capability、CLI 与用户“收尾”入口。
- 不把 commit、merge、push、remote readback、retained activation、Doctor 或 cleanup 并入 `task complete`。
- 不建设通用事件库、历史审计平台、scheduler、跨机器同步、Server/Cloud 或第二数据库。
- 不把原始命令输出、Carrier 文件树、Git object 或无限历史塞进 SQLite。
- 不改变 Development、Verification、Review、Git provider、Task Environment 或 Task Record 各自的语义 authority。

## Decisions

### 1. 保留 Task Finish 专业边界，只替换状态 repository

`buildr.task-finish/v1`、`buildr task finish run|inspect` 与五阶段执行器继续存在。Skill 只负责识别“收尾/交付”意图、披露授权并调用产品执行器；它不读取 SQLite、不管理 lease，也不自行删除 Finish 文件。

`task complete` 只执行 Task Record 的 terminal transition。无变更任务可以由 Task Record Application 直接以 `noChange` 完成；需要交付的任务必须先由 Task Finish 完成交付与清理，再由其调用 Task Record Application 写入终态。名称因此表达两种不同动作，而不是旧、新两套收尾流程。

### 2. SQLite 使用窄表保存 current run、completion、lease 与 transient metadata

通过连续 migration 增加以下专业表，具体列名可在实现中按现有 repository 约定收敛，但语义和唯一性必须固定：

- `task_finish_runs`：以 `run_id` 为主键、以 `task_id` 绑定 Task，保存可验证的完整 closed run payload、状态、当前阶段、resume identity、generation 与更新时间；每个 Task 至多一个未终结 current run。
- `task_finish_completions`：每个 Task 至多一行 compact terminal Result，绑定完成该交付的 `run_id`、handoff/Candidate/target/carrier/remote/Doctor/cleanup identities 与完成时间。
- `task_finish_target_leases`：以规范化 target identity 为唯一键，保存 owner run、不可伪造 token、过期时间与 heartbeat；只服务于 Finish 的并发交付互斥，不扩展为通用 scheduler。
- `task_finish_transient_artifacts`：保存 run-owned 临时产物的 kind、受限相对路径、大小、SHA-256、retention 状态和 cleanup 结果，不保存产物正文。

表只规范化查询、唯一性和完整性所需字段，其余内容保存经 Domain schema 验证的 closed JSON payload。所有表通过 foreign key 绑定 canonical Task；不得建立通用 key/value、event、audit 或 revision 模型。

### 3. 每个阶段 checkpoint 与 lease 变化均原子提交

执行器在产生外部副作用前读取并验证 current run、handoff、target lease 与 resume token；阶段观察完成后，以单一 `BEGIN IMMEDIATE` transaction 更新完整 run payload、当前 failure、diagnostic metadata、lease heartbeat 和 next action。进程在外部副作用后、checkpoint 前崩溃时，恢复必须通过 Git、remote、Environment 或 retained runtime 的可观察 identity 重判该动作，不得仅因缺少 checkpoint 重放非幂等动作。

target lease 的 acquire、renew、release 使用 SQLite 唯一约束和 owner token。busy、token 不匹配或其他未过期 owner 必须 fail closed；过期回收需要重新观察 target 与 run identity，不能只看时钟。

### 4. 原始诊断与 Carrier 只进入 run-owned transient root

完整 stdout/stderr、命令诊断和 Carrier 保留在 `.buildr/transient/task-finish/<run-id>/` 或 Task Environment 登记的其他 run-owned transient root。SQLite 只保存相对 canonical Workspace 的受限 locator、digest、大小和清理状态；拒绝绝对逃逸、symlink 逃逸和未登记路径。

blocked/failed 且可恢复的 run 保留当前恢复所需 transient data。成功路径在 delivery、remote readback、retained activation、Doctor 和 Environment cleanup 全部成立后删除该 run 的 diagnostics、Carrier 与 lease；删除失败时 run 保持 `cleanup_pending`，下一次 resume 只重试未完成清理，不重跑 prepare、verify 或 deliver。

### 5. completion 与 Task Record 终态在最终清理后提交

进入 cleanup 前，Finish 先在 SQLite current run 中持久化 delivery identities 与 `cleanup_pending`，再调用 Task Environment 的唯一 cleanup authority。Environment 返回 cleaned 后，Finish 删除其自身 transient artifacts 并释放 lease；全部清理成功后，在同一 Workspace Structured Store mutation 中写入 compact completion、清除 current run/lease/transient rows，并通过 Task Record Application 将 Task 标记 completed。

如果进程在 Environment 已 cleaned、Finish 尚未完成时崩溃，resume 从 Environment Receipt 与 SQLite `cleanup_pending` 恢复，只完成 Finish-owned transient cleanup、completion 和 Task terminal transition。任何一步失败都保留足够 current state，不能产生 delivered completion 与 active Task、或 completed Task 与缺失 Finish proof 的新不一致。

### 6. 一次性 cutover 只导入可验证终态，非终态重新建 run

已集成 retained runtime 在首次启用新 Finish writer 前执行幂等 cutover：

1. 只读枚举 canonical `.buildr/task-finish` 的 legacy completion/run/lease；拒绝 path/symlink 逃逸。
2. 对可配对、schema 合法且能由 current Task/Development/Git/remote/Environment 事实复核的 completed delivery，写入 compact SQLite completion。
3. 不导入 incomplete、blocked、failed、未知 schema、冲突或无法复核的 token/checkpoint。其 Task 保持原顶层状态，下一次 Finish 必须依据 current facts 建立全新 SQLite run。
4. SQLite transaction 成功并写后读取验证后，删除 legacy Finish-owned files；删除失败由 Doctor 报告 `legacy_cleanup_pending`，但新 writer 不回退到旧协议。

cutover 期间不得双写。新 runtime 不提供 permanent legacy inspect/resume adapter；旧客户端行为不由新代码兼容。

### 7. 所有 consumer 通过 Task Finish Application read model

CLI `run|inspect`、Doctor、Terminal Delivery Application 和 Local App 不直接写 SQL，也不扫描/配对 Finish files。Task Finish Application 返回 current run 或 compact completion read model；Local App 继续只消费 Terminal Delivery Application，展示 current blocked/cleanup 状态和 terminal delivered proof，不自行判断 live currentness。

Doctor 检查 migration identity、foreign keys、唯一 current run/lease、dangling Task/run reference、expired lease、missing/escaped transient locator、orphan transient directory、`cleanup_pending` 与 legacy store 残留。Doctor 只输出有界诊断，不输出 Task 正文、完整命令日志或数据库页。

## Risks / Trade-offs

- [Risk] SQLite 把更多生命周期状态集中到单文件，busy/corrupt 会同时影响多个专业动作。→ 继续使用 bounded busy timeout、WAL、foreign keys、integrity check、连续 migration 与 fail-closed writer provenance；不自动删除或重建数据库。
- [Risk] 外部 Git/remote/Environment 副作用无法与 SQLite 做真正分布式事务。→ 每个副作用前后冻结 identity，恢复时先重观测再决定跳过或重试；completion 只在全部外部结果与清理可证明后提交。
- [Risk] 成功即删除完整日志会降低事后排障深度。→ compact Result 保留 phase timing、命令 observation、failure 摘要、digest、大小与最终 identity；需要长期审计的内容应由独立显式能力承担，不能让运行垃圾无限积累。
- [Risk] legacy completion 可能表面 complete 但无法重新证明。→ 只导入可验证摘要，其余不猜测、不伪造 delivered；保留 Task 顶层事实并要求新 run 从 current facts 开始。
- [Risk] 并发 Change 同时增加 Structured Store 行为。→ 不修改现有 read-only provenance Requirement，合并/归档前重放 strict validation、migration chain 与 Local App system tests。

## Migration Plan

1. 增加连续 SQLite migration、Domain schemas、repository 与 Application transaction tests，在隔离 validation Workspace 覆盖 fresh/upgrade/busy/corrupt/rollback。
2. 将五阶段执行器、lease、CLI inspect/result、Terminal Delivery writer 和 Doctor 切换到 SQLite repository；删除正常 routing 对 legacy File Store 的依赖。
3. 引入受限 transient artifact registry 和幂等 cleanup，覆盖 crash、blocked/resume、Environment 已 cleaned、target-race 与 cleanup failure。
4. 在候选 Workspace 构造 legacy completed/incomplete/invalid/escaped 数据，验证一次性 cutover、零双写与旧目录清理。
5. 完成 integration/System journey 后交付 retained runtime；由 retained controller 应用 canonical migration 和 cutover，再运行 Doctor 确认 SQLite current、无 orphan/legacy residue。
6. 回滚只允许回滚尚未激活的候选。canonical migration/cutover 已激活后不得恢复旧 File Store writer；修复必须通过新的 forward migration/runtime 继续使用 SQLite authority。

## Open Questions

无。表的物理列名和内部模块拆分可在实现中遵循现有代码约定，但 authority、事务边界、保留策略、cutover 与 Skill/Task Record 分工已在本 Change 冻结。
