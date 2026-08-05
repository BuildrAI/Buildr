## ADDED Requirements

### Requirement: Task Development operation 必须提供有界的执行成本诊断

Task Development 内部 driver MUST 在显式 profiling 请求下返回 response-only 阶段计时，至少区分 module load、runtime composition、Application execution、result serialization 与 total；默认 operation result shape MUST保持不变。计时 MUST NOT进入 Development Receipt、Workspace SQLite、Candidate、Result、decision或handoff，也 MUST NOT把 Agent harness、shell或外层工具调度时间算作产品 execution。

#### Scenario: 显式请求 profiling

- **WHEN** Agent 对一个 Task Development driver action 显式传入 profiling 选项
- **THEN** driver MUST返回原 Application result与各产品进程内阶段的非负计时
- **AND** timing MUST只作为 response evidence，不产生额外持久化 effect

#### Scenario: 普通 transition 保持兼容

- **WHEN** Agent 未请求 profiling并执行任一现有 Task Development action
- **THEN** driver MUST继续返回现有 `buildr.task-development-operation-result/v1`
- **AND** Receipt、Candidate、gate、decision与handoff语义 MUST保持不变

### Requirement: Task Development operation 必须限制重复 Workspace 观察

Task Development Application MUST把每个公开 action 作为独立 operation scope；同一同步 action 内对相同 canonical Workspace 的重复 Structured Store访问 MUST复用已成功验证的 canonical root与不可变package migration assets，并 MAY复用由Task Record与Task Environment owner Application对相同输入形成的完整read model。scope MUST在返回或失败时结束，后续 action MUST重新观察 current Workspace；系统 MUST NOT跨process或跨action缓存Task、Environment、Review、Verification、Development read model或SQLite connection。

#### Scenario: 同一 action 重复访问 Structured Store

- **WHEN** 一个 Task Development action 通过多个专业 Application或repository重复访问相同 canonical Workspace
- **THEN**系统 MUST在该action内最多执行一次Git checkout canonical observation
- **AND**相同Task Record或Environment输入的复用值 MUST来自对应owner Application，不得由Task Development直接读取专业repository
- **AND**每个repository MUST继续保留自身读取、transaction、validation与close语义

#### Scenario: action 结束后重新确认

- **WHEN**前一个Task Development action已成功、失败或抛出异常，随后启动新的action
- **THEN**新action MUST重新确认canonical Workspace与current专业facts
- **AND**前一个scope的缓存 MUST不可见

#### Scenario: 长寿命 runtime 中 Workspace 发生变化

- **WHEN**Local App或其他长寿命consumer复用同一runtime并在两个Task Development action之间发生Git或Workspace变化
- **THEN**第二个action MUST不复用第一个action的canonical判定或专业read model
- **AND**系统 MUST保持现有fail-closed诊断
