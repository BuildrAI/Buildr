## Context

当前主线已经把 OpenSpec canonical sync 放进 `buildr openspec converge`，并具备确定性 planner、隔离 strict validation、临时文件准备、批量 rename、pre/post guard 和阶段型 convergence receipt。问题在于产品仍把恢复建模为“上次执行到了哪个阶段”：`contract-baseline.json`、`contract-pre-sync-receipt.json`、`deterministic-sync-plan.json`、`deterministic-convergence.json` 以及恢复分支新增的 `convergence-recovery.json` 重复保存 change、delta、canonical 与 executable identity。

两个并发实现提供了重要证据，但不直接合并：

- `complete-task-finish-convergence-recovery` 已能用旧 plan 的 `beforeDigest` / `expectedDigest` 观察 canonical，并区分可恢复、语义冲突和不可证明状态；但它仍先反向恢复 canonical、重绑 baseline，再重跑 pre-sync/plan/apply/post-sync，新增了恢复 receipt 与阶段链。
- `harden-task-finish-identity-timing` 收紧 finish evidence 和 provider timing，说明 convergence 结果必须携带稳定、可投射的身份与耗时；它不改变 OpenSpec 语义，兼容策略必须避免覆盖该分支可能集成的 Task Finish 计时字段。

本设计保留所有安全保证，但改变恢复 authority：阶段记录只用于本次调用诊断，长期恢复只依赖单一 convergence receipt 和真实文件 digest。状态机记录可以过期，canonical 文件事实不能伪造。

## Goals / Non-Goals

**Goals:**

- 把确定性收敛做成单一产品事务，正常路径只需一次 `buildr openspec converge`。
- 以一份 convergence identity、一个确定性 plan 和一份 convergence receipt 表达最小恢复事实。
- 在任何进程中断后，通过 canonical 当前 digest 与 `beforeDigest` / `expectedDigest` 判断下一步。
- 将 planner、projected validator、canonical applier、observer、receipt 和 orchestrator 分离，使单元边界可独立验证。
- 让 Task Finish 只理解 `passed`、`blocked`、`recovery-unprovable`，不理解内部阶段。
- 让 Task Finish checkpoint 命令在 OpenSpec domain 无法加载时仍可写 blocked、终结 attempt 并释放归属 lease。
- 提供旧 sidecar 的保守兼容读取和迁移，不要求回滚 canonical 或重建 baseline。

**Non-Goals:**

- 不修改上游 OpenSpec 1.6 的 artifact schema、parser、strict validation 或 archive 行为。
- 不自动解决同一 Requirement 的并发 active Change、重复 identity、partial MODIFIED、rename 占用等语义冲突。
- 不把多文件原子性描述为文件系统提供的跨文件原子事务；Buildr 仍使用 prepare、条件检查、rename 与可证明恢复实现批次安全。
- 不在本 Change 合并、rebase、清理或修改两个并发 worktree。
- 不重新设计 Task Finish 的验证、Git、runtime、asset review 或计时模型。

## Decisions

### 1. 一个收敛身份覆盖所有决定结果的输入

`convergence identity` 只包含：Project/change identity、delta digest、每个触达 canonical 文件的当前完整 digest、OpenSpec executable identity/version，以及 planner algorithm version。Identity 由规范化、稳定排序后的 JSON 计算；不包含临时路径、时间、stage 或机器绝对路径。

Planner 从当前 canonical 直接建立 `before` 事实，不再要求正常路径先创建 contract baseline。对于 MODIFIED/REMOVED/RENAMED，delta 是完整 Requirement，planner 只有在当前 canonical 唯一匹配且结构保全可证明时才生成计划；这等价保留 baseline drift 的安全目的，但消除了“delta 创建时的旧快照”成为正常执行依赖。跨 active Change 冲突仍在 planner 前由同一输入扫描执行。

替代方案是保留 baseline 作为 identity 的一部分。这仍会让 delta 改变、前序 change 归档和当前 canonical 之间形成三方状态，恢复必须判断 baseline 是否可刷新，因此不采用。

### 2. 计划是纯值，不是独立长期 sidecar

`convergence-planner` 输入解析后的 delta、canonical snapshots、proposal capability descriptions 和 active-change touches，输出：

- 受影响文件的相对路径；
- `beforeDigest` 与完整 `beforeContent`；
- 完整 `expectedContent` 与 `expectedDigest`；
- Requirement operation decisions；
- `safe`、`already-applied` 或 `blocked`；
- `planIdentity`。

Plan 在一次事务内存中传递，并完整嵌入唯一 receipt；不再写 `deterministic-sync-plan.json`。纯 planner 不访问文件系统、不执行 OpenSpec、不写日志，因此相同输入得到相同输出。

替代方案是只在 receipt 保存 digests、不保存 before/expected 内容。那会使进程中断后的写后确认可判断状态，却无法在 `before` 状态重新应用，也无法核验 plan 内容未被伪造，因此 receipt 保存完整内容及其 digest。

### 3. 隔离验证绑定 identity，成功结果只在输入未变时可应用

`projected-validator` 在 task-owned 临时 Project 中复制 OpenSpec planning tree，投射全部 expected 文件，使用 identity 绑定的 executable 运行 `validate --all --strict --no-interactive`。它返回 executable identity、expected digests、duration 和有限诊断摘要；临时目录始终按归属清理。

验证结束后 `canonical-applier` 再次读取所有 canonical before digests、delta digest 与 executable identity。任一变化都放弃旧 plan并重新观察/规划，不尝试修补或回滚到旧输入。所有临时目标准备并校验完成后才开始 rename；rename 中断通过 receipt 和真实文件状态由 observer 判定，而不是信任已记录的内部 stage。

### 4. Observer 只产生四种文件事实 disposition

`convergence-observer` 对 receipt 内每个文件比较当前 digest：

- 全部等于 `beforeDigest`：`planned-not-applied`，可以重新验证当前 executable 后条件式应用；
- 全部等于 `expectedDigest`：`applied-and-matched`，执行写后 strict confirmation；
- 部分 before、部分 expected，或任一 digest 两者都不等于：`state-unknown`，映射为 `recovery-unprovable` 并停止；
- Change 已归档且 canonical 仍等于 expected：`archived`，幂等成功。

如果 delta identity 已变化，旧 plan 不再适用：observer 丢弃旧计划的执行资格，以当前 canonical 重新规划。若 canonical 已等于旧 expected，新 delta 的 planner把它视为新的 current before；不会先恢复旧 before。若 executable identity 变化，文件计划仍可观察，但旧 validation 不可复用，必须重新执行隔离验证和写后确认。

这与恢复分支“反向 apply旧 plan、重建 baseline”不同：新设计从不为了让状态机好看而撤回已经确定的 canonical 内容。

### 5. 一份 receipt 既是恢复证据也是事务结果

唯一文件为 change 下 `.buildr/convergence-receipt.json`，schema 包含：

- convergence/plan identity 与 algorithm version；
- Project/change/delta/executable identities；
- 每个文件的 before/expected content 与 digests；
- disposition：`planned-not-applied|applied-and-matched|state-unknown|archived`；
- projected validation 与 post-apply confirmation 摘要；
- apply effects、archive result、created/updated time。

Receipt 使用原子 JSON writer。产品允许在第一次 canonical rename 前写 `planned-not-applied`，应用后再写 `applied-and-matched`。如果应用成功而 receipt 更新失败，下一次仍可用旧 receipt 的 expected digest 观察为已应用；如果首份 receipt 都未成功落盘，则 canonical 尚未开始写入。

Receipt 不保存长期 stage transitions。单次命令可以在返回 payload 中报告 planner、validation、apply、confirm、archive 的 duration 和 command count，但这些是本次 execution evidence，不是恢复状态机。

### 6. 写后确认与 archive 分离

Apply 后只做两项确认：全部 canonical digest 等于 expected，以及真实 Project 使用当前 executable 通过 strict validation。成功后 receipt disposition 为 `applied-and-matched`，再执行 `openspec archive <change> --yes --skip-specs`。

Archive 失败不改变 canonical disposition；receipt 保存 archive failure，重试只确认 canonical 后重跑 archive。Archive 成功后写 `archived`。因此归档失败永远不需要恢复 canonical。

### 7. Task Finish 消费稳定结果，不消费内部阶段

`contract-convergence.openspec` action 只执行一条 environment-local `buildr openspec converge`。JSON result contract：

- `passed`：canonical 已确认且 Change 已用 `--skip-specs` 归档；
- `blocked`：semantic conflict、active Change conflict 或 expected strict validation 失败，需要 Agent/用户修订 artifacts；
- `recovery-unprovable`：canonical/receipt/identity 无法证明，停止人工检查。

Task Finish checkpoint 保存 result classification、receipt identity、effects、duration 和 command count，不保存或恢复 OpenSpec stages。Resume 对同一 action 再调用 converge，由 observer 决定幂等下一步。

### 8. 轻量 checkpoint bootstrap 与 OpenSpec domain 解耦

当前 CLI registry 启动时会加载完整 application domains；OpenSpec 文件存在语法冲突时，连 `task finish advance|recover|inspect` 都无法运行。新增最小 bootstrap，只加载参数解析、task-finish run store、atomic JSON、lease ownership 与 compact output。Checkpoint 子命令先由轻量 registry 匹配，未匹配时才延迟加载完整 runtime/domain registry。

轻量入口只允许：读取/写入 finish checkpoint、把当前 OpenSpec action标记 blocked、终结归属 attempt、释放 identity 匹配的 lease。它不能执行 converge、修改 canonical、加载 provider、Git 或 runtime domain。测试通过注入语法错误/冲突标记模块证明入口仍可用。

### 9. 旧接口采用只读兼容和新写入截断

兼容期内：

- `baseline create`、`check --stage proposal|pre-sync|post-sync`、`sync-plan`、`sync-apply` 继续可解析历史 Change 和提供诊断，但 Task Finish、Skills 和新文档不再调用它们；
- 首次新 `converge` 可读取旧 convergence/sync-plan receipt。如果旧 plan 的 before/expected 内容与 digest 完整、change/project/executable identity 可核验，则转换为内存中的新 receipt 候选并由 observer 判断；只要链条缺失或当前文件无法匹配，就返回 `recovery-unprovable`；
- 新入口永远只写 `convergence-receipt.json`，不刷新旧 baseline/pre-sync/sync-plan/recovery sidecar；
- 已归档历史 sidecar 保持原样，不批量重写；package/contract audit 允许历史 schema，但拒绝新 active Change 生成旧 sidecar。

后续版本可在 telemetry/fixture 证明旧接口无消费者后单独移除，不在本 Change 删除用户可调用命令。

## Risks / Trade-offs

- [当前 canonical 已包含旧 apply 的部分文件] → observer 返回 `state-unknown` / `recovery-unprovable`，不自动覆盖；人工核对后通过新的明确 Change 修正。
- [delta 改变但 canonical 已完整应用旧 expected] → 以实际 canonical 为新 planner 的 before，不反向恢复；若新 delta与现状冲突则 `blocked`。
- [跨文件 rename 中途失败] → receipt 已包含所有 before/expected，observer 能识别混合状态但关闭式失败；不声称文件系统具备跨文件原子性。
- [旧 baseline 提供了“提案时事实”审计价值] → proposal/delta Git 历史继续提供审计，兼容 reader 保留旧 sidecar；新事务不再把该历史快照作为执行授权。
- [延迟加载改变 CLI bootstrap] → 用架构测试固定轻量命令的依赖闭包，并让普通命令继续走现有完整 bootstrap。
- [并发两个不相交 Change 同时修改同一个 spec 文件] → 文件级 before digest 会使后应用者重新规划；即使 Requirement 不相交，也不会覆盖前者写入。重新规划后可安全合并当前文件。
- [严格验证增加重复调用] → 正常路径固定 projected validation 与一次 post-apply confirmation；结果报告实际命令次数与耗时，幂等/archive-retry 路径避免无关阶段重跑。

## Migration Plan

1. 先实现纯模块与新 receipt schema，在不改变 CLI 的条件下用 fixtures 覆盖 planner/observer/applier。
2. 实现新 orchestrator，并让 `openspec converge` 使用它；保留旧子命令但停止正常路径写旧 sidecar。
3. 增加 legacy reader，把完整旧 plan 映射为内存候选；无法证明时关闭式失败。
4. 将 Task Finish action registry 和 Skill/CLI 文档切换为单命令/三结果契约。
5. 引入轻量 checkpoint bootstrap，并以损坏 OpenSpec module journey 固定加载边界。
6. 运行旧 contract fixtures 与新完整 journeys；只有安全保证等价且新路径不生成旧 sidecar时完成迁移。

回滚时可将 Task Finish action 暂时切回旧 `openspec converge` 实现，但不得用新 receipt 伪造旧 baseline/pre-sync receipt；新 receipt 保留现场，回滚版本无法证明时必须停止人工检查。

## Open Questions

- 旧 CLI 的正式移除版本与弃用提示周期留给后续 release Change；本 Change 只建立兼容层和 consumer 零引用门禁。
- 多文件 rename 中断后是否提供显式人工审计/修复命令留给后续产品设计；本 Change 只保证 `recovery-unprovable` 与零覆盖。
