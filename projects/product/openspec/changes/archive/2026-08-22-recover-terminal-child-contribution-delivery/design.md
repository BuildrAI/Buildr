## Context

Parent Coordination 当前只把 terminal Finish completion association 指向的 immutable Development handoff 内原生 Contribution Handoff 视为交付证明。这一正常路径保护了“completed 不等于 delivered”，但两个已经进入 canonical dev 的 HTTP contract Child 暴露了恢复盲区：

- Task Professional Child 在完成前没有建立 planned Contribution binding；
- Workspace / Agent Assets Child 已建立 binding，但最终 handoff 没有附带 Contribution Handoff；
- 两个 Child 都有 archived Change、passed Verification、ready Completion Review、proceed decision、immutable handoff、terminal Finish association 和 canonical delivery；
- Task Record 与 Development 的普通 writer 都只接受 active Task，因此终态后无法补齐协调证据。

恢复能力必须承认已有正式证据，同时不能把 Task status、Git 或调用方声明升级为交付 authority。

## Goals / Non-Goals

**Goals:**

- 为严格限定的 completed Child 提供一次性、append-only Contribution delivery reconciliation。
- 复用既有 Parent Plan、Contribution Handoff Domain、Development handoff 和 Finish association 校验。
- 保持旧 handoff、Task Record、Finish terminal payload 与 Development Receipt immutable。
- 让 Parent Coordination 在固定查询预算内消费原生或恢复 evidence，并明确返回 proof kind。
- 保持正常 active Child 的 bind、handoff、Finish 行为不变。

**Non-Goals:**

- 不重新开放 completed / abandoned Task。
- 不允许从 Git、文件、canonical specs、Change checklist 或 Task title 自动推断 Contribution。
- 不为缺少 terminal Finish、Candidate、gates 或 immutable handoff 的 Task补造交付。
- 不建立通用 lifecycle event、progress、history 或 audit framework。
- 不修改 Parent Plan 内容、依赖或 final acceptance。

## Decisions

### 1. 使用独立的 append-only reconciliation evidence

新增按 Child Task 唯一的 terminal contribution reconciliation persistence。记录保存 schema、identity、Child/Parent/Parent Plan identity、既有 handoff/Finish association identity、完整 Contribution Handoff、reason、source 与 createdAt。

选择独立 evidence，而不是改写 Development Receipt 或 Finish terminal JSON，原因是：

- 既有 handoff identity 已被 Finish association 冻结，增加 Contribution Handoff 会产生新 identity，不能冒充原交付快照；
- 改写 terminal Finish 会破坏交付证据的历史稳定性；
- 单独 evidence 可以 append-only、可审计且可幂等重放。

该 persistence 只保存异常恢复的专业证据，不保存 Parent progress、Child status history 或物化 disposition。

### 2. Writer 仍属于 Task Development

恢复动作由 Task Development Application 校验并写入；Parent Coordination CLI 只提供受控入口和返回组合后的 read model。这样 Contribution Handoff Domain、Development handoff 与 Finish carrier 校验仍由既有专业 owner 持有，Parent Coordination 不取得第二套业务判断。

公开入口采用：

buildr task parent reconcile-child-delivery CHILD --parent PARENT --expected-plan PLAN --input FILE --reason TEXT --source TEXT

input 只承载完整 Contribution Handoff；expected Parent Plan identity、reason 与 source 是独立必填参数，避免文件内容掩盖并发保护和授权来源。

### 3. 恢复前置条件全部关闭式验证

Application 必须同时证明：

1. Parent active，且具有与 expected identity 一致的 current Parent Plan；
2. Child completed、非 no-change，且 Task Record 的直接 Parent 等于请求 Parent；
3. Child 有 Development Receipt 和 terminal Finish completion；
4. Finish association 精确匹配一个既有 immutable handoff 的 handoff、Candidate generation 与三个 gate；
5. 该 handoff 没有原生 Contribution Handoff；
6. handoff 中全部 Change disposition 已 converged，Task-scoped Change read model 当前仍能证明 archived；
7. 请求 Contribution Handoff 全部引用 current Parent Plan；
8. 若 Child 已有 planned binding，请求 planned 必须精确匹配；若历史 binding 为空，则请求 planned 作为显式恢复映射；
9. planned / delivered ownership 不与其他 Child 的原生或恢复 evidence 冲突。

任一条件不成立时零写入。相同 identity 重放返回 unchanged；同一 Child 已有不同 reconciliation 时返回 conflict。

### 4. Parent read model 同等消费两种证明，但不隐藏来源

Parent Coordination repository 在原有固定两条业务查询基础上联表读取 reconciliation evidence，不逐 Child 调用 Application。Application 优先使用原生 matching Contribution Handoff；仅当原生缺失时使用合法 reconciliation。

Child delivery 摘要增加 proof：

- native-handoff：来自交付时 immutable handoff；
- terminal-reconciliation：来自严格恢复 evidence，并返回 reconciliation identity。

两种 proof 都可派生 delivered / residual / superseded；没有任一证明时继续返回 unproven / unassigned。

### 5. 保持 capability v2，做 additive contract 同步

现有消费者不需要改变 normal flow；新增动作是可选恢复分支。同步 buildr.task-development/v2 contract、Task Development Skill、Buildr 入口 Skill 和 contract tests，明确恢复不修改 Receipt/handoff，且不能成为 normal Child 的替代步骤。

## Risks / Trade-offs

- [Risk] Agent 把恢复入口当作常规省略 binding/handoff 的捷径 → 只允许 completed + terminal Finish + missing native Contribution Handoff，Skill 明确 normal flow 必须原样完成。
- [Risk] 调用方错误映射 Contribution 语义 → 要求 current Plan、显式完整 handoff、reason/source、ownership conflict 检查，并禁止自动推断。
- [Risk] 新 evidence table 被误用为 progress store → schema 只允许每 Child 一条 immutable recovery fact；Parent disposition仍动态派生。
- [Risk] Parent Plan 后续 reconcile 导致历史 evidence 语义漂移 → evidence绑定创建时 Plan identity；read model只在 Contribution references仍属于 current Plan时消费，否则返回 diagnostic。

## Migration Plan

1. 增加 SQLite migration、Domain value、repository 与 writer。
2. 增加 Application/CLI/read model 和契约测试。
3. 同步 contract、Skill、架构文档与 current knowledge。
4. 交付并激活 retained Buildr 后，对两个已知 P1 Child 分别执行显式恢复。
5. Parent inspect 证明两个 Contribution 为 delivered 后，启动 P2。

回滚时可以停止暴露写入口并忽略 reconciliation table；旧 handoff、Finish、Task 与 Parent Plan 未被修改，normal flow 不受影响。已经写入的 evidence 保留供审计，不做破坏性删除。

## Open Questions

无。
