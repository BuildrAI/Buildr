## ADDED Requirements

### Requirement: 正式 command execution 必须有界收敛 owned process
Formal Verification command runner MUST按Plan execution unit的deadline启动独立owned process group，跟踪运行期间确认的descendants，并在正常结束、timeout、取消或异常退出后有界收敛stdio与owned processes。runner MUST只终止本次run精确拥有的process group和observed lineage，不得按端口、进程名或Workspace文本清理其他进程。

#### Scenario: command在deadline内完成
- **WHEN** command及其owned descendants在deadline内完成并关闭stdio
- **THEN** check MUST记录真实exit、duration与`processCleanup: clean`
- **AND** Execution Record MUST按既有passed/failed规则terminal seal

#### Scenario: command达到deadline
- **WHEN** command在Plan deadline到达时仍未terminal
- **THEN** runner MUST执行TERM、grace、KILL与退出确认并记录check status `timed-out`
- **AND** overall execution MUST为failed且primary failure明确为capability timeout，不得伪装cancelled或普通exit failure

#### Scenario: execution被显式取消
- **WHEN** runner收到可捕获取消且能够收敛owned processes
- **THEN** runner MUST复用同一终止协议并记录check与execution为cancelled
- **AND** MUST保存已有partial facts并terminal seal，不得自动retry

#### Scenario: owned cleanup失败
- **WHEN** TERM/KILL后仍有已确认owned process存活或exit无法证明
- **THEN** check与overall execution MUST返回failed并记录cleanup failure与剩余owned identity
- **AND** Execution Record lifecycle MAY仅在terminal body、transient cleanup或record维护仍需恢复时另行标记attention
- **AND** MUST不把command assertion通过报告为完整passed

#### Scenario: 其他Task存在同名或同端口进程
- **WHEN** 机器上存在未进入本run process group或observed lineage的同名进程
- **THEN** runner MUST保留该进程
- **AND** diagnostics MUST只引用本run的ownership evidence
