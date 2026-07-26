## ADDED Requirements

### Requirement: Task Finish 必须事务式推进 OpenSpec convergence
Task Finish MUST 将 delta compatibility scan、隔离 archive rehearsal、pre-sync guard、agent-driven canonical sync 与 post-sync guard 作为同一 identity-bound convergence sequence。真实 sync 只能消费当前 delta、canonical facts 与 OpenSpec identity 对应的成功 pre-sync receipt；canonical 已改变后 MUST NOT 通过刷新 baseline 或重跑 pre-sync 重建事后授权。

#### Scenario: delta 存在多个不兼容问题
- **WHEN** 多个 MODIFIED Requirement 遗漏、重命名或破坏既有 Scenario identity
- **THEN** convergence helper MUST 在真实 canonical sync 前聚合报告全部可检测问题
- **AND** MUST NOT 每次只返回第一个问题后要求重复 rehearsal

#### Scenario: canonical 在 pre-sync 后漂移
- **WHEN** pre-sync receipt 之后 canonical facts、delta digest 或 OpenSpec executable identity 改变
- **THEN** Task Finish MUST 将 receipt 标记 stale 并返回 pre-sync 边界
- **AND** MUST NOT 执行或继续 post-sync/archive

#### Scenario: post-sync 失败
- **WHEN** canonical sync 后 post-sync guard 失败
- **THEN** Task Finish MUST 保留 change、canonical diff 和失败 evidence
- **AND** MUST 要求恢复到可证明的 pre-sync facts 或修正当前 sync，而不是直接采用 post-sync canonical 作为新 baseline

### Requirement: 验证执行必须回收 task-owned descendant processes
Buildr Product verification runner MUST 为自身启动的 step 建立可识别 ownership，并在 step 完成或 runner 异常结束时清理仍存活的 owned descendants。清理 MUST 限于该 runner 创建的进程组或等价 ownership，不得按端口、进程名或宽泛 workspace 匹配终止其他任务进程。

#### Scenario: verification step 留下 server descendant
- **WHEN** Candidate 或 affected step 的主命令结束但其 owned server descendant 仍存活
- **THEN** runner MUST 终止该 owned descendant 并记录 cleanup status
- **AND** 最终 verification evidence MUST 报告是否存在 cleanup failure

#### Scenario: 其他任务存在同名进程
- **WHEN** 另一个 task environment 中存在同名 server 或使用相同默认端口的进程
- **THEN** 当前 runner MUST 保留该进程
- **AND** cleanup evidence MUST 只引用当前 runner 的 ownership identity
