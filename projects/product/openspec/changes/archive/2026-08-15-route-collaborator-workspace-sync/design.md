## Context

Git Operations 已用 `treeChanged` 表达 checkout 是否变化，required Core 已要求 tree 变化后运行当前 Agent Doctor，Buildr Skill 也拥有用户确认后的 workspace sync 动作。self-bootstrap activation 则只消费当前会话中匹配的 Formal Finish Result。缺口不在底层命令，而在这些事实之间缺少明确、可测试的排他路由，导致协作者更新可能被错误关联到本地 Task/Finish。

## Goals / Non-Goals

**Goals:**

- 用现有 Git、Doctor、Task Finish authority 确定性区分 Workspace update 与 self-bootstrap activation。
- 让协作者更新后的 runtime projection stale 走现有 Buildr workspace sync，并保留用户授权边界。
- 通过 builtin Skill 源、capability description 与契约测试保持路由一致。

**Non-Goals:**

- 不新增自动监听远端提交、后台同步器或持久队列。
- 不根据 commit author、提交信息或本地是否存在同名 Task 推断代码所有权。
- 不改变 `buildr sync`、Doctor、Task Finish Result 或 self-bootstrap runner 的产品 authority。
- 不让 workspace sync 自动更新 npm CLI、创建 Task、生成 Finish Result 或执行 self-bootstrap。

## Decisions

### 1. 使用排他事实分类，不新增第二个状态机

Agent 将 Git provider 返回的 tree transition、当前 Doctor findings 和可选的 matching Formal Finish Result 组合为一次会话内路由判断。没有匹配 Finish Result 时，即使提交来自协作者且本地没有 Task，也只能归类为普通 Workspace update；不得启动 self-bootstrap。

备选方案是新增 CLI classifier 或持久化“协作者提交”记录，但这会复制 Git、Doctor 和 Finish authority，并且 commit author 不能证明工作流 ownership，因此不采用。

### 2. task-triage 负责创建前 tree transition，Buildr Skill 负责 sync

新 Task 创建前的 `fetch → rebase` 仍由 task-triage 选择 Git Operations。若 rebase 使 canonical tree 前进，task-triage 必须先运行 Doctor；当 actionable findings 仅指向当前 Agent 的 managed workspace/runtime projection stale 时，它把动作交给 Buildr Skill。用户对“更新/同步 workspace”的明确请求已授权 sync；其他场景仍按现有契约询问一次。

这样不把 Git mutation 或 sync authority塞入 Task Record、Task Environment 或 self-bootstrap。

### 3. self-bootstrap 入口显式拒绝无匹配 Finish 的 Workspace update

workspace-owned `buildr-self-bootstrap-sync` 的 description、输入边界和失败说明会明确：它只适用于当前会话中匹配的 Formal Finish Result/run；协作者更新、本地没有任务或只有 Git/Doctor evidence 时为 `not-applicable`，并返回普通 Workspace update 路由提示，不把 absence 当异常。

### 4. 契约测试覆盖路由矩阵

静态契约测试同时核对 canonical delta、Buildr runtime Skill、task-triage source 和 self-bootstrap source，覆盖：

- collaborator tree transition + no matching Finish → workspace update；
- Doctor 仅报告 managed projection stale → Buildr sync；
- matching Finish Result → self-bootstrap 保持适用；
- 非 sync Doctor blocker → 不执行 sync；
- workspace sync 不创建或伪造 Task/Finish authority。

## Risks / Trade-offs

- [风险] Skill 文本仍依赖 Agent 正确消费 evidence。→ 通过排他条件、统一术语和契约测试减少歧义；不引入更危险的自动状态机。
- [风险] Doctor 同时报告多类 blocker 时错误执行 sync。→ 仅在 findings 明确指向 managed projection stale 时选择 sync，其他情况按原 lifecycle 停止或请求授权。
- [风险] 用户说“同步 workspace”与普通 post-transition 确认重复。→ 明确该意图已包含 Git update 与 sync 授权，不重复询问。

## Migration Plan

更新 canonical spec、builtin Skill 源与测试；通过 Buildr package sync 在正式 Finish 后投射 workspace/runtime 资产。旧 CLI 与数据无需迁移，回滚只需还原 Skill/spec 文本和对应测试。

## Open Questions

无。
