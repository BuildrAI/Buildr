## Why

真实任务收尾（Task Finish）在已完成 `post-sync` 后发生合法的实现变化时，会使旧收敛凭证（Convergence Receipt）与新增量规范不一致。当前产品只能返回 `receipt stale` 并停止，没有产品持有的恢复动作，导致安全门禁虽然阻止了错误归档，却无法继续完成正常收尾。

## What Changes

- 为 `implementation-changed` 后的 OpenSpec 收敛提供产品持有、身份绑定且可重复执行的恢复流程。
- 使用旧收敛凭证和契约基线中可证明的 `pre-sync` 事实恢复，不采用已经写入变更结果的 `post-sync` canonical 作为新基线。
- 让动作注册表（Action Registry）把可预期的凭证过期分类为可执行恢复、语义处理或明确不可恢复结论，不再留下没有下一动作的普通阻塞。
- 增加真实端到端流程测试（End-to-End Journey Test），覆盖首次收敛、实现变化、类型化恢复、再次收敛、正式验证和归档完成。
- 不改变 OpenSpec Requirement 合并语义、正式验证级别、Git 授权或冲突解决责任；不包含其他任务收尾性能优化。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 补充收敛凭证过期后的产品恢复动作、阻塞分类和端到端完成保证。
- `agent-task-workflows`: 补充 `post-sync` 后实现变化时恢复到可证明 `pre-sync` 事实并重新完成收敛的工作流契约。

## Impact

- Task Finish 动作注册表、恢复状态机和收敛步骤证据。
- Buildr OpenSpec convergence application service、收敛凭证和契约基线消费。
- Task Finish 与 OpenSpec 的集成测试、端到端流程测试和受影响验证选择。
- Task Finish Skill、CLI/current knowledge 以及持续优化任务看板。
