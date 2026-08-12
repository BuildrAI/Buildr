## Context

`task-triage` 当前用一份约 5,600 字符的正文同时处理语义路径、task environment、任务看板、OpenSpec 状态和验证规划。核心原则基本一致，但同一规则在判断步骤、输出模板、专项章节和 guardrails 中反复出现；repository set 没有进入输出模板，复杂 code-only 任务又因任务看板强制关联 change 而被迫进入 `change-flow`。

跨 Skill 协作目前也不一致：OpenSpec contract guard 通过 Component contribution 解耦，task-verification 明确保持后置，但 task-worktree、task-board 和独立 current knowledge 维护仍依赖固定 Skill 名称或没有正式 operation。

## Goals / Non-Goals

**Goals:**

- 让 triage 只负责核对事实、作出正交决策并交给正确 provider。
- 让已成立事实的独立文档收敛不依附虚假 OpenSpec Change。
- 让复杂 code-only 任务可以拥有任务看板，同时保持 task 与 change 的事实边界。
- 用最小 capability contracts 表达只有在相关分支真正执行时才需要的稳定保证和结果证据。
- 保持外部 `openspec-*` Skills、验证 provider 和现有 Change lifecycle consumers 的升级边界。

**Non-Goals:**

- 不把 triage 变成确定性路由引擎、状态机或新的 Agent。
- 不让 Buildr 替 Agent 完成通用理解、推理、规划或专业实现。
- 不改变 OpenSpec CLI、Git integration、Task Finish 或 Candidate assurance 语义。
- 不迁移或重写既有 `task-cockpits/` 和 `task-boards/` HTML。

## Decisions

### 1. Triage 使用三个正交决策轴

语义治理轴为 `code-only | spec-maintenance | change-flow | blocked`；执行轴为 `implementation | metadata-only | unknown`；跟踪轴为 `none | create-board | continue-board`。统一输出同时包含 repository set、task environment、最小证据、未决冲突和下一 provider/action，OpenSpec 与看板状态仅在适用时追加。

这比继续增加独立输出章节更容易验证，也保留 Agent 根据具体任务调查事实的空间。不会建立 Buildr 内部自动分类器。

### 2. 当前事实维护新增 v2 `maintain`

新增 `buildr.current-knowledge-maintenance/v2`，在 v1 的 `assess | reconcile | inspect` 之外增加不依附 Change 的 `maintain`。`maintain` 只接受已确认当前事实，要求 Project、target assets、fact sources、授权范围和 tree identity；authority 冲突返回 `unresolved`，发现新语义则返回 `change-required`，不得直接写入。

默认 provider 同时提供 v1 和 v2。既有 OpenSpec consumers 保持 required v1；`task-triage` optional 依赖 v2，只在 `spec-maintenance` 当前事实分支使用。相比原地扩张 v1，这避免破坏既有 consumer obligations 和 Allowed Variations。

### 3. Task board 以 task identity 为主

任务看板的稳定 identity 是 Project + task id；`changes` 是 `0..N` 的真实关联。没有 change 时允许创建复杂 code-only 看板，但不得用 planned name 冒充 change；某个批次改变业务契约时必须先进入 change-flow，再补充真实关联。

模板允许空 `changes` 与空 `batch.changeIds`。既有包含 changes 的页面不迁移，继续按原结构读取。

### 4. 为任务看板建立最小 capability contract

新增 `buildr.task-board-maintenance/v1`，只定义 task/project identity、事实来源、创建或更新授权、稳定路径、结果状态和 changed path。默认 `task-board` provider 提供该能力；`task-triage` optional 依赖它。provider 不 ready 时只将 tracking 分支标记为 degraded/blocked，不影响语义与执行位置判断。

不为 `task-triage` 自身创建 capability：它是面向 Agent 的入口 Skill，没有另一个 consumer 依赖其确定性返回值。`task-verification` 也继续不作为 triage dependency，因为 triage 只规划验证节点，不执行 assurance。

### 5. Task worktree 使用既有 v2 contract

`task-triage` optional 依赖 `buildr.task-worktree-lifecycle/v2`，并在 `implementation` 分支读取 selected provider。provider 不 ready 时该执行分支 fail closed；metadata-only 和纯语义判断仍可继续。

### 6. 测试从固定篇幅转向行为契约

保留 package 静态检查，但减少对冗长固定短语的依赖；新增组合场景验证三个决策轴、repository set、独立 maintain、无 change 看板、provider readiness 和 OpenSpec contribution slot。package baseline、workspace 源与 runtime 投射继续要求一致。

## Risks / Trade-offs

- [新增 capability version 增加 manifest 维护面] → v1 consumers 不迁移，v2 只服务独立 maintain，并增加 binding/contract tests。
- [允许无 change 看板后产生没有规范锚点的页面] → task identity、事实来源和批次 evidence 成为必填；发生业务语义变化时必须进入 change-flow。
- [精简正文可能遗漏既有安全规则] → 先把要求写入 delta specs 和场景测试，再压缩 Skill；OpenSpec contribution slot 保持不变。
- [optional dependencies 可能被误解为可静默跳过] → Skill 对每个相关分支定义 fail-closed 或 degraded 输出，不把 provider readiness 当行为成功。
- [现有 literal static checks 阻碍重构] → 同步调整为结构/语义断言，不降低 package、Component 和 runtime 一致性检查。
