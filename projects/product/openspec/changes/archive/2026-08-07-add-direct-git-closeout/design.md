## Context

当前 Buildr 已有两个相关能力：`task-finish` 消费正式 Task 的 current Development handoff，`git-operations` 执行 consumer 已明确选择的 Git Operation。问题发生在入口发现：Skill description 将“收尾”优先解释为 Task Finish，即使 Workspace 没有 active Task，也没有一个直接 Git 收尾的明确路由。

本 Change 只调整入口语义和 Skill/Spec 资产，不新增 Git Application、Task Record writer、Finish Receipt 或新的 capability major version。

## Goals / Non-Goals

**Goals:**

- 将“无 active Task 的收尾”路由到现有 `buildr.git-operations/v1` provider。
- 从当前 Workspace/Git 事实解析 repository、分支、remote、目标 ref 和 dirty scope；事实唯一时由 Agent 直接完成交付。
- 固化 `fetch/rebase → 精确 commit → push` 的顺序边界和冲突停止条件。
- 让 Formal Task Finish 继续只接受正式 Task、ready Environment 和 current handoff。

**Non-Goals:**

- 不把直接 Git 收尾包装成 Formal Task Finish。
- 不创建临时 Task、Environment、Verification、Candidate、Result 或 Git Operation Receipt。
- 不把 `git-operations` provider 变成通用 Git 命令目录，不默认执行 merge、force push、stash 或历史改写。
- 不改变已有 `buildr.git-operations/v1` 或 `buildr.task-finish/v1` 的 capability identity。

## Decisions

### 1. 由产品入口选择工作流，Git provider 只执行已选 Operation

Buildr runtime Skill 增加“无 active Task 的 Workspace 收尾”路由，负责读取 Task Record 状态、解析 Git 当前事实并决定顺序；`git-operations` 继续只负责每个已选 operation 的安全边界和 Result。这样不把产品入口路由伪装成 manifest dependency，也不扩大 provider 的职责。

备选方案是放宽 Task Finish 的 preflight，让它在没有 Task 时降级执行 Git；该方案会混淆两种 Result authority，也会让 Finish 的 Task/Environment cleanup 语义变得不确定，因此不采用。

### 2. 只在事实唯一时自动推进

入口可从当前 checkout 读取 repository、HEAD 分支、工作树/index、upstream 和 remote；目标 ref 只有在存在唯一 Workspace/Project 事实或用户已明确指定时才可采用。没有唯一目标时返回 blocked，不猜测 `origin/dev`、remote 或 push destination。

### 3. dirty 内容先精确 commit，再 rebase

入口先 fetch 唯一目标 ref；rebase 前若存在本次收尾的 dirty 内容，先交给 Git Operations 做精确 commit；存在无法分离的无关 dirty、scope 外 staged 或 untracked 内容时停止，不自动 stash。commit 与 rebase/push 的 Result 分开保存和报告。

### 4. rebase 只允许未共享历史，push 只走普通 push

入口可以明确选择 rebase 到当前目标 ref，但 provider 必须确认被改写的 commit 未共享。rebase 冲突、远端漂移、共享历史或需要 force push 时 fail closed，把恢复决定交给用户。

### 5. 直接交付的证据范围保持窄

直接路径只报告各 Git Operation 的 before/after identity、scope、range、effects 和部分失败；不生成或更新 Task/Development/Verification/Finish 状态。rebase 成功改变 checkout tree 后，按 Core workspace transition invariant 运行 Doctor。

## Risks / Trade-offs

- [入口意图歧义] “收尾”可能被误判为 Git 交付 → 仅在没有 active Task 且当前存在可交付 Git scope 时启用；事实不唯一则 blocked。
- [rebase 改写本地历史] 本地提交可能已经共享 → push 前核验完整 range，任何共享历史改写或 force push 均停止。
- [直接路径缺少正式验证证据] 结果不能代表 Formal Verification → 结果名称和用户报告明确标记为 Direct Git Delivery，不写入 Task lifecycle。
- [runtime 投射漂移] Source Skill 更新后旧对话可能仍持有旧 Skill → Product source 修改后执行 Codex workspace sync、package checks 和最终 Doctor；当前 session 重新发现规则按 runtime activation 事实报告。
