## ADDED Requirements

### Requirement: Verification step 必须在直接子进程退出后有界收敛
Task verification provider MUST 将直接子进程退出与 stdio 完全关闭视为两个独立生命周期边界。直接子进程退出后，provider MUST 精确清理当前 step 拥有的 process group 与已观察后代，并 MUST 在有界 grace period 内等待 `close`；`close` 未到达时 MUST 以 failed 或 incomplete 终态返回，不得无限等待。

#### Scenario: 后代持有 stdio
- **WHEN** verification command 的直接子进程已经退出，但其 task-owned 后代仍持有 stdout 或 stderr 管道
- **THEN** provider MUST 终止当前 step 拥有的 process group 或已观察后代，并在有界时间内结束 step
- **AND** MUST NOT 清理其他 task、run 或未证明 ownership 的进程

#### Scenario: close 在 grace period 内到达
- **WHEN** 直接子进程退出后，owned cleanup 完成且 stdio 在 grace period 内正常关闭
- **THEN** provider MUST 使用真实 exit code、完整已收集输出和 process cleanup evidence 生成 step result
- **AND** MUST NOT 因 exit/close 事件竞态重复清理或重复 settle

#### Scenario: close 超时
- **WHEN** 直接子进程退出且 owned cleanup 后 `close` 仍未在 grace period 内到达
- **THEN** provider MUST 以 failed 或 incomplete result 结束 step，并记录 `process-close-timeout` 或等价稳定诊断、真实 duration 与 cleanup result
- **AND** 上层 verification execution MUST 继续生成非通过的统一 timing summary，而不是保留无 summary 的悬挂进程

### Requirement: Verification execution 必须为收敛失败生成可信 summary
当 verification step 因异常、process cleanup failure 或 exit-to-close timeout 进入非通过终态时，task verification provider MUST 让聚合执行结束并写出与当前 run、candidate 和已完成 checks 绑定的 `failed|incomplete` summary。Summary MUST 保留主失败、其他已完成检查、整体 wall-clock、process ownership 与恢复动作。

#### Scenario: 所有检查已写诊断但一个 step 未正常 close
- **WHEN** 各 capability 已产出诊断，而其中一个 step 因 close timeout 被判定为非通过
- **THEN** 聚合执行 MUST 返回并生成统一非通过 summary
- **AND** summary MUST NOT 把已完成检查相加冒充整体 wall-clock或把 cleanup warning取代主失败

#### Scenario: summary 被正式 consumer 使用
- **WHEN** Task Finish 或其他 consumer 读取该非通过 summary
- **THEN** summary MUST 提供稳定 schema、run/candidate identity、status、duration、失败项和 evidence reference
- **AND** consumer MUST NOT 将其作为 passed assurance 推进后续交付步骤
