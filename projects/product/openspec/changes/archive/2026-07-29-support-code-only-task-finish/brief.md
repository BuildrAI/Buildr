# 无 Change 候选 Task Finish

## 一句话摘要

让 code-only task environment 使用统一 Task Finish，并让 retained metadata-only 任务在产品执行器不适用时安全交接到精确 Git 单项操作。

## 背景与问题

Buildr 已允许 code-only 实现不创建 OpenSpec Change，也允许纯元内容任务直接在 retained canonical Workspace 完成；但 Task Finish 同时强制 environment receipt 与 active Change。结果是两类合法候选在用户要求“收尾”时都被阻塞，而完整收尾意图又不会由 `git-ops` 接管，只能退回人工 Git 组合。

## 目标与非目标

目标是在不伪造 Change、不移动用户无关改动的前提下补齐统一收尾路径：code-only environment 复用固定五阶段产品执行器；retained metadata-only 候选通过 Task Finish 的正式 handoff 精确提交和推送任务文件。非目标是不让 dirty retained Workspace 直接进入产品执行器，不增加 caller-authored recovery/evidence 协议，也不改变验证保证和 Node identity 规则。

## 受影响用户与角色

- 完成已有契约实现、规则、Skills、文档或模板后要求“收尾”的 Agent 与维护者。
- 依赖 Task Finish 自动候选冻结、验证、目标集成和 task environment cleanup 的 code-only 开发任务。
- 在 retained Workspace 同时保留多个未提交工作项的使用者。

## 核心流程

receipt-bound task environment 的首次 run 从 receipt 取得 task identity；提供 `--change` 时进入 Change 候选，省略时进入 code-only 候选。两类候选共用 Node、Git、验证、交付和 cleanup，code-only 对 OpenSpec 专属动作记录 `not-applicable`。如果 `worktree context` 证明当前位置不是 task environment，Task Finish 只在 metadata-only、任务 paths、验证和目标 ref 都可证明时，把 commit/push 交给 selected Git 单项 provider；否则正式停止。

## 关键变化

- Task Finish run identity 增加 `candidateKind: change|code-only`，Change 可空但 task/Project/environment/Node 不可空。
- Preflight/prepare 对 code-only 条件跳过 Change/OpenSpec 检查与 convergence。
- CLI help 把 `--change` 表述为 Change 候选的条件必需参数。
- Task Finish Skill 与 contract 增加 retained metadata-only handoff、精确文件隔离和 optional Git provider dependency。

## 影响、风险与兼容性

现有带 Change 调用保持兼容。code-only run 创建的新 completion receipt 会包含 nullable Change，消费者应依据 candidate kind 判断。Metadata-only handoff 不产生五阶段 completion receipt，这是避免自动 stash 或污染正式验证候选的安全取舍；它必须返回逐项 Git evidence 并保留全部无关 dirty changes。

## 验收摘要

- code-only task environment 不传 `--change` 即可完成五阶段收尾，且不执行 OpenSpec 命令。
- Change Task Finish 的 convergence、验证、交付和 cleanup 行为不退化。
- retained metadata-only 任务可正式交接 commit/push，任务外改动不被 stage、stash、回滚或提交。
- 无法证明任务 paths、验证 identity、目标 ref 或 Git provider readiness 时关闭式失败。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specs](specs/)
- [Implementation tasks](tasks.md)
