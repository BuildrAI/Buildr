## ADDED Requirements

### Requirement: Task Finish 必须冻结并核验 Workspace Node identity
Task Finish MUST 在 preflight 读取 Workspace Node identity，在 candidate freeze 中保存该 identity，并在 verify、deliver、resume 与 evidence reuse 前重新核验。Finish 的 CLI、npm、验证和子进程 MUST 使用该 identity 对应的受管 runtime。

#### Scenario: Finish 复用匹配证据
- **WHEN** frozen candidate、assurance、policy 与 Node identity 均匹配已通过 evidence
- **THEN** Finish MAY 复用 evidence 且 MUST 在结果中披露 Node identity

#### Scenario: Candidate 与 Finish Node 不一致
- **WHEN** Candidate evidence 的 Node identity 与 Finish preflight/freeze identity 不同或 evidence 缺失该字段
- **THEN** Finish MUST 停止复用旧 evidence
- **AND** MUST 返回要求 `sync` 和重新验证的稳定 failure/next workflow

#### Scenario: Finish 运行中 Node identity 漂移
- **WHEN** 声明或受管 runtime identity 在 freeze、verify、deliver 或 resume 之间改变
- **THEN** Finish MUST fail closed 且不得继续 push、cleanup 或复用之前阶段
