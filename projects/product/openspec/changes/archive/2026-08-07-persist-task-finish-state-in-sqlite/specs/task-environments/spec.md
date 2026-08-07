## ADDED Requirements

### Requirement: Task Finish SQLite completion 必须与 Environment cleanup 幂等交接
Task Environment MUST继续独占Task级资源cleanup；Task Finish MUST在调用Environment cleanup前，将已交付scope identities、carrier/contribution proof与`cleanup_pending` checkpoint持久化到Workspace SQLite。Environment cleanup成功后，Finish MUST以Environment Receipt的current identity恢复并完成自身transient cleanup与terminal transaction，MUST NOT让Environment写Finish表或让Finish直接删除Environment-owned资源。

#### Scenario: cleanup 前进程退出
- **WHEN** Finish已经持久化`cleanup_pending`但尚未调用Environment provider
- **THEN** resume MUST复用同一delivery evidence并调用Task Environment cleanup
- **AND** MUST NOT重跑prepare、verify、deliver或重新push

#### Scenario: Environment cleanup blocked
- **WHEN** Environment因资源运行、identity漂移、ownership不明或其他Task占用而返回blocked
- **THEN** Finish MUST保留SQLite current run、精确Environment next action与恢复所需transient data
- **AND** terminal completion与Task Record completed MUST均不得成立

#### Scenario: Environment 已 cleaned 后进程退出
- **WHEN** Environment Receipt已证明同一Task/run cleanup成功，但Finish尚未清理自己的transient data或提交terminal Result
- **THEN** resume MUST复用Environment结果并只继续Finish-owned剩余动作
- **AND** Environment MUST NOT再次停止资源或调用provider cleanup

#### Scenario: Finish terminal transaction 完成
- **WHEN** Environment cleanup与Finish-owned transient cleanup均成功，且receipt/run identity匹配
- **THEN** Finish MUST提交compact completion并完成Task Record terminal transition
- **AND** Environment Receipt最小留痕 MUST继续存在，不得被Finish SQLite retention删除
