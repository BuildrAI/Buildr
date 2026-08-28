---
name: task-finish
description: 用户要求“收尾”“交付”或完成当前工作时使用；先识别当前范围内匹配的未结束 Buildr Task，有 Task 就沿正式生命周期推进到交付和安全清理，没有 Task 就按普通 Git 完成提交、集成、推送、远端确认和可证明的本地善后。
---

# 收尾与交付

本 Skill 是完整“收尾/交付”意图的统一入口，也是 `buildr.task-finish/v1` 的默认 provider。它选择正确路径并持续推进，不合并正式 Task 与普通 Git 的状态和证据。

“收尾/交付”授权当前范围内安全、常规且目标明确的提交、集成、推送、对账和清理；不授权强制推送、丢弃改动、覆盖他人工作、改写共享历史、替用户解决语义冲突或删除归属不明的资源。

## 1. 选择路径

先确认 Workspace、实际仓库集合、用户目标和改动归属，再读取当前范围的 Task 事实。

- 唯一匹配的未结束 Task：进入正式 Task 路径。匹配必须同时符合仓库集合、Task scope 和用户目标。
- 没有匹配 Task：进入普通 Git 路径。已完成、已放弃或无关 Task 按不存在处理，不复用其环境、候选、验证、研发交接或收尾证据。
- 多个 Task 可能匹配，或仓库、范围、目标无法唯一确定：只询问会改变交付对象的最少问题。

两条路径互斥。普通 Git 路径不创建临时 Task，也不产生正式生命周期证据。

## 2. 正式 Task 路径

### 推进到研发交接

运行 `buildr task next <task-id> --target <canonical-workspace> --json`，只处理它返回的当前动作。`required` 前置由返回的 selected provider 恢复；`recommended` 由 Agent 结合真实目标选择。

调用对应专业 owner 并消费结果，本 Skill 不代写环境、研发、审查、验证、候选或风险决定。owner 成功后重读 `task next`，直到形成 current Development handoff、Task 按无变更路径结束，或出现需要新授权、业务判断或外部变化的真实 blocker。同一状态没有变化时停止，不循环调用或伪造进展。

### 完成交付

形成 current handoff 后读取 Finish current facts，核对 Task、仓库集合、任务贡献、目标 branch/remote、run/carrier ownership、remote containment、typed blockers 和 available capabilities。

适合普通 fast-forward 时可运行：

`buildr task finish run --task <task-id> --commit-message '<semantic-message>' --target <canonical-workspace> --detail compact --json`

`run` 提供 `preflight → prepare → verify → deliver → cleanup` 可选自动化。提交信息遵循当前 workspace `AGENTS.md` 及更具体规则，Task Finish 不翻译或重写提交信息。

也可通过直接 Git、拉取请求或其他已授权方式交付；完成后必须运行：

`buildr task finish reconcile --task <task-id> --target <canonical-workspace> --detail compact --json`

`reconcile`只接受真实远端事实，不接受调用方声明成功或自制证明。多仓库逐项保留结果，部分成功不伪装成原子事务，也不重复交付已确认仓库。

出现 target race、交付适配（Delivery Adaptation）、stale run 或其他恢复状态时，只使用 current facts 返回的同一 run、token 和封闭能力。Agent 审查的适配必须覆盖冻结任务贡献的每个路径；零差异适配仍使用产品要求的显式确认。不得手写 token、claimed success、任意删除路径或语义等价证明。

只有原 Task source、Task Context、planning、policy 或其他候选输入真实变化，才返回 `task-development`。远端前进、carrier 冲突、路径不重叠或 Buildr 内部记录缺失本身不使 handoff stale。

### 完成善后

四个独立结果是交付、激活、环境清理和诊断。只有交付决定任务贡献是否进入目标远端；其他结果失败形成 attention，不撤销已确认交付。

交付成立后执行适用激活，通过 `buildr task environment cleanup <task-id> --target <canonical-workspace> --json` 清理环境，并保留诊断和未解决 attention。Buildr 自举 Workspace 只走运行时追加的唯一自举流程；Task 顶层登记失败时重跑 `reconcile`，不重新提交或推送业务代码。

完成标准：每个仓库的交付已确认，Task 已进入正确终态，激活、环境清理和诊断已完成或留下准确 attention，并且没有仍可安全执行的 current action。

## 3. 普通 Git 路径

确认每个实际仓库的 branch/HEAD、dirty/index、精确 owned scope、目标 ref、remote 和 push destination。事实唯一后，由 Agent 选择符合仓库协作方式的顺序，并把每个已支持的单次操作交给 `buildr.git-operations/v1` selected provider。

通常依次观察和刷新目标 ref，必要时精确暂存并提交，按仓库约定完成 rebase、merge、拉取请求或其他已授权集成，普通 push 后回读 destination ref 和完整 publication range，最后清理只属于本次交付且能证明安全删除的临时 worktree、local branch 或其他资源。

`fetch`、`commit`、`rebase` 和 `push` 保持独立结果。某一步失败时保留已发生 effects，不把组合动作描述为原子事务；内容已在目标远端时不制造空 commit 或重复 push。

本路径只报告 Git Operation Result、远端回读和本地善后。无法证明资源归属或删除安全时保留现场并报告 attention，不声称 Environment Cleanup，也不创建 Task、Development、Review、Verification、Candidate、Finish Result 或 Task terminal status。

完成标准：当前 owned scope 已提交，按目标协作方式完成集成，远端 ref 已回读确认，可安全清理的本次资源已经清理，并且没有未说明的遗留状态。

## 4. 停止与报告

Task、仓库、branch、remote、目标 ref、owned scope 或资源归属不明确，remote 不能证明包含交付内容，current owner 需要新的用户决定，或继续需要破坏性动作时停止并保留现场。

报告先按仓库说明交付或 Git 结果，再说明 Task 终态、激活、环境清理、诊断、本地善后和 attention。只有仍未交付、身份不明或涉及破坏性风险时请求用户决定。
