## MODIFIED Requirements

### Requirement: 双任务验收必须消费正式 Workspace 验证入口
Candidate 双任务组合验收 MUST 在普通临时 Buildr Workspace 中使用 checkout 或 installed CLI，以两个 canonical Task Environments 并发调用显式 capability 的 `verification run`，再分别通过 Task Verification Application record/inspect 各自 current Result；不得直接把 `test/verification` 内部 module 当作通用执行或 Result authority。

#### Scenario: 两个 task 并发验证普通 Project
- **WHEN** 验收在两个 Task Environments 中同时执行 claim 同一 coordinated resource 的 Project v2 command capability
- **THEN** 共享 resource MUST 排队且两个 transient summaries MUST 分别绑定自己的 Environment、target identity 与 declaration identity
- **AND** 两个 Task 的 portable Results MUST 位于各自 current slot、互不覆盖，并在匹配 target/declaration 时均为 current

#### Scenario: 一个 execution 中断
- **WHEN** 一个 worker 异常退出且未形成完整 Task 结论，另一个 worker 正常完成
- **THEN** 中断 Task 的已有 current Result MUST 保持不变，正常 Task MUST 可 record/inspect 新 Result
- **AND** transient cleanup 与 coordinated lease release MUST 精确按 run owner 完成
