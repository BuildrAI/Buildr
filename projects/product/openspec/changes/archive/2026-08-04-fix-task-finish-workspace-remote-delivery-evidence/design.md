## Context

Task Finish 的 product adapter 把 `Environment.repositories[*].remote` 直接写入 immutable run identity。Project 为 `source.type: workspace` 时，Environment 合法地只描述根 checkout，`remote` 可能为空；executor 随即退化为本地 branch observation/fast-forward，却仍把 carrier ref 填入 `remoteAfterRef`。现有规范已经要求普通 push 和 before/carrier/after remote ref，本 Change 修复实现与证据的偏差。

## Goals / Non-Goals

**Goals:**

- 在创建 product Finish run 时绑定一个真实、已配置且可解释的 delivery remote。
- 让 `remoteAfterRef` 只来自 push 后的远端回读，而不是本地推断。
- 让远端缺失、歧义、回读失败或回读不一致 fail closed，并保持已有可恢复边界。
- 用真实 bare remote 覆盖 workspace-source 回归场景。

**Non-Goals:**

- 不扩展五阶段执行器、run schema、Candidate、Verification 或 Git provider authority。
- 不增加 remote 选择交互、持久配置、force push、merge commit 或远端任务分支。
- 不顺带重构 Task Finish、Task Environment 或通用 Git abstraction。

## Decisions

### 1. Product run 在创建时解析并冻结 delivery remote

解析顺序为：显式 `--remote`、Environment repository remote、retained target branch 的 upstream remote、retained repository 唯一配置的 remote。每个候选都必须通过 retained checkout 的 Git 配置验证；显式值无效、没有候选或多个候选无法消歧时直接返回 `task_finish.remote_unavailable`，不创建 run，也不执行 carrier/delivery mutation。

选择在 run 创建时冻结 remote，是因为它属于 delivery target identity；若在 `deliver` 阶段临时猜测或修改 run，会让恢复过程使用不同目标。未声明 `origin` 默认值，避免把命名惯例冒充 authority。

### 2. Push 后进行独立远端回读

`deliver` 继续先用 `ls-remote` 取得 before ref、检查 target race、fast-forward retained branch 并执行普通 push。push 返回成功后再次调用 `ls-remote`：只有实际 after ref 等于 carrier ref，才能继续 retained convergence、写入 `remoteAfterRef` 并形成 `delivered`。

回读命令失败属于可恢复外部条件；同一 run 可在 carrier/handoff 未变时重试 deliver。回读成功但 ref 不等于 carrier 表示目标已发生竞争，终止当前 run 并返回 Task Development。两种失败都不得生成远端完成证据或进入 cleanup。

### 3. 保留现有 compact result 字段

`observedTargetRef` 继续表达 push 前真实远端 ref，`carrierRef` 表达本次交付 ref，`remoteAfterRef` 表达 push 后真实回读值。无需新 schema 或第二份 receipt；只修正字段的事实来源和成立条件。

## Risks / Trade-offs

- [retained branch 没有 upstream 且存在多个 remotes] → 阻止自动收尾，要求调用方显式给出 `--remote`；不猜测。
- [push 已成功但首次回读遇到网络故障] → run 暂时 blocked；恢复时先观察远端，已交付则不重复 push，只补齐回读和后续动作。
- [push 后远端被其他写入立即推进] → 作为 target race 返回 Task Development，避免把旧 Candidate 宣告为当前远端结果。
- [低层测试允许 `remote: null`] → product CLI path 强制解析真实 remote；不为内部 run fixture 扩大 breaking schema 迁移。
