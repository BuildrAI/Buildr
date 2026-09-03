## ADDED Requirements

### Requirement: Task Verification current 必须使用调用方摘要原子替换
Task Verification `record` MUST接收调用方最近一次 `inspect` 观察到的摘要：空槽位使用 `absent`，已有报告使用 `reportDigest`。该摘要 MUST仅作为调用参数，不进入 Verification Report 业务事实。Repository MUST在同一 `BEGIN IMMEDIATE` 事务中读取和验证 current、计算摘要、比较 expected、匹配后替换、写后回读并提交；任何失败 MUST保持原 current。

#### Scenario: 首次记录空槽位
- **WHEN** 调用方 inspect 得到空槽位并以 `absent` 记录合法报告
- **THEN** Repository MUST原子创建 current 并返回新 `reportDigest`
- **AND** 持久化报告 MUST不包含 expected 摘要字段

#### Scenario: 两个调用方并发替换
- **WHEN** 两个调用方基于同一 current `reportDigest` 依次提交不同报告
- **THEN** 第一个匹配写入 MUST成功，第二个 MUST返回 `task_verification_current_conflict` 和最新摘要
- **AND** 第二个调用方 MUST不覆盖第一个 current，也不得由 Application 自动重试

#### Scenario: 写入链失败
- **WHEN** serialization、SQL mutation、写后回读或 commit 任一失败
- **THEN** Repository MUST回滚事务并保留原 current
- **AND** diagnostic MUST指出失败阶段且不得误报写入成功

#### Scenario: 调用方处理冲突
- **WHEN** Agent 收到 Verification current conflict
- **THEN** Agent MUST重新 inspect 真实报告和当前内容后决定重做或替换
- **AND** MUST不创建 revision、history、lease、Plan、Run 或 Execution Record
