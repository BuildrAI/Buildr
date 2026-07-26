## MODIFIED Requirements

### Requirement: 验证执行必须回收 task-owned descendant processes
Buildr Product verification runner MUST 为自身启动的 step 建立可识别 ownership，并在 step 完成或 runner 异常结束时清理仍存活的 owned descendants，包括运行期间已由 owned lineage 观察到、随后 detached 或 reparented 的 descendants。清理 MUST 限于该 runner 创建的进程组或运行期间由精确 parent-child lineage 建立的 ownership，不得按端口、进程名或宽泛 workspace 匹配终止其他任务进程。

#### Scenario: verification step 留下 server descendant
- **WHEN** Candidate 或 affected step 的主命令结束但其 owned server descendant 仍存活
- **THEN** runner MUST 终止该 owned descendant 并记录 cleanup status
- **AND** 最终 verification evidence MUST 报告是否存在 cleanup failure

#### Scenario: 其他任务存在同名进程
- **WHEN** 另一个 task environment 中存在同名 server 或使用相同默认端口的进程
- **THEN** 当前 runner MUST 保留该进程
- **AND** cleanup evidence MUST 只引用当前 runner 的 ownership identity

#### Scenario: descendant 在主命令结束前 detached
- **WHEN** runner 在 step 运行期间已观察到 descendant 属于 owned lineage，随后该进程脱离原 process group 或被重新托管
- **THEN** runner MUST 在 step 结束时仍核对并终止该存活 descendant
- **AND** cleanup evidence MUST 区分 process group 与 tracked descendant 的处理结果

#### Scenario: 未被 owned lineage 观察的同名进程
- **WHEN** 另一个任务存在同名进程，但它从未出现在当前 step 的 owned parent-child lineage 中
- **THEN** runner MUST 保留该进程
- **AND** MUST NOT 用名称、端口或 workspace 文本匹配补充 ownership
