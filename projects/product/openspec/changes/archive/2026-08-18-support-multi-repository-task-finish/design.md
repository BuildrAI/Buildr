## Context

Task Environment 的 Git worktree provider 已经以稳定 `selector` 登记 repository set，并为 Workspace 根及独立 Project/Service Git repository 保存 retained repository、task checkout、branch、start point 和 remote evidence。Task Finish 目前却把 `validationRoot` 当成唯一 repository root，在 entry 只解析 Workspace retained branch/remote，在 run 中只保存一个 carrier、equivalence、delivery 和 target lease。

这导致两个问题：真正位于独立 Service repository 的贡献没有进入 Finish；Workspace 根没有贡献时，carrier adapter 得到与 Delivery Baseline 相同的 tree，没有创建 commit，却仍把 baseline HEAD 的提交消息与冻结消息比较并误报 mismatch。

本设计保留固定五阶段和现有 Task Environment ownership。多仓库只扩展当前 Git direct-to-target Product adapter，不引入 adapter registry，也不把跨远端操作描述成原子事务。

## Goals / Non-Goals

**Goals:**

- 逐 Environment repository 识别任务贡献，只为有贡献项形成 carrier、等价性和远端交付事实。
- 在任何 push 前完成全部有贡献 repository 的 prepare 与 verify，减少不可避免的跨远端部分成功窗口。
- 逐 repository 持久化交付检查点，使后续 repository 阻塞或进程恢复不会重复 push 已完成项。
- 向 Environment cleanup 提供每个 repository 的 integrated ref，以及 carrier contribution proof 或独立的 no-contribution proof。
- 让现有无副作用 `task-finish.commit-message-mismatch` failed run 可由同一首次命令安全替换为新 run。
- 保持单仓库结果易消费，并对已有 v2 current 状态提供有界兼容读取。

**Non-Goals:**

- 不改变 Task Environment 固定创建 Workspace 根 worktree、repository 发现或 provider evidence 的方式。
- 不提供跨 Git remote 的原子提交、回滚、两阶段提交或 force push。
- 不新增 repository 选择 CLI；Task Finish 继续消费完整 Environment repository set。
- 不改变 Development Candidate、Verification、Review、OpenSpec 或 Task Environment 的 authority。
- 不改变 Delivery Adaptation 的人工语义判断边界。

## Decisions

### 1. Entry 先形成确定性的 repository plan

Entry readiness 从 matching Environment Receipt 的 repository set 形成按 `selector` 排序的 plan。每项绑定 task checkout、retained repository 和 retained checkout 当前符号分支；`startPoint` 仍只作环境来源证据，不作 target branch。

Finish 先以 retained local target HEAD 观察 Task Contribution。若 source tree 等于 original baseline tree，则该项冻结为 `not-applicable/no-contribution`，不解析 delivery remote、不观察远端、不创建 target lease。其余项才解析 remote、核对 retained/remote alignment，并冻结 repository-scoped target identity。

单值 `--target-branch` 和 `--remote` 只在恰好一个有贡献 repository 时适用；多个有贡献 repository 使用这些参数时在 run 创建前 fail closed，避免把一个 override 猜测应用到不同仓库。

选择先判断贡献再解析 remote，是为了让无贡献 Workspace 根不因与实际交付无关的 remote 或提交消息事实阻塞 Service repository；同时仍保留 cleanup 所需的本地 Git 可证明性。

### 2. Run/result 使用 repository-scoped 状态

新 run/result schema 使用排序数组保存 repository plan 与 repository delivery state。每个 repository state 独立保存：

- `selector`、repository identity、target branch/remote/lease target；
- contribution disposition 与 Task Contribution；
- Delivery Baseline、Delivery Carrier、equivalence；
- delivery/readback、cleanup proof 和当前失败位置。

顶层五阶段、Development identity、冻结 commit message、单一 resume token 和 completion 保持不变。单仓库结果继续投影顶层 `carrier`、`equivalence`、`delivery` 兼容摘要；多仓库 consumer 以 `repositories` 为 authority，顶层单值不伪装聚合事实。

SQLite `task_finish_current` 仍是一 Task 一 current row。连续 migration 增加 repository-set/carrier-set 的最小查询 identity；旧 target/carrier 单值列仅在 singleton projection 有值。target lease 仍复用同行单槽，因为 deliver 串行持有一个 repository lease；lease identity 改为 repository identity、remote 与 branch 的摘要，避免不同 repository 的同名分支互相占用。

旧 v2 run/result 保持可读。带副作用或 resume 事实的 v2 current 不自动换绑到多仓库语义；它继续按冻结的 singleton Workspace 事实检查或 fail closed。只有精确满足“prepare terminal failed、code 为 `task-finish.commit-message-mismatch`、无 carrier/lease/resume/delivery/retained/cleanup、后续 phase 未开始”的旧 run，才允许同一首次命令保留旧 Execution Record、退休旧 current 并创建新的多仓库 run。

### 3. Carrier root 是 run-owned 容器

run 的 transient carrier root 保持在现有固定目录，但每个有贡献 repository 使用 selector identity 派生的直接子目录。所有路径必须通过 containment、realpath、普通目录和 Git worktree registration 证明 ownership。

无贡献 repository 不创建目录、Git worktree 或空 commit。`createIsolatedGitCarrier()` 只有在 applied tree 不同于 Delivery Baseline tree 且本次确实创建 carrier commit 时才校验该 commit 的消息。Delivery Adaptation 的显式零差异仍是另一条受控语义，继续核验 agent-reviewed carrier ownership，不与 no-contribution 混用。

自举 activation 和 occupancy 协调改为从 repository set 定位唯一适用的 Workspace carrier；普通多仓库任务不取得 Buildr 自举能力。cleanup 删除每个精确 carrier 后再删除空的 run-owned 容器。

### 4. Prepare/verify 全部通过后才串行 deliver

`prepare` 对全部有贡献 repository 建立或复核 carrier；任一项需要 Delivery Adaptation 时，阶段 blocked 且不进入任何 remote mutation。`verify` 同样要求全部 carrier current/equivalent 后才进入 deliver。

`deliver` 按冻结 selector 顺序逐项执行。每项取得 repository-scoped lease，重验 handoff、target 和 carrier，完成 fast-forward/push/readback 后立即通过内部 phase checkpoint 写回该 repository 的 durable delivery facts，再释放 lease并处理下一项。checkpoint 是固定阶段内部持久化，不新增公共 workflow step。

恢复时：

- 已交付项只做 remote containment/readback 复核，不重复 push；
- 未交付项从其保存的 baseline/carrier 状态继续；
- target race 只失效尚未交付 repository 的 prepare/verify/deliver facts；
- 已交付项若不再能证明 contained，则整 run blocked，不能宣称回滚或自动重写远端。

### 5. Cleanup 显式区分 delivered proof 与 no-contribution proof

对有贡献 repository，Finish 沿用 carrier-based equivalent contribution proof。对无贡献 repository，Finish 生成独立 `no-contribution` cleanup proof：重新观察 task checkout 仍等于冻结 original baseline tree，并绑定 cleanup 时的 retained target ref。该 proof 不是 Delivery Carrier，也不携带 commit message。

Finish 一次性把所有 repository 的 integrated ref 与对应 proof 交给 retained Task Environment manager。Git worktree provider 逐 selector 复算 carrier contribution 或 no-contribution；全部通过后按既有深度顺序移除 worktree/branch/evidence。这样 Workspace 根虽然不参与交付，仍与 Service scope 一起被清理。

## Risks / Trade-offs

- [跨远端不能原子回滚] → 在任何 push 前完成全部 prepare/verify，逐 repository checkpoint，并在结果中如实呈现部分成功和唯一恢复动作。
- [repository 状态扩大 SQLite payload] → 只保存 compact current 与最小查询 identity，完整命令输出仍只进入 Execution Record。
- [旧 v2 run 无法安全升级为完整 repository set] → 有副作用状态保持冻结 singleton 语义；只对精确可证明无副作用的历史误失败开放新 run 替换。
- [无贡献判断后 task checkout 漂移] → prepare、resume 和 cleanup 都重新观察 source tree/Task Contribution identity，漂移时 fail closed。
- [单值 CLI override 在多仓库中歧义] → 只允许唯一有贡献 repository，多个有贡献项时在入口拒绝。
- [自举 consumer 依赖单 carrier] → 只从 repository set 选择唯一 Workspace carrier并保留 singleton compatibility projection，相关 contract/system test同步更新。

## Migration Plan

1. 添加连续 SQLite migration 和 v3 repository-set domain normalization，同时保留 v2 inspect/受控恢复路径。
2. 先上线 entry plan、run state 与 carrier container，再切换五阶段 handler 和 cleanup handoff。
3. 用单仓库现有 journey 保证兼容，再以真实多 Git repository fixture 验证部分无贡献、多个贡献、target race、部分成功恢复和统一 cleanup。
4. 若新版本验证失败，代码可回退；已创建的 v3 current 必须由支持 v3 的 runtime inspect/恢复，旧 runtime fail closed，不做 payload 降级。

## Open Questions

无。用户已确认保留 Workspace 根 worktree，并明确无贡献 repository 只参与最终 Environment cleanup。
