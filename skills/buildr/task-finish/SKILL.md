---
name: task-finish
description: 用户要求已有正式任务（formal Task）“收尾”或交付当前研发交接（Development handoff）时使用；由智能体（Agent）选择直接 Git/PR、Buildr 自动 Finish 或交付对账（delivery reconciliation），并独立处理激活、环境清理和诊断。
---

# 任务收尾（Task Finish）

本 Skill 是 `buildr.task-finish/v1` 的默认 provider。它帮助智能体（Agent）完成正式任务交付，不把 Buildr 自动 Finish 变成唯一通道。

> Buildr 约束 Agent 不要做错事，不要求 Agent 必须通过 Buildr 才能做事。

Agent 负责选择 Git、拉取请求（Pull Request, PR）、分支与恢复策略；Buildr 负责读取当前研发交接（Development handoff）、验证真实远端、登记交付，并在可证明安全时协助清理。Task Finish 不运行或记录 Task Verification、Task Review，不生成 Candidate，也不收敛 OpenSpec Change。

开始决策前先读取 Finish current facts。它统一表达 handoff、repository topology、run/carrier ownership、side effects、remote containment、维护结果、typed blockers、required 安全前置与 available capabilities。`task next`只把这些事实和能力带到入口，不替 Agent 选择唯一动作；兼容性的 `next` 提示不是行为权威。

## 交付前

1. 确认 Task ID、canonical Workspace、current Development handoff 和实际 repository 集合。
2. 核验每个 repository 的 source、target branch、remote identity、任务贡献（Task Contribution）和远端现状。
3. 需要 force push、覆盖他人提交、改写共享历史，或 repository/ref/remote 有歧义时停止并请求决定。
4. Development handoff 或 Candidate 真实 stale 时返回 `task-development`；远端前进、路径不重叠或 Buildr 内部记录缺失本身不使 handoff stale。

`--commit-message` 由 Agent 提供时，默认遵循当前 workspace `AGENTS.md` 的提交语言约定；Project、Service、repository 的更具体约定优先。Task Finish 不翻译或重写提交信息。

## 由 Agent 选择路径

### Buildr 自动 Finish

目标明确且适合普通 fast-forward 交付时，可复用交付载体（Delivery Carrier）：

`buildr task finish run --task <task-id> --commit-message '<semantic-message>' --target <canonical-workspace> --detail compact --json`

`run` 按 `preflight → prepare → verify → deliver → cleanup` 尝试自动化；这些阶段不是 Agent 必须遵循的唯一工作方式。出现冲突或远端变化时，Agent 可继续同一 run、处理交付适配（Delivery Adaptation）、改走 PR 或直接 Git。不得手写 resume token、claimed success 或语义等价证明。

Agent-reviewed Delivery Adaptation必须对冻结Task Contribution的每个路径形成唯一处置：目标精确包含、carrier实际改变，或Agent通过matching run/resume使用`--reviewed-target-path <repository-selector>::<path>::<reason>`逐路径确认目标语义承接。Buildr只证明路径集合、Git bytes与identity闭合；逐路径理由仍是Agent判断，不被描述为机器证明。缺失、未知、重复、空理由或陈旧run/target/carrier输入保持同一run blocked。零差异适配仍需`--accept-zero-delta-adaptation`，且不隐式豁免逐路径覆盖。

如果Agent误改原Task worktree并形成新的current Candidate，先重新读取Finish current facts。只有facts明确返回`stale-run-retirable`与available `finish-rollover`能力时，Agent才可显式执行：

`buildr task finish rollover --task <task-id> --recovery-token <facts-token> --commit-message '<semantic-message>' --target <canonical-workspace> --detail compact --json`

`rollover`只重新验证已知Task Contribution漂移、不可刷新的carrier初始内容证明、无lease/Delivery/Activation/Cleanup副作用及不变repository topology；它精确清理旧carrier并以current-row fence创建绑定新Handoff的active run，不访问远端、不执行Delivery。能力不可用、token漂移或carrier被Agent修改时保留现场，Agent改走检查、直接Git/PR、reconcile、Development或放弃策略。普通`run`不得替Agent静默执行该换代。

### Agent 直接交付

Agent 可通过 Git Operations、PR 或其他已授权方式推进代码；每个 repository 保留独立结果，部分成功不得伪装为原子事务，也不得重复推送已交付 repository。

交付后运行：

`buildr task finish reconcile --task <task-id> --target <canonical-workspace> --detail compact --json`

交付对账（Delivery Reconciliation）不接受调用方提交“已成功”、commit 列表或证明文件。它优先复用current Environment；Environment不存在、已清理或局部不可用时，从current immutable handoff、Task scope、Project/Service registries、实际Git topology以及明确或唯一的remote/target构造只读上下文，不恢复或补造Receipt。它逐repository确认carrier已到达、已被后继包含，或目标tree精确包含任务贡献结果；无法证明时只报告对应repository的事实缺口，并保留其他repository已经登记的Delivery checkpoint。

## 四个独立结果

- 交付（Delivery）：Task Contribution 是否已在目标远端；
- 激活（Activation）：运行时投射、Buildr 自举或 Doctor 是否需要关注；
- 环境清理（Environment Cleanup）：Task worktree 和资源是否已安全清理；
- 诊断（Diagnostics）：Execution Record 与诊断材料是否成功保留。

只有 Delivery 决定业务任务是否已交付。Doctor、Execution Record、Activation、Cleanup、Task 登记或 Buildr 内部派生证据失败只能形成 `attention`，不能撤销已确认交付。Task 顶层登记失败时重复 `task finish reconcile`，不得重新提交或推送业务代码。

环境清理由 Agent 在适当时机独立执行：`buildr task environment cleanup <task-id> --target <canonical-workspace> --json`

Environment 只消费 Buildr 已持久化的交付证据或明确 abandon 终态。无法证明 worktree 内容已交付、ownership 不明或 source 已漂移时必须保留现场。
没有current Environment时，Cleanup必须报告`not-applicable`或`attention`，不得声称`cleaned`。

精确 carrier cleanup、旧 run retirement和本地安全rollover只能通过 Buildr 提供的封闭原语执行。原语会重新验证 Task/run/carrier identity、ownership、repository topology、phase、side effects，以及对应路径需要的remote containment或carrier disposability proof，不接受调用方指定任意删除路径；事实不足时保留现场，由 Agent 选择下一策略。

## 应当阻断的边界

- remote target 不包含 Task Contribution；
- repository、branch、remote 或 Task identity 有歧义；
- 需要 force push、覆盖他人提交或改写共享历史；
- 无法证明 worktree、carrier 或资源属于当前 Task 并可安全删除；
- 调用方试图伪造交付、语义等价或完成证据。
- Agent-reviewed carrier没有完整处置Task Contribution的全部路径，或路径覆盖证明已漂移。

Buildr 状态不一致、可重建证明缺失、重复观察已交付 repository、单个 Cleanup 或 Diagnostics 失败，不属于 Delivery 阻断条件。

## 报告

先报告每个 repository 的 Delivery，再分别报告 Activation、Environment Cleanup、Diagnostics 和需要 Agent 处理的 attention。只有未交付、身份不明或涉及破坏性风险时请求用户决策；交付后可询问是否复盘。
