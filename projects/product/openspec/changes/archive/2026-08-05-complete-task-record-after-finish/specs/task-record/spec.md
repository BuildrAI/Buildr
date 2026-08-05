## ADDED Requirements

### Requirement: Formal Finish 正常完成必须复用 Task Record Application
Task Record Application MUST 提供一个仅供 Formal Task Finish 正常完成路径调用的内部终态动作。该动作 MUST 保持 Task Record Application 为顶层状态唯一 writer，在单个数据库事务中把 active Task 写为 `completed` 与 `result.noChange=false`；MUST 对既有 `completed/noChange=false` 返回零写入的幂等成功；MUST 拒绝覆盖 `completed/noChange=true`、`abandoned` 或损坏记录。该动作 MUST NOT 暴露为新的公共 CLI，也 MUST NOT触发 Finish、Environment cleanup、Parent/Child 状态传播或其他专业动作。

#### Scenario: Finish 通过唯一 Application 完成 active Task
- **WHEN** Task Finish 在完整 cleanup 后提交 active Task 的正常交付终态
- **THEN** Task Record Application MUST 原子写入 `status: completed`、确定性 summary 与 `noChange: false`
- **AND** result MUST 返回当前 record、recordDigest 与精确 mutation effects

#### Scenario: 等价终态零写入
- **WHEN** 同一 Finish 恢复提交一个已经 `completed/noChange=false` 的 Task
- **THEN** Task Record Application MUST 返回当前终态与零 mutation effects
- **AND** MUST NOT 改写 summary、updatedAt 或 Parent/Child 关系

#### Scenario: 冲突终态不可覆盖
- **WHEN** Finish 提交目标 Task 已经 `completed/noChange=true` 或 `abandoned`
- **THEN** Task Record Application MUST 返回类型化冲突且 effects 为空
- **AND** 原 Task Record MUST 保持不变

