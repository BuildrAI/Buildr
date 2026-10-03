---
name: git-operations
description: 执行已明确仓库、操作和目标的 Git 操作，核对授权、改动归属及结果；不代选策略。
---

# Git Operations

本 Skill 是 `buildr.git-operations/v1` 的默认 provider。它只帮助 Agent 安全执行 consumer 已经选定的一次 Git Operation；不讲解完整 Git 命令集，不选择交付目标或顺序，不拥有任务验证、任务结果或 workspace sync 状态。

任务工作树（Worktree）的跨库统一命名、创建和复用检查由[任务工作树技能（Task Worktree Skill）](../task-worktree/SKILL.md)承接，实际动作遵守当前有效能力绑定（Capability Binding）。本技能（Skill）核对已选操作（Operation）的真实代码库（Repository）、分支（Branch）及授权，不按名称推断任务关联或自动重命名已有对象。

能力名称使用复数 **Git Operations**；一次具体动作称为一个 **Git Operation**。

## 1. 先取得完整调用边界

写入前必须明确并核验：

- 实际 repository；
- 本次 operation；
- 相关 source/local ref，以及远端动作适用时的 remote 与 destination ref；
- 精确 owned paths/hunks 或已授权 commit scope；
- 获准改变 working tree、local history 和 remote 的具体 effects。

直接用户指令、`task-finish` 或其他上游智能体（Agent）/consumer可以提供这些输入。用户明确要求“收尾”时，`task-finish` 提供的当前任务范围内常规提交、集成和普通推送授权就是明确授权；本提供者（Provider）不得仅因用户未逐项重述 Git 操作而重复询问。智能体拥有交付策略、动作、目标和顺序。同一任务已明确的写入授权，在repository、operation、ref、scope与effects未变且未被撤回时继续适用；每次写入仍重验当前事实。其他任务或范围变化不能沿用旧授权，也不得自行补选repository、ref、remote或策略。任何输入与当前事实不一致时，在零Git写入状态返回`blocked`。

## 2. 保持 operation 单一

- `fetch`：只更新 consumer 明确提供的 remote/ref，不改变 working tree 或 local branch history。
- `rebase`：只把 consumer 明确提供的 clean local branch rebase 到已核验 target ref，不隐含 push、merge、stash 或其他 branch/remote 选择。
- `commit`：只创建或安全 amend local commit，不 push。
- `push`：只发布已有 commit，不把 dirty 自动 commit。
- `commit+push`：caller 依次执行一次 commit 和一次 push，保留两个独立 Result；不是原子 transaction。
- `delete-remote-ref`：只删除 consumer 明确提供的 remote/ref，并以 consumer 已观察的精确远端提交为删除条件，不动其他引用。
- workspace update：只有 Buildr Skill 等 consumer 已明确 workspace、upstream、update operation 与授权时才执行；dirty、divergence、冲突、缺失 upstream 或策略不唯一时 `blocked`，不自动 rebase、merge 或继续 sync。

直接 Git 收尾由智能体（Agent）选择已授权的动作，可在同一次工具调用内顺序执行。每项操作（Operation）分别核验并保留结果（Result），后一步消费已成功动作返回的真实身份；推送前新观察远端并核对完整范围。独立结果不要求独立的模型往返，批量编排不扩大授权。失败时停止相关后续动作，返回已成功部分与诊断；provider不自动stash，rebase冲突、目标歧义、已共享历史或需要force push时停止。Git Operations自身不写Task lifecycle evidence，任务登记交回原应用。

本版不预扩 checkout、reset、cherry-pick、stash、本地 branch deletion 等完整命令路由。rebase、merge、revert 或其他动作只有被 consumer 明确选为当前 operation 时才可能进入；不得作为发现分叉或失败后的自动替代策略。

默认硬边界是不自动 stash、reset、rebase、merge、force push、改写共享历史或切换策略。“收尾”也不授权 merge commit、远端任务引用创建或删除、丢弃内容或语义冲突取舍。

### Fetch 与显式 rebase

`fetch` 前核验实际 repository、remote identity 与目标 ref；成功后报告 remote-tracking ref 的 before/after identity，`treeChanged: false`、`historyChanged: false`，并把 ref 更新列入 effects。fetch 失败时保留已在其他 repository 发生的独立 Result，不把多仓库 caller 编排伪装为原子 transaction。

`rebase` 只有在 consumer 已明确选择 local branch、target ref、允许 local tree/history effect，并且 provider证明当前分支匹配、index/working tree clean、没有进行中的 Git operation、local-only commits 未 push 且未共享时才能执行。已对齐、仅落后与 clean 未共享分叉都返回真实 before/after 与 tree/history 变化；共享风险或 target drift 无法证明时在 rebase 前 `blocked`。

consumer 可以在选择 rebase 时同时明确授权冲突后的有界 `rebase --abort`。provider 只在 pre-state 已证明 clean 时执行；必须把 conflict、abort 命令效果和恢复核验写入同一 blocked Result。只有 branch、HEAD、index 与 working tree 都恢复到 pre-rebase facts 才能标记 recovered；abort 失败或恢复不可证明时保留现场。该动作不是静默 reset/回滚，也不授权换成 merge、stash、force push 或其他策略。

### 远端引用删除

`delete-remote-ref` 只有在 consumer 已明确选择该 operation 并提供实际 repository、remote、精确 ref、已观察远端提交（Commit）与允许的远端 effect 时才能执行。provider 在写远端前重新读取实际远端 tip，仍等于已观察提交才删除该引用，删除后回读远端确认不存在；tip 漂移、远端无法可靠观察或授权不完整时在远端零写入状态返回 `blocked`，不得改用无条件删除。返回错误或响应丢失时先核对实际远端状态再报告 effects。本 operation 不隐含对其他引用的任何动作，也不判断归属或业务保留理由——归属、保全与活动用途由 consumer 核验后作为授权输入提供。

## 3. 精确暂存与 commit

1. 分别检查 staged、unstaged 和 untracked facts，并识别 scope 外 dirty。
2. 只 stage consumer 已确认归属的精确 paths；同一文件混有不同归属时，只有 hunk 边界清晰且可复核才分段 stage，否则 `blocked`。
3. 禁止使用 `git add -A` 代替 scope 判断；保留全部无关 dirty 与 scope 外 staged 内容，不 unstage、不 stash、不 reset、不回滚或覆盖无关改动。若当前 Git 方式不能在不改变这些 index facts 的前提下生成精确 commit，则返回 `blocked`。
4. commit 前复核实际将提交的 diff，只包含授权内容；披露纳入/排除项和 commit message。

同一 Task 在两次 push 之间默认只维护一个尚未共享的可变 commit。只有能够证明当前 commit 未 push、未共享、归属相同 scope 且本次 commit operation 允许时才 amend；无法证明时创建新 commit或 `blocked`。push 或其他共享会冻结 commit；后续变化创建新 commit。撤销共享 commit 默认由 caller 明确选择新的 revert operation，不改写原历史。

## 4. Commit message

默认 subject 使用 `<type>(<scope>): <subject>`，scope 可选。type 从 `feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert` 中按实际内容选择；不猜测 scope。

正文只在需要说明动机、行为差异或破坏性影响时添加；破坏性变更使用 `BREAKING CHANGE:`。语言遵循当前 workspace `AGENTS.md` 以及 Project、Service、repository 的更具体规则，本 Skill 不复制默认语言约束，也不把 Core 作为提交语言的独立来源。

已明确关联正式任务（Task）时，核对其在当前工作空间（Workspace）中的实际任务编码，在提交说明（Commit Message）末尾的尾注（Trailer）区只写一行 `Buildr-Task: <taskId>`；保留实际改动的主题、必要正文和其他尾注。同一任务分多次提交时，每次使用同一任务编码。没有明确任务时省略该尾注，继续既有提交方式，不补建任务，不用分支名、目录名或最近任务猜测归属；归属尚未明确时只说明未建立关联。

```text
feat(task): 展示任务提交记录

在任务中读取提交说明和完整哈希值。

Buildr-Task: 2026-09-27-task-git-commits
```

提交成功后，从真实 Git 对象回读完整哈希值（Hash）及完整说明，例如 `git show -s --format='%H%n%B' <created-commit>`，核对实际尾注，而不是只看准备的消息或命令成功。对已有正式任务，再用当前可用入口执行 `buildr task commits <task-id> --target <canonical-workspace> --json`，目标指向任务所属主工作空间（Canonical Workspace），核对任务返回的代码库（Repository）身份、完整哈希值和说明是否与实际提交相同；两侧一致才报告双向关联已确认。结果的读取范围、截断和局部诊断决定尚未确认的部分，不能把未覆盖或不可读表述为没有提交。

实际提交成功与任务侧关联确认分别报告。查询不可用、失败或未覆盖本次提交时，保留 Git 成功事实并说明任务侧尚未确认，不改任务状态，不阻止无关的已授权交付。不得为了补任务编码安装强制钩子（Hook）、自动修改提交（Amend）、变基（Rebase）或改写既有历史；真实说明不符时报告差异，由原调用者依据实际目标与授权处理，不把关联检查变为通用提交门禁。

## 5. Push 必须检查完整 range

push 前重新观察实际 remote、source ref、destination ref 和 destination identity，并计算本次会新增到 destination 的完整 commit range，而不是只检查 tip commit。

逐个确认 range 中的 commit 都在 consumer 授权 scope。range 含 scope 外 unpublished commit、远端/ref 无法可靠观察、destination 漂移或目标不匹配时，在 remote 零写入状态返回 `blocked`。不得自动扩大授权、改推其他 ref、创建远端任务分支、rebase、merge 或 force push。

普通 push 被拒绝时停止；不自动 force push、不改写共享历史、不切换目标或策略。只有 caller/Agent 重新核验事实并取得所需决定后才能重试。

## 6. 最小 Result 与部分失败

每次 operation 只报告适用字段：

```text
repository: <actual repository>
operation: <actual operation>
status: succeeded | blocked
reason: <result or blocking reason>
before/after: <branch and commit identity>
remote/refs/range: <only when applicable>
treeChanged: <boolean>
historyChanged: <boolean>
remoteChanged: <boolean>
effects: <effects that actually happened>
currentFacts: <repository facts after success or failure>
```

不创建 Git Operations Receipt，不保存完整命令日志，不为不适用动作填充统一大 schema。

任何失败都必须保留并报告已经发生的 effects。尤其是 commit 成功而后续 push 被拒绝时，commit Result 仍是成功，push Result 是 `blocked`；local history 已改变、remote 未改变。明确授权且核验恢复 identity 的 `rebase --abort` 必须作为可见 effect 报告；除此之外不得静默 stash/reset/回滚、换策略，或把部分成功报告为零 effect。

## 7. Workspace tree transition

普通 fetch、commit、push 不改变已检出 tree，返回 `treeChanged: false`。当前已选 operation 若成功改变 checkout，返回 `treeChanged: true`；所在 Buildr workspace 的 consumer 随即遵守产品入口 Buildr Skill 的 workspace transition 约束。Git Operations 不复制 sync/Doctor 手册，也不判断 Review 或 Verification 是否仍有效。

## 8. 停止并交还决定

以下情况 fail closed：输入或授权不完整、ownership 无法分离、完整 push range 越界、remote/ref 漂移、push rejection、dirty/divergence/冲突需要选择策略、共享历史需要改写，或失败后的恢复方式不唯一。

Agent 负责解释语义、风险和可恢复选项；需要业务取舍、扩大授权、改写共享历史或重大风险时，把决定交给用户。只有同一 operation 的暂态问题在重新核验事实后才可直接重试。
