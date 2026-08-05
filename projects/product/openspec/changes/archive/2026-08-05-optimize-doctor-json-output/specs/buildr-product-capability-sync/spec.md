## ADDED Requirements

### Requirement: 内部最终 Doctor 使用有界紧凑结果
Buildr 的 `sync`、Component reconcile 和其他只需要最终健康门禁的内部 Doctor consumer MUST 显式请求 compact JSON、使用有限输出缓冲区，并 MUST 区分 Doctor 业务失败与子进程执行或捕获失败。

#### Scenario: 大型健康 Workspace 完成 sync
- **WHEN** Workspace 的 full Doctor JSON 超过 Node 子进程默认缓冲区，但 compact Doctor JSON 在内部上限内且 Doctor 通过
- **THEN** `buildr sync <agent>` MUST 报告最终 Doctor 通过
- **AND** sync MUST NOT 捕获或保留完整 Doctor inventory

#### Scenario: Doctor 业务失败
- **WHEN** 内部 Doctor 子进程正常执行并以非零状态返回有效 compact 诊断
- **THEN** consumer MUST 报告最终 Doctor 未通过并保留有界诊断
- **AND** consumer MUST NOT 将其描述为进程启动、捕获或输出超限错误

#### Scenario: Doctor 输出超过内部上限
- **WHEN** compact Doctor stdout 或 stderr 超过内部声明的有限缓冲区
- **THEN** consumer MUST 报告 Doctor 输出超过内部上限
- **AND** consumer MUST NOT 将该失败描述为 Doctor 业务未通过

#### Scenario: Doctor 子进程执行失败
- **WHEN** Doctor 子进程无法启动、被终止或发生非输出超限的执行错误
- **THEN** consumer MUST 报告子进程执行失败及可用的有界原因
- **AND** consumer MUST NOT 输出“最终 doctor 未通过”作为唯一根因
