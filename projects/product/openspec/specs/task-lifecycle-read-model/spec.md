# task-lifecycle-read-model Specification

## Purpose

定义正式 Task 生命周期动作写入、更新和查询可展示 current 状态的统一 read model 边界。

## Requirements

### Requirement: Task lifecycle current read model 必须由生命周期动作维护
Buildr MUST 在 Workspace SQLite 中为每个正式 Task 保存一个 current lifecycle read model。Task Record、Task Environment、Task Development、Task Review、Task Verification 和 Task Finish 的成功生命周期动作 MUST 在专业事实写入成功后更新其对应摘要、状态、identity/digest、observedAt 和最小诊断。

#### Scenario: Development 动作完成
- **WHEN** Task Development 的 begin、planning、observe、policy、gate、freeze、decide 或 handoff action 成功写入 Receipt
- **THEN** lifecycle current read model MUST 同步保存该 Receipt digest、最新 applicability、gate/decision 摘要与 observedAt
- **AND** MUST NOT 把完整专业 Result、命令输出或历史事件复制进 projection

#### Scenario: 专业动作失败
- **WHEN** lifecycle action 在校验或专业事实写入阶段失败
- **THEN** MUST NOT 用失败输入覆盖已有 lifecycle current read model
- **AND** MUST 返回可诊断失败结果，允许用户从同一生命周期动作重试

### Requirement: lifecycle read model 必须保留跨专业读取所需的终态摘要
Lifecycle current read model MUST 保存 Task status、Environment 状态摘要、Development applicability、两个 Review slot、Verification slot 和 Finish terminal summary；各专业完整 Receipt/Result 仍 MUST 由其原 Application 和 SQLite current source 提供。

#### Scenario: Finish 成功完成
- **WHEN** Task Finish 已确认 delivery、remote readback、retained Doctor 与 Environment cleanup，并完成 Task Record
- **THEN** projection MUST 保存 delivered 状态、handoff/candidate identity、final remote ref、target branch、cleanup 和完成时间
- **AND** MUST 允许 Terminal Delivery Application 不读取 Finish Result 文件即可构造终态摘要

#### Scenario: Task 明确 noChange 完成
- **WHEN** Task Record 以 `noChange: true` 完成
- **THEN** projection MUST 保存 completed 与 no-change 终态
- **AND** MUST NOT要求或伪造 Finish Result

### Requirement: lifecycle read model 读取必须是纯 SQLite 查询
Application inspect 和 Local App GET MUST 只读取 Task Record、专业 current records 与 lifecycle current read model。它们 MUST NOT 在读取过程中执行 Git observation、Content Target 扫描、verification declaration 解析、Environment probe、Finish Result 目录扫描或 projection 回填。

#### Scenario: Local App 读取研发和证据
- **WHEN** 用户打开 Task 的研发或证据页签并请求对应 GET endpoint
- **THEN** API MUST 从已保存 SQLite read model 返回最近一次生命周期确认的状态与专业 current facts
- **AND** 同一请求 MUST NOT 触发 Git、文件、Environment 或 Finish filesystem observation

#### Scenario: snapshot 尚未形成
- **WHEN** Task 有专业 current record 但没有 lifecycle current snapshot
- **THEN** inspect MUST 返回稳定的 unknown/unavailable 诊断和已有可读专业事实
- **AND** MUST NOT 为了补齐 snapshot 修改数据库或扫描外部来源

### Requirement: lifecycle snapshot 必须明确观察时间和陈旧边界
Lifecycle read model MUST 为每个非空专业 section 保存 `observedAt` 和 `source`，并 MUST 将其解释为最后一次正式 lifecycle action 确认的快照。外部 Git、文件或 Environment 在两次动作之间变化时，系统 MUST 等待下一次对应 lifecycle action 更新状态。

#### Scenario: 外部内容在读取前变化
- **WHEN** Content Target 或 verification declaration 在最近一次 Development/Verification action 后发生变化
- **THEN** Local App MUST 继续展示最后一次已保存快照并标明确认时间
- **AND** MUST NOT 在 GET 请求中将其重新计算为 stale 或 current

### Requirement: 生命周期 read model 必须保存 terminal association snapshot
Task lifecycle current read model MUST 支持保存和读取 terminal association snapshot，并保持它与专业 Development、Review、Verification current record 分离。snapshot 缺失时 reader MUST 返回稳定缺失语义，MUST NOT 在 GET 中执行 mutation 或 live observation。

#### Scenario: 读取保存的 terminal association
- **WHEN** Local App 或其他 reader 请求已完成 Task 的终态交付投影
- **THEN** Application MUST 从 lifecycle current read model 读取 terminal association snapshot
- **AND** MUST NOT 为该请求调用 Git、Environment、Finish scan 或专业 gate recomposition

#### Scenario: Finish 写入冻结关联
- **WHEN** Task Finish 已以 current handoff 完成 durable delivery
- **THEN** lifecycle current read model MUST 保存该 handoff、Candidate 与三个 gate 在交付时采用的最小 identity/digest 关联
- **AND** MUST NOT 复制专业 Result 正文或重新拥有其 authority

#### Scenario: 无可证明历史关联
- **WHEN** 已完成的历史 Task 没有 terminal association snapshot
- **THEN** reader MUST 返回明确的 unproven 或 unavailable 诊断
- **AND** MUST NOT 扫描 Finish 目录、Git、Environment 或旧文件来回填关联

#### Scenario: 关联投影失败
- **WHEN** durable completion 后无法写入或校验 terminal association projection
- **THEN** Finish MUST 返回可诊断的 blocked 或 failed 结果
- **AND** MUST NOT 将该次运行报告为完整成功交付
