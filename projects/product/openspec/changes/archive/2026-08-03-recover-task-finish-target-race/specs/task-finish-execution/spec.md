## MODIFIED Requirements

### Requirement: Deliver 必须只交付冻结候选
`deliver` MUST 在短 target lease/fencing 边界内重新核对 expected target ref，只允许 frozen candidate 的 fast-forward 或内容等价 transition、普通 push、retained Workspace convergence 与受影响入口安装。Force push、merge commit、远端任务分支 push/delete、丢弃改动和语义冲突 resolution MUST 保持未授权。

#### Scenario: 目标 ref 未漂移
- **WHEN** observed target ref 等于 freeze record 的 expected target ref
- **THEN** deliver MUST 完成明确 ref transition、普通 push 与 retained convergence
- **AND** result MUST 记录 before/candidate/after remote ref

#### Scenario: 目标 ref 外部前进
- **WHEN** push 前 observed target ref 不再等于 expected target ref
- **THEN** deliver MUST 返回 resumable `target-race` 并释放 lease
- **AND** MUST NOT 在当前 delivery attempt 重跑 verify、force push 或自行解决内容冲突
- **AND** 后续持有匹配 resume token 的恢复 MUST 遵循 Resume requirement，不得直接复用旧 freeze record 交付

#### Scenario: Retained 入口受影响
- **WHEN** frozen candidate 改变 runtime、默认 CLI 或 Local App 的正式影响路径
- **THEN** deliver MUST 使用 receipt-bound retained root、CLI 与 Node identity 执行相应 doctor/sync/install
- **AND** 未受影响入口 MUST 记录 not-applicable reason 而不执行安装

### Requirement: Resume 必须由产品根据真实状态生成
Task Finish MUST 根据 current run、freeze record、command observations、target ref 与 retained/cleanup 真实状态生成最早可恢复边界和 `resumeToken`。调用方 MUST NOT 提供 recovery manifest、step fingerprint、execution plan 或 claimed outcome。除 qualified `task-finish.target-race` 外，只有 candidate 未变的 transient target、retained 或 cleanup 阻塞可以在同一 run 恢复；qualified target-race MUST 由产品重新准备候选并重新建立候选匹配的 verification evidence。

#### Scenario: 目标 ref 前进后的候选恢复
- **WHEN** run 在 `deliver` 因 `task-finish.target-race` blocked，且调用方提供当前产品生成的匹配 resume token
- **THEN** 产品 MUST 保留已通过的 `preflight`，并使 `prepare`、`verify`、`deliver` 与 `cleanup` 的候选依赖状态及输出失效
- **AND** MUST 清空旧 frozen candidate、verification、delivery 与 completion 输出，从 `prepare` 重新 rebase/freeze 当前目标上的候选，再对该候选执行或取得 current verification Result 后才继续 deliver
- **AND** MUST NOT 接受调用方提供的新 target、candidate identity、step outcome 或 recovery manifest

#### Scenario: 暂态条件解除
- **WHEN** run 因 target lease、retained install 或 cleanup 暂态失败而 blocked，且再次观察证明 candidate 未变、条件已解除
- **THEN** 重复 canonical run 或匹配 resume token MUST 从最早 blocked phase 继续
- **AND** 已通过的 prepare/verify MUST 保持复用

#### Scenario: 恢复状态无法证明
- **WHEN** 请求的恢复既不是 qualified `task-finish.target-race`，也无法证明同一 frozen candidate 与允许 transition
- **THEN** 产品 MUST fail closed 并生成具体 diagnostic
- **AND** MUST NOT 要求 Agent 猜测或手写 recovery JSON
