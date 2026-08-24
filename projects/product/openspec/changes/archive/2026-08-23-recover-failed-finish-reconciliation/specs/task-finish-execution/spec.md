## ADDED Requirements

### Requirement: 显式 Delivery reconciliation 必须能安全收敛被旧失败 run 占用的 current Handoff

当 `task finish reconcile` 观察到 current Finish run 绑定旧 Development Handoff 时，产品 MUST 保持普通 `run` 对已有 carrier 的自动 supersede 禁令，并 MUST 只在显式 reconciliation 已从真实远端证明 current Handoff 的全部 repository Task Contribution 被包含、旧 run 终止于 delivery 前且没有 lease、delivery、retained、prepared completion、cleanup或后续phase事实、repository set未变化、以及全部旧 carrier ownership与cleanup均可证明时，以current Handoff形成新的terminal reconciliation。产品 MUST 不把旧 carrier、旧 Candidate 或旧人工 adaptation 作为 current Handoff 的 Delivery 证明；MUST 保留旧 run 的既有 Execution Record并在新terminal结果中记录有界superseded关联。

#### Scenario: 当前Handoff已交付且旧run只遗留可清理carrier

- **WHEN** 旧run绑定Handoff A并在prepare阶段terminal failed，verify、deliver与cleanup从未开始，旧run没有resume、lease、delivery、retained或completion事实，且拥有Buildr可证明ownership的隔离carrier
- **AND** current Handoff B使用相同repository set，且真实远端完整包含B的全部Task Contribution
- **THEN** 显式`task finish reconcile` MUST先完成全部远端包含证明，再清理A的run-owned carrier，并以独立reconciliation run登记B的terminal Delivery与Task completion
- **AND** 结果 MUST保留A的Execution Record并报告superseded run与carrier cleanup摘要

#### Scenario: 当前Handoff的任一repository尚未被远端包含

- **WHEN** 旧失败run绑定Handoff A且current Handoff为B，但B的任一repository Task Contribution无法由真实远端证明contained
- **THEN** reconciliation MUST返回`unproven`且MUST NOT清理A的carrier、覆盖current row或登记任何B的Delivery checkpoint

#### Scenario: 旧run已拥有delivery或下游恢复事实

- **WHEN** 旧run存在lease、delivery、retained、prepared completion、cleanup、resume或任何已开始的verify、deliver、cleanup phase事实
- **THEN** reconciliation MUST返回类型化current-run identity conflict
- **AND** MUST NOT清理、终结或换绑旧run

#### Scenario: 旧carrier ownership或cleanup无法证明

- **WHEN** current Handoff的全部远端包含已证明，但旧run任一carrier的registered worktree、expected root或cleanup结果无法证明
- **THEN** reconciliation MUST保持旧current run且不得登记current Handoff的terminal Delivery
- **AND** MUST报告已经发生的逐repository cleanup effects，使后续重试可幂等确认已删除carrier并继续处理剩余项

#### Scenario: 普通run遇到拥有carrier的旧Handoff

- **WHEN** 调用方启动普通`task finish run`且current run绑定旧Handoff并拥有carrier
- **THEN** 产品 MUST继续返回`task_finish.current_run_identity_conflict`
- **AND** MUST NOT使用本Requirement的reconciliation恢复规则自动supersede旧run
