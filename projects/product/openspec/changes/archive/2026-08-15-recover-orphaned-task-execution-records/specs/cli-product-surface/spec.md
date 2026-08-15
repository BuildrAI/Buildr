## ADDED Requirements

### Requirement: Agent CLI 必须开放 Execution Record 受控恢复
Buildr CLI MUST登记 `buildr task execution-record recover --task <task-id> --record <record-id> [--summary <file> | --authorize-unknown-outcome] [--target <canonical-workspace>] [--json]`。命令 MUST只调用 Task Execution Record Application 的 Verification recover action；MUST不接受 outcome、files、locator、owner、producer、retry、timeout、process ID、SQL 或 cleanup shell。

#### Scenario: Agent 自动恢复已完成执行
- **WHEN** Agent 提供 matching Task、record 与 terminal summary
- **THEN** CLI MUST补 seal 原 record并输出同一次 recover result
- **AND** MUST不运行 Verification、创建 record或要求额外用户授权

#### Scenario: CLI 请求 unknown 授权
- **WHEN** Agent 未提供可验证 summary且未传 `--authorize-unknown-outcome`
- **THEN** CLI MUST返回 authorization-required 与该授权会终结原 record、使后续普通 invocation 可运行的明确 effects
- **AND** MUST保持零 mutation

#### Scenario: 明确授权 unknown
- **WHEN** 用户已授权且 Agent 传入 `--authorize-unknown-outcome`
- **THEN** CLI MUST处置 matching open Verification record为 unknown并返回 attention
- **AND** help MUST说明该 flag 不证明原执行结果、不重跑且可能使仍存活 producer 的后续 seal 失败

#### Scenario: 非法恢复输入
- **WHEN** caller 同时提供 summary 与 unknown 授权，或提交任何未登记 mutation 输入
- **THEN** CLI MUST在 Application mutation 前拒绝
- **AND** MUST返回 canonical usage diagnostic
