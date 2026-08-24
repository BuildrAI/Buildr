## Context

Task Record 已把 `completed + noChange=true` 定义为正式终态，Task Terminal Delivery 也能识别 `completed-no-change`。Task Environment cleanup 目前只接受 Finish/reconciliation Delivery evidence 或 abandon，因此无代码协调 Task 即使合法完成也无法释放 Environment-owned worktree、分支与资源。

直接把 `noChange` 当成删除授权并不安全：Task Record 表达任务处置，不证明 checkout 在 Environment 建立后没有新增提交或 dirty 内容。安全修复必须由 Task Environment 决定资格，再由 Git provider 复核源码事实。

## Goals / Non-Goals

**Goals:**

- 让 completed no-change Task 通过唯一 Task Environment owner 幂等清理受控资源。
- 用 provider evidence 证明没有新增提交，并沿用现有 clean 检查拒绝 dirty 内容。
- 保持普通 completed delivery 与 abandon 的既有权限边界。
- 用完整 active → completed no-change → cleaned 回归和 Git 负向回归覆盖该状态转换。

**Non-Goals:**

- 不让 CLI 接收 caller-authored no-change proof 或任意 cleanup 路径。
- 不改变 Task Record terminal schema、Task Finish delivery 流程或 abandon 语义。
- 不允许 no-change cleanup 删除空提交、元数据提交或任何 Environment 建立后的新 HEAD。
- 不处理候选版发布事务本身。

## Decisions

1. **资格由 Task Environment Application 从 current Task Record 派生。** `deliveredCleanupAuthorization` 对精确的 `completed + noChange=true` 返回内部 `no-change` disposition。显式传入同名 authorization 不成立，避免 caller claim 绕过 current Task authority。替代方案是在 Task Finish 中生成空交付证明；这会迫使无代码协调 Task 伪造 Delivery，并扩大 Finish 对 cleanup 的依赖，因此不采用。

2. **删除安全性由 Git provider 复核。** no-change 模式要求当前 checkout clean，且当前 HEAD 精确等于 `buildr.git-worktree-evidence/v1` 中 Environment 建立时冻结的 HEAD。相等时 provider 以该冻结 HEAD 作为本次内部 containment target，复用既有 branch/worktree ownership 与 ancestry 检查；不接受外部 integrated ref。替代方案只比较 tree，会允许空提交或控制提交被静默删除，因此不采用。

3. **普通完成路径保持不变。** `noChange=false` 仍必须读取持久化 Finish/reconciliation evidence；abandon 仍可清理 Task-owned dirty 内容。no-change 模式不启用 `allowDirty`，也不接受 contribution equivalence。

4. **契约从公开参数和内部资格分离。** public `task environment cleanup` 不增加 flag；CLI 只触发 Application，no-change 资格只能从 current Task Record 派生。Capability contract 和随包 Skill 明确 provider 的 clean/HEAD proof。

## Risks / Trade-offs

- **[旧 Environment evidence 的 HEAD 与当前 checkout 不一致]** → fail closed 并保留现场，要求先交付或明确处置新增提交。
- **[Task 错误标记为 noChange]** → clean + HEAD equality 防止删除新增提交，但无法判断任务语义是否误报；Task terminal 决定仍由 Task owner 负责。
- **[checkout 已缺失但 branch 仍存在]** → 沿用 provider 对 branch HEAD 与 evidence 的漂移检查，只有精确匹配才清理 registration/branch evidence。
- **[新增内部 boolean 被 provider-level 调用滥用]** → public CLI 不暴露该字段；Task Environment 只在 persisted no-change authority 成立时传入，测试覆盖显式伪造 Application authorization 被拒绝的既有边界。
