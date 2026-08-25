## ADDED Requirements

### Requirement: Browser dispatcher 与 cleanup 必须异步有界并保留阶段诊断
Buildr Web Browser dispatcher MUST使用异步owned-process runner执行web-dist验证与isolated Browser smoke，并 MUST记录`web-dist`、`fixture`、`browser`、`assertions`与`cleanup`阶段的开始、结束、耗时和失败。Browser、HTTP server与Preview cleanup MUST各自有bounded deadline，外层capability deadline MUST继续作为最终owned-process兜底。

#### Scenario: Browser affected selector成功
- **WHEN** web-dist、fixture、browser、assertions与cleanup均在各自边界内完成
- **THEN** Execution evidence MUST保存五个phase的passed与duration
- **AND**dispatcher MUST返回原selected/not-applicable语义和真实Browser结果

#### Scenario: Browser启动或断言卡住
- **WHEN** browser phase未在其deadline内完成
- **THEN** runner MUST取消后续assertion、回收owned browser/server descendants并记录timeout phase
- **AND** MUST不等待无timeout的同步子进程或丢失此前phase evidence

#### Scenario: Browser断言通过但cleanup失败
- **WHEN** assertions已passed但browser、HTTP server或Preview cleanup无法在deadline内证明完成
- **THEN** capability MUST失败并记录精确cleanup owner与remaining process evidence
- **AND** MUST不把断言通过提升为完整Browser capability passed

#### Scenario: 外部Buildr Web实例存在
- **WHEN** released、development或其他Task的Buildr Web实例正在运行且不属于本次lineage
- **THEN** Browser cleanup MUST保留这些实例
- **AND** MUST继续使用隔离Data Root与随机loopback端口完成本次验证
