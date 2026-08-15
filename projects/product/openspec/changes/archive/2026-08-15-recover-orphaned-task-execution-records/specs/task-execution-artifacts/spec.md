## ADDED Requirements

### Requirement: Verification open Execution Record 必须支持受控恢复
Task Execution Record Application MUST 只为 registered Verification producer 的 open record 提供受控 recover。存在 provider-owned terminal summary 时，Application MUST 校验 Task/record/run/invocation/target identity、summary boundary、完成事实与推导 outcome，并在同一原 record 上复用既有 body publish、redaction、quota 与 compare-and-set seal；MUST NOT重跑 capability、创建替代 record或采用 Verification Result。

#### Scenario: Agent 用完整终态证据补 seal
- **WHEN** Agent 为 matching open Verification record 提供合法 transient summary，且全部 identity、checks、finished time 与 outcome 一致
- **THEN** Application MUST以已证明 outcome seal 原 record并清理精确 provider-owned transient
- **AND** MUST不再次执行 capability或创建新 execution identity

#### Scenario: 终态证据不完整或错配
- **WHEN** summary 缺失、越出 owned boundary、schema 无效、identity 错配、没有完成事实或 outcome 不能由 checks 与 target stability 推导
- **THEN** Application MUST返回 blocked 或 authorization-required 且保持原 record 为 open
- **AND** MUST不发布 body、改变 quota、启动 Verification 或清理输入路径

#### Scenario: 并发 producer 已完成 seal
- **WHEN** recover 的 CAS mutation 前原 producer已把同一 record seal 为相同终态
- **THEN** recover MUST幂等返回既有 terminal record
- **AND** 不同 outcome 或不同 current facts MUST fail closed且不得覆盖

### Requirement: 不可证明的 Verification 执行必须以显式授权接受 unknown
当 open Verification record 没有可验证 terminal summary 时，Application MUST要求明确的 `unknown outcome` 授权才能终结原 record。授权后的 record MUST保存 `outcome: unknown`、`lifecycleStatus: retained`、`resolutionStatus: acknowledged` 与受控 recovery body；MUST不把未知结果表示为 passed、failed、blocked或cancelled。

#### Scenario: Agent 无法证明终态且没有用户授权
- **WHEN** Agent 请求恢复 open record但没有合法 summary，也没有显式 unknown outcome 授权
- **THEN** Application MUST返回 authorization-required、精确 effects 与建议用户决定的问题
- **AND** record、body、quota 与 duplicate matching MUST保持不变

#### Scenario: 用户授权接受未知结果
- **WHEN** Agent 携带明确 unknown outcome 授权恢复 matching open Verification record
- **THEN** Application MUST用固定 recovery evidence 终结原 record并返回 attention
- **AND** 该操作 MUST不接收自由文本结论、任意文件、path、outcome 或 cleanup shell

#### Scenario: 未知终态不阻塞新 invocation
- **WHEN** 相同 invocation identity 只有已授权的 `unknown` terminal record
- **THEN** Repository MUST允许后续普通 Verification 打开新 run与新 record
- **AND** 原 unknown record MUST继续可 list/inspect，且不能作为新执行结果复用

#### Scenario: unknown retention
- **WHEN** acknowledged unknown record 到达失败类固定 retention 并满足既有 GC 条件
- **THEN** GC MUST按既有 body cleanup 与 tombstone 规则处理
- **AND** MUST不因 unknown 自动缩短 retention 或删除原 record
