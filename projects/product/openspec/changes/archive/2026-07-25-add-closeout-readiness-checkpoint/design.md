## Context

`task-finish` 已经把 OpenSpec sync/archive、验证 evidence、Git 集成与 worktree cleanup 编排为受限的一次性授权，但没有把升级产生的运行时版本、生成资产完整性和 archive 残留聚合到 Candidate 前的同一停止点。本次 OpenSpec 1.6.0 升级因此在 archive 后才发现 Service-local CLI 仍旧、格式规范又使 Component receipt 失效、空 change 目录又被新 CLI 识别为 active。

## Goals / Non-Goals

**Goals:**

- 在候选验证开始前，以明确适用条件执行一个可报告、fail-closed 的 readiness checkpoint。
- 先收敛可在当前任务环境安全完成的 lockfile 依赖、格式与 Component 生成完整性，再冻结 Candidate。
- 保持全局外部工具、验证策略、Git 集成和 worktree lifecycle 的既有责任边界。
- archive 后将空 active-change scaffold 作为独立的 closeout workflow check，避免最终 strict validation 才发现遗留状态。

**Non-Goals:**

- 不新增 CLI 子命令、Capability contract、全局依赖安装权限或自动升级策略。
- 不把 Buildr Product 的 `npm ci`、Component 检查或 OpenSpec 版本固定为其他 Project 的通用命令。
- 不修改外部 `openspec-*` Skills。

## Decisions

### 1. 将 checkpoint 保留在 `task-finish` 的编排正文

该检查只服务“收尾”阶段，且不向独立 consumer 输出可复用的 provider result，因此由 `task-finish` 持有。替代方案是创建 `asset-upgrade-readiness` capability contract；这会要求定义 provider、binding 和跨 consumer 的稳定结果格式，当前没有第二个确定 consumer，属于过早抽象。

### 2. 以“相关资产信号”限定检查，而非每次收尾强制升级诊断

当任务触及受管 Component/Skill/Command、锁文件或外部命令声明，或 active OpenSpec change 声明升级时，checkpoint 才检查版本与生成完整性。普通业务任务继续只走既有 verification provider，避免把 Buildr Product 的工具链误投射为所有项目的收尾步骤。

### 3. 外部 CLI 与 checkout-local 依赖分离处理

全局 CLI 是用户环境资产：版本不匹配时停止并报告声明版本、实际版本与明确修复动作，绝不借“收尾”隐式安装或升级。checkout-local 依赖是当前任务环境：只有 Project 已以 lockfile 声明，且 `npm ci` 属于既有环境准备路径时才执行；否则同样停止并请求选择。

### 4. Candidate 前生成完整性先于验证

在 Candidate 前运行 `git diff --check`，并对相关 Component 执行既有完整性/receipt 检查。任何规范或生成修复必须在此时完成并复查，再把 tree 交给 selected verification provider。这样不把生成资产变化误标记为 archive-only delta。

### 5. archive 残留仅做已证明为空的最小清理

archive 后重新读取 OpenSpec active change 状态；若仅剩本次 change 的空 scaffold，逐层确认目录为空后删除，并重跑 strict validation。非空目录、其他 change 或状态不明一律停止，不以目录名猜测可删除范围。

## Risks / Trade-offs

- [“相关资产信号”判断不充分] → 在 Skill 中要求报告触发信号和跳过理由；不确定时按需运行诊断而非跳过。
- [不同 Project 没有 `npm ci`] → 只引用当前 Project 已声明的本地依赖准备入口，不硬编码 Buildr Product 命令。
- [archive 行为随 OpenSpec 版本变化] → 以当前 CLI 的 `status` 和 strict validation 作为事实来源，残留清理维持最小且可审计。

## Migration Plan

随 package 同步更新 `task-finish` 源和 delivery target，并以 contract tests 固定边界文字。已有 workspace 在后续 `buildr sync` 时获得新 Skill；不需要数据迁移或 capability rebind。若 checkpoint 产生误阻塞，可保留 task worktree 并按报告的具体层级完成环境修复后重试收尾。

## Open Questions

无。若未来 `update`、release 或多个 Skill 都需要同一结构化 readiness evidence，再单独评估提升为 capability contract。
