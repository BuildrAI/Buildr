## MODIFIED Requirements

### Requirement: Verification Execution 必须保持 transient
`buildr verification run` MUST 针对显式 Project、target identity 与 capability identities 执行 Project v2 中已有的 command invocation，并 MUST 把完整命令输出、真实 wall-clock、资源等待、执行上下文、Workspace Node、target stability 和诊断写入 `buildr.verification-execution/v1` transient summary。Runner MUST NOT 写 current Result。`verification run` MUST 只接受 execution contract 定义的参数；`--declaration-root` MUST 只由 `task verification inspect|record` 接收，误用时 MUST 在启动任何 capability 前返回说明正确 action 的 syntax diagnostic。

#### Scenario: 显式命令能力执行完成
- **WHEN** 调用方选择一个或多个有效 command capabilities
- **THEN** runner MUST 有界执行并返回每项真实 passed/failed 事实与完整 transient output
- **AND** caller MUST 在形成完整 Task 结论后另行通过 Application record

#### Scenario: declaration-root 误用于 execution
- **WHEN** 调用方把 `--declaration-root` 传给 `buildr verification run`
- **THEN** runner MUST 在启动 capability 前返回 `verification run` 参数错误
- **AND** diagnostic MUST 指向 `task verification inspect|record` 作为该参数的合法 action
- **AND** runner MUST NOT 启动测试、写 current Result 或产生 capability side effect

#### Scenario: target 在执行期间发生内容漂移
- **WHEN** capability checks 已完成但 execution root 的 tracked diff、status 或 untracked content fingerprint 与执行前不同
- **THEN** transient summary MUST 返回 `target.stable=false` 并将整体 status 设为 `failed`
- **AND** summary MUST 提供相对于 target root 的有限变化分类或路径摘要，以区分 target drift 与 capability assertion failure
- **AND** summary MUST NOT 把 Candidate dirty status 单独解释为 drift，也 MUST NOT 将本机绝对路径写入 current Result

#### Scenario: 选择 Agent invocation
- **WHEN** `verification run` 收到 `invocation.kind: agent` 的 capability
- **THEN** runner MUST 在启动任何命令前拒绝
- **AND** Skill MAY 按 bounded instructions 执行并最终通过同一 record Application 提炼事实
