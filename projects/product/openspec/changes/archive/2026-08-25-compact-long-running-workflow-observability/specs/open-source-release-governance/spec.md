## ADDED Requirements

### Requirement: Release transaction runner 与 evidence inspect 必须默认返回 compact summary
Release transaction readiness/dispatch 与 hosted evidence inspect MUST缺省返回 `buildr.long-running-operation-summary/v1`。完整 release context、Candidate、publish、tag、npm/GitHub Release与Registry evidence MUST继续由显式 output、hosted evidence artifact或 `--detail full`持有；compact MUST只表达 operation、run/evidence identity、关键步骤、primary failure、artifact/readback状态与唯一 inspect pointer。

#### Scenario: protected transaction成功
- **WHEN** 唯一 hosted publish run已完成且正式 evidence artifact通过readback校验
- **THEN** 默认 dispatch/inspect stdout MUST返回 terminal passed compact summary、publish run与evidence identity
- **AND** MUST不内联完整 context、Task correlation、Candidate或逐步 evidence

#### Scenario: publish仍在运行或调用方等待超时
- **WHEN** GitHub run仍为queued/in_progress或本机等待结束但没有terminal evidence
- **THEN** summary MUST返回 `terminal: false`、`status: running`与同一 publish run inspect pointer
- **AND** MUST不重新dispatch workflow或伪造failed evidence

#### Scenario:正式 evidence失败或超大
- **WHEN** hosted evidence保存terminal failure且完整artifact超过stdout边界
- **THEN** compact inspect MUST返回 terminal failure、primary failed step、recovery class与 `output.truncated`事实
- **AND** explicit full MUST从同一run artifact校验后返回完整 portable evidence
