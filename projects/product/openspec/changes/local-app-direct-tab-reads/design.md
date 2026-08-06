## Context

三个 Task 专业页签当前由 `inspectTaskDevelopmentView`、`inspectTaskReviewView` 和 `inspectTaskVerificationView` 统一调用 `inspectTaskTerminalDelivery`。聚合器会先读取 Task、Development、Review、Verification，再构造完整 terminal projection；这使普通 GET 触达不属于当前页签的专业节点，并重复读取已经由 Finish 写入 lifecycle read model 的交付关联。

本 Change 只处理 Local App 读取组合，不改变专业 Application、Finish writer、structured store 或公开 endpoint 路径。

## Goals / Non-Goals

**Goals:**

- 三个页签直接调用自身专业 Application read model。
- 各页签只附加读取共享 Task Record 与 lifecycle terminal association 所需的最小交付事实。
- 保持既有 response schema、字段和 active/terminal 状态语义。
- 用单页签调用计数和跨页签隔离测试证明不再进入完整聚合器。

**Non-Goals:**

- 不修改 `inspectTaskTerminalDelivery` 的公共兼容入口或删除该 Application。
- 不改变 Task Record、Development、Review、Verification、Finish 的 writer authority。
- 不改变 structured store 的 canonical/候选 Workspace 边界，不引入缓存、第二 read model 或新数据库表。
- 不重新计算 Review/Verification 与 handoff 的交付关联；只读取已写 snapshot。

## Decisions

### 1. 在三个 view 内分别组装最小 terminal section

保留三个 endpoint 的既有专业正文来源，新增一个只读取 Task 状态和 lifecycle terminal snapshot 的窄 helper。Development view 继续展示 Development read model，Review view 继续展示 Review slots，Verification view 继续展示 Verification slot；terminal section 由同一最小 helper 按当前 Task 状态派生，但不读取其他专业正文。

替代方案是让三个 view 继续调用聚合器并通过缓存消除重复读取。该方案仍保留错误的 authority 依赖，且无法证明每个页签的读取边界，因此不采用。

### 2. 保存 delivered 快照，不回到当前 handoff 匹配

completed Task 的交付状态、delivery metadata、snapshot 和 associations 直接消费 lifecycle read model 中 Finish 已保存的事实。缺失 association 保持 `completed-unproven`，active、abandoned、no-change 继续按 Task Record 事实返回。

### 3. 通过响应兼容测试约束迁移

三个 view 继续返回当前专业 operation result，并在外层保留 `terminal` 字段。测试同时断言已有字段不变、专业 reader 只被当前页签调用，以及 terminal association reader 不触达其他专业 Application。

## Risks / Trade-offs

- [三个 view 的 terminal 字段可能出现轻微实现分叉] → 使用共享窄 helper，只允许传入当前页签专业结果，不允许 helper 读取其他专业 reader。
- [旧 Task 缺失 lifecycle snapshot] → 保持现有 `completed-unproven`/unavailable 诊断，不在 GET 中回填或重新证明。
- [隐藏测试依赖聚合器调用] → 保留 `inspectTaskTerminalDelivery` 作为兼容 Application，仅移除三个 Local App Tab view 对它的调用。

## Migration Plan

1. 扩展 terminal delivery Application，提供只读最小 section helper。
2. 改造三个 Local App Tab view 使用自身专业 reader 与 helper。
3. 增加 unit/integration/system 回归与调用次数测试。
4. OpenSpec strict validation、changed verification 通过后再形成 Candidate；无需数据迁移或回填。

## Open Questions

无。
