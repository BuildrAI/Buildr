## Context

Task Development 当前冻结完整 Content Target，并把 Candidate、Verification、Completion Review 与 handoff 绑定到该任务内容。Task Finish 随后在原 Task worktree 中提交内容，以当时远端 target ref 为 `expectedTargetRef`；若目标分支在 prepare 后或 Candidate freeze 后前进，现行实现直接返回 `task-finish.target-race` 和 Task Development。

这里有两个不同事实：

- 任务贡献（Task Contribution）：原任务相对其 Git 共同基线产生的最终 source delta；
- 交付基线（Delivery Baseline）：Finish 准备交付载体时读取的最新远端 target commit/tree。

目标分支前进只改变交付基线，不必然改变 Task worktree、Content Target 或任务贡献。Buildr 能确定性证明 Git delta 是否无冲突应用且前后 identity 等价，但不能证明新基线上的业务语义安全。

## Goals / Non-Goals

**Goals:**

- 不修改原 Task worktree、原 Candidate、Candidate generation 或既有专业 Results，在隔离位置形成最新基线上的 Delivery Carrier。
- 用可复算 Git identity 区分原任务基线、任务贡献、最新交付基线与应用后的贡献。
- 目标前进但任务贡献可机械复用时保持 `formalVerificationExecutions = 0`；冲突、漂移或证据不足时返回 Task Development。
- 保持五阶段主线和精确 resume token；覆盖远端交付、回读和 Environment cleanup。

**Non-Goals:**

- 不把路径无重叠、clean apply 或 delta identity 宣称为语义安全。
- 不自动 rebase、解决冲突、force push、生成新 Candidate、重跑正式 Verification 或 Completion Review。
- 不新增通用状态机、调度器、CAS、history、用户提交的执行计划或 Local App 生命周期页签。
- 不为非 Git adapter 发明通用 contribution algebra；当前机制只收敛现有 Git Task Finish adapter。

## Decisions

### 1. Candidate 继续绑定原 Content Target，复用证明属于 Finish carrier evidence

Task Development authority 不增加 delivery baseline 字段，也不因目标分支变化更新 Receipt。Finish 仍先通过 Development Application 证明原 handoff current；随后单独生成 `taskContribution` 与 `deliveryBaseline` evidence。这样目标分支变化不会成为 Candidate generation 输入，Verification/Review Result 也不会被 Finish 读取或重写。

备选方案是在 Development Receipt 中加入目标分支或 baseline identity。该方案会把交付时才确定的目标事实倒灌进 Candidate，并使 baseline advance 自动触发 generation，违反本次目标，因此不采用。

### 2. 原 Task 内容通过临时 Git index 快照，不提交或改写 Task worktree

Prepare 使用独立临时 index：以计算出的原任务基线 tree 为起点，精确覆盖当前 Task worktree 中全部非 `.buildr`/`.git` source paths，生成 source snapshot tree。Task Development Application 同时重新确认 Content Target/handoff current。整个过程只写 Git object 与产品自有临时文件，不写原 index、HEAD、branch 或工作树。

任务贡献 identity 由 `originalBaselineTree → sourceSnapshotTree` 的 canonical raw tree delta 生成，包含 path、mode 与 before/after blob identity；不使用路径集合本身推断安全。

### 3. Delivery Carrier 基于最新远端 target 的隔离 worktree

Prepare fetch 并冻结最新远端 target commit/tree 为 Delivery Baseline，在 `.buildr/task-finish/carriers/<run-id>` 创建产品拥有的 detached Git worktree。产品把原任务贡献的 binary patch应用到该 carrier；Git apply 失败即视为冲突并删除未交付 carrier，返回 Task Development，不尝试三方语义解决。

应用后重新计算 `deliveryBaselineTree → carrierTree` 的 canonical raw delta。只有该 delta identity 与原 `taskContribution.identity` 完全相同，且原 Development handoff 仍 current，才允许 commit carrier 并进入 verify。即使 patch clean，只要 before/after blob、mode 或 path 不能证明等价，也 fail closed。

### 4. Target race 只重建 Delivery Carrier，不重建 Candidate

Deliver 在 lease 内发现 target ref 又前进时返回 resumable `task-finish.target-race`。精确 token 恢复会使旧 `prepare/verify/deliver/cleanup` carrier outputs 失效，从 prepare 重新读取最新 Delivery Baseline、清理旧隔离 carrier并形成新 carrier；run identity 中的 Candidate、generation、handoff 和专业 gate references保持不变。

冲突、Task worktree/Content Target 漂移、贡献 identity 不等价或隔离 carrier ownership 无法证明时使用 terminal `failed + nextWorkflow: task-development`，不生成可恢复假象。

### 5. Environment cleanup 独立复核贡献交付，而不要求任务分支成为 target 祖先

隔离 re-application 产生的新 carrier commit不以原 Task branch tip为祖先，因此现有纯 ancestry cleanup 会误判未集成。Finish 向 retained Environment Manager 提交 bounded contribution proof；Git provider独立复算：当前 Task source snapshot、原基线 delta、Delivery Baseline delta、carrier/target ref与 proof identities全部匹配后，才把该 Task worktree视为已交付并执行原有精确 cleanup。普通 ancestry 路径继续保留；两者不是并行 delivery authority，而是同一 provider 的两种确定性 integrated evidence。

成功 cleanup 后由 Finish 删除自己拥有的隔离 carrier worktree；cleanup blocked 时保留 carrier用于同一 run 恢复，其他 Task worktrees与refs不受影响。

## Risks / Trade-offs

- [同一路径发生无冲突但真实 preimage 已变化] → raw delta identity 会不等价并返回 Development；这是有意的保守 false negative。
- [目标分支在 push 前再次前进] → exact resume token 从 prepare 重建 carrier；不会增加 Candidate generation或正式验证次数。
- [push 成功后远端再次被他人推进] → 若无法证明当前远端仍等于 carrier，停止并保留 evidence；不把远端回读不一致伪装成交付完成。
- [任务贡献在 handoff 后漂移] → Development Content Target/handoff current 检查与 source snapshot identity共同阻断复用。
- [隔离 carrier 遗留] → 仅清理精确 run-owned path/registration；ownership 不明时保留并诊断，不递归删除宽路径。
- [机械等价被误解为语义安全] → specs、Skill 和结果字段明确限定为 Git/identity 事实；Project 如要求最新基线上的语义验证，仍由其 verification policy 和 Agent 判断返回 Development。

## Migration Plan

1. 同一 Change 修改 canonical requirements、Task Finish Skill、Git carrier helper、run resume与 Environment cleanup handoff。
2. 删除旧“target race 必须重建 Candidate/重跑 Verification”文案与测试断言，保留唯一的 contribution-equivalent recovery。
3. 现有 terminal target-race run不迁移或伪造 reuse evidence；新实现只处理新调用形成的完整 proof。
4. 通过 focused integration/system 测试后执行 Product delivery-required verification，并用正式 Task Finish 交付与清理本任务环境。

## Open Questions

无。当前 Change 只支持现有单 Workspace Git delivery adapter；多 repository carrier 组合留给真实需求，不在此预扩展。
