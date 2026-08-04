## ADDED Requirements

### Requirement: Task Record 必须支持最小 Parent Task 层级
Buildr MUST 允许 active Task 保存至多一个 canonical Workspace 内的直接 `parentTaskId`，并 MUST 从同一 Task authority 动态投影按 Task ID 排序的直接 `childTaskIds`。Parent/Child 关系 MUST NOT 复制 Task 正文、专业 Result 或整棵递归树。

#### Scenario: 创建带 Parent 的 Task
- **WHEN** 调用方创建 Task 并提供一个存在且 active 的 Parent Task ID
- **THEN** Application MUST 在同一 transaction 中创建 Task 与 Parent 关系
- **AND** Child read model MUST 返回该 `parentTaskId`，Parent read model MUST 返回该 Child ID

#### Scenario: 创建没有 Parent 的 Task
- **WHEN** 调用方创建普通独立 Task 且未提供 Parent Task
- **THEN** Task MUST 保存为 `parentTaskId: null`
- **AND** 该 Task 仍 MUST 能独立完成全部适用生命周期

#### Scenario: 修改或清除 Parent
- **WHEN** 调用方对 active Child Task 明确设置另一个 active Parent 或清除 Parent
- **THEN** Application MUST 原子更新关系并返回最新 Parent/Child read model
- **AND** MUST NOT 修改任一 Task 的 title、intent、scope、status 或专业记录

### Requirement: Parent Task 关系必须保持有效且无循环
Application MUST 在写入前验证 Parent 存在、处于 active、与 Child 位于同一 canonical Workspace，并 MUST 沿祖先链拒绝自引用和任意深度循环。关系验证失败 MUST rollback 整个 mutation。

#### Scenario: 拒绝自引用
- **WHEN** Task 尝试把自己的 Task ID 设置为 Parent
- **THEN** Application MUST 返回稳定的 self-reference diagnostic
- **AND** MUST NOT 写入任何关系或更新时间

#### Scenario: 拒绝祖先循环
- **WHEN** 设置 Parent 会使当前 Task 出现在候选 Parent 的祖先链中
- **THEN** Application MUST 返回稳定的 cycle diagnostic
- **AND** MUST 保留全部原关系不变

#### Scenario: Parent 不存在或已终态
- **WHEN** create/update 指向不存在、completed 或 abandoned 的 Parent Task
- **THEN** Application MUST fail closed 并返回可操作 diagnostic
- **AND** MUST NOT 自动创建、重开或修改 Parent Task

#### Scenario: 终态 Child 修改关系
- **WHEN** completed 或 abandoned Child 尝试设置或清除 Parent
- **THEN** Application MUST 按终态不可修改规则拒绝 mutation
- **AND** 既有 Parent/Child 关系 MUST 保持可读

### Requirement: Parent 与 Child 必须保持独立生命周期
Parent Task 与 Child Task MUST 各自拥有独立 status、result 与专业 lifecycle facts。任一 Task 的 complete、abandon、Verification、Finish 或 cleanup MUST NOT 自动修改另一方，也 MUST NOT 仅因所有 Child 进入终态就自动完成 Parent。

#### Scenario: Child 完成
- **WHEN** 某个 Child Task 被明确 complete
- **THEN** Parent Task status MUST 保持不变
- **AND** Parent read model MUST 继续投影该 Child 及其真实终态

#### Scenario: Parent 完成且仍有 active Child
- **WHEN** 调用方明确完成一个仍有 active Child 的 Parent Task
- **THEN** Application MUST 只完成 Parent Task
- **AND** MUST NOT 完成、放弃、清理或改写任何 Child Task

