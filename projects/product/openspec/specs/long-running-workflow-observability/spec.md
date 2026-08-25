# long-running-workflow-observability Specification

## Purpose

定义跨 self-bootstrap、Verification、release transaction 与 bounded list 的紧凑终端摘要、展示截断和 durable readback 语义。

## Requirements

### Requirement: 长流程必须默认返回有界紧凑终端摘要
Buildr MUST 为长时间运行且可能产生大型 evidence 的操作提供 closed `buildr.long-running-operation-summary/v1` 默认投影。摘要 MUST 包含 operation、`detail: compact`、terminal 布尔值、`running|passed|blocked|failed|cancelled|unknown|not-applicable` 状态、可用的 Task/run/result identity、有界关键阶段、可空 primary failure、cleanup、output boundary 与至多一个 recovery pointer；MUST NOT包含完整 operations、effects、diagnostics、stdout/stderr、正文、本机路径、raw argv、secret、lease 或 resume token。

#### Scenario: 长流程成功且完整结果很大
- **WHEN** owner 已持久化 terminal success，但 canonical full Result 超过 compact 输出上限
- **THEN** 默认 stdout MUST 返回低于固定上限的合法 compact summary并保持 `terminal: true` 与真实 result identity
- **AND** summary MUST指向同一 owner 的 inspect，而不是内联或截断完整 Result

#### Scenario: 流程仍在运行
- **WHEN** durable authority 仍为 open/running 且没有可验证 terminal evidence
- **THEN** inspect summary MUST返回 `terminal: false` 与 `status: running`
- **AND** MUST不因客户端超时、断连或等待结束而推断 failed、启动 retry或创建替代 run

#### Scenario: 终态失败与展示截断正交
- **WHEN** owner 已保存 terminal failure 且 detail/body 发生安全截断
- **THEN** summary MUST分别表达真实 failure 与 `output.truncated: true`
- **AND** MUST不把仅展示截断改写为 execution failure，也不因 execution failure省略 primary failure

### Requirement: 长流程恢复必须先回读同一 durable authority
每个 compact summary 的 recovery pointer MUST 结构化标识 owner、inspect/resume operation及其所需的 portable Task/run/record identity。Agent consumer MUST先使用该 pointer 回读；只有 owner 明确返回可重试或用户授权新执行时，才能启动独立 run。

#### Scenario: stdout 丢失后恢复
- **WHEN** producer 可能已完成但调用方没有收到完整 stdout
- **THEN** consumer MUST通过同一 durable authority inspect 当前 run/record
- **AND** matching terminal result MUST直接复用，matching running result MUST继续等待或检查，MUST NOT默认重跑

#### Scenario: 没有安全恢复入口
- **WHEN** producer 在形成 portable identity 或 durable authority 前失败
- **THEN** compact error MUST返回 terminal blocked/failed与 null recovery pointer
- **AND** MUST不伪造 result identity、success或可恢复状态
