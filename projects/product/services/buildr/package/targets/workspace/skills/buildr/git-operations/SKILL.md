---
name: git-operations
description: 用户或上游 consumer 已明确选择 repository、Git Operation 与相关 ref，或 Workspace 没有 active Task 且用户要求“收尾”完成当前 Git 交付时使用；需要执行 commit、push、commit+push、rebase 或检查该动作的授权、安全边界和结果 evidence；不用于选择操作、编排 Task Finish 或扩展完整 Git 命令集。
---

# Git Operations

本 Skill 是 `buildr.git-operations/v1` 的默认 provider。它只帮助 Agent 安全执行 consumer 已经选定的一次 Git Operation；不讲解完整 Git 命令集，不选择交付目标或顺序，不拥有 Task Development、Candidate、Verification、Task Finish 或 workspace sync 状态。

能力名称使用复数 **Git Operations**；一次具体动作称为一个 **Git Operation**。

## 1. 先取得完整调用边界

写入前必须明确并核验：

- 实际 repository；
- 本次 operation；
- 相关 source/local ref，以及远端动作适用时的 remote 与 destination ref；
- 精确 owned paths/hunks 或已授权 commit scope；
- 获准改变 working tree、local history 和 remote 的具体 effects。

直接用户指令可以提供这些输入；无 active Task 的“收尾”由 Buildr 产品入口从当前 Workspace/Git facts 解析并选择直接交付顺序；Task Finish、其他产品入口继续决定各自动作、目标与顺序。不得沿用历史轮次的写入授权，也不得自行补选 repository、ref、remote 或策略。任何输入与当前事实不一致时，在零 Git 写入状态返回 `blocked`。

## 2. 保持 operation 单一

- `commit`：只创建或安全 amend local commit，不 push。
- `push`：只发布已有 commit，不把 dirty 自动 commit。
- `commit+push`：caller 依次执行一次 commit 和一次 push，保留两个独立 Result；不是原子 transaction。
- workspace update：只有 Buildr Skill 等 consumer 已明确 workspace、upstream、update operation 与授权时才执行；dirty、divergence、冲突、缺失 upstream 或策略不唯一时 `blocked`，不自动 rebase、merge 或继续 sync。

无 active Task 的直接 Git 收尾是产品入口选择的复合意图，不是 provider 自行推断的 operation。默认顺序为读取当前事实、fetch 唯一目标 ref、必要时先精确 commit dirty scope、rebase 当前分支到目标 ref、普通 push 并回读远端；每一步都保持独立 Result。provider 不自动 stash；rebase 冲突、目标歧义、已共享历史或需要 force push 时停止。rebase 成功改变已检出 Buildr Workspace tree 后，consumer 触发当前 Agent Doctor；该路径不创建或修改任何 Task lifecycle evidence。

本版不预扩 checkout、reset、cherry-pick、stash、branch deletion 等完整命令路由。rebase、merge、revert 或其他动作只有被 consumer 明确选为当前 operation 时才可能进入；不得作为发现分叉或失败后的自动替代策略。

默认硬边界是不自动 stash、reset、rebase、merge、force push、改写共享历史或切换策略。

## 3. 精确暂存与 commit

1. 分别检查 staged、unstaged 和 untracked facts，并识别 scope 外 dirty。
2. 只 stage consumer 已确认归属的精确 paths；同一文件混有不同归属时，只有 hunk 边界清晰且可复核才分段 stage，否则 `blocked`。
3. 禁止使用 `git add -A` 代替 scope 判断；保留全部无关 dirty 与 scope 外 staged 内容，不 unstage、不 stash、不 reset、不回滚或覆盖无关改动。若当前 Git 方式不能在不改变这些 index facts 的前提下生成精确 commit，则返回 `blocked`。
4. commit 前复核实际将提交的 diff，只包含授权内容；披露纳入/排除项和 commit message。

同一 Task 在两次 push 之间默认只维护一个尚未共享的可变 commit。只有能够证明当前 commit 未 push、未共享、归属相同 scope 且本次 commit operation 允许时才 amend；无法证明时创建新 commit或 `blocked`。push 或其他共享会冻结 commit；后续变化创建新 commit。撤销共享 commit 默认由 caller 明确选择新的 revert operation，不改写原历史。

## 4. Commit message

默认 subject 使用 `<type>(<scope>): <subject>`，scope 可选。type 从 `feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert` 中按实际内容选择；不猜测 scope。

正文只在需要说明动机、行为差异或破坏性影响时添加；破坏性变更使用 `BREAKING CHANGE:`。语言遵循 Buildr Core 和当前 Project、Service、repository 的更具体规则，本 Skill 不复制默认语言约束。

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

任何失败都必须保留并报告已经发生的 effects。尤其是 commit 成功而后续 push 被拒绝时，commit Result 仍是成功，push Result 是 `blocked`；local history 已改变、remote 未改变。不得静默 stash/reset/回滚、换策略，或把部分成功报告为零 effect。

## 7. Workspace tree transition

普通 commit、push 不改变已检出 tree，返回 `treeChanged: false`。当前已选 operation 若成功改变 checkout，返回 `treeChanged: true`；consumer 随即遵守 required Core workspace-transition invariant，对所在 Buildr workspace 运行对应 Agent 的 Doctor。Git Operations 不复制 sync/Doctor 手册，也不判断 Review 或 Verification 是否仍有效。

## 8. 停止并交还决定

以下情况 fail closed：输入或授权不完整、ownership 无法分离、完整 push range 越界、remote/ref 漂移、push rejection、dirty/divergence/冲突需要选择策略、共享历史需要改写，或失败后的恢复方式不唯一。

Agent 负责解释语义、风险和可恢复选项；需要业务取舍、扩大授权、改写共享历史或重大风险时，把决定交给用户。只有同一 operation 的暂态问题在重新核验事实后才可直接重试。
