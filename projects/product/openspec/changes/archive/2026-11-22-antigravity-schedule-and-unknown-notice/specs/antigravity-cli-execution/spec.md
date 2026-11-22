## MODIFIED Requirements

### Requirement: Antigravity 后台结果必须交回同一轮模型

系统 MUST 区分原生 `session/prompt` 返回 `end_turn` 与该轮真正完成。原生回合结束时仍有运行中的命令工具、定时等待工具（如 `schedule` / `Run schedule`）或其他受声明原生后台任务（如 `run_workflow` / `Run run_workflow`），系统 MUST 保持该轮未结算（`status: 'running'` 与 `backgroundWork: true`），MUST NOT 写入终态、置为 `unknown` 或报告 `completed`。后台工作或定时等待到期结束后，若原生 harness 保持当前回合开放并继续，系统 MUST 映射该回合并等待其正常结束；原生 harness 已结束当前回合且未继续时，Buildr 对接层 MUST 根据 ACP 工具完成更新或原生转录回执（包含命令退出记录与 `Timer`/`Cron` 触发记录）在同一原生会话发送内部续行，把结果交回模型并等待其处理。同步类非后台工具（如 `read`、`edit`）缺少回执时仍 MUST 保留为 `unknown`。单轮后台内部续行次数默认上限为 20 次；只有模型在后台结果之后再次结束，且没有活动后台工作或未结工具时，系统才可报告完成。无法建立续行、续行被拒绝或超过有界续行次数时，系统 MUST 保留 `unknown` 并说明后台结果未交回模型或已达续行上限，MUST NOT 以 `completed` 冒充完成。内部续行 MUST NOT 作为用户消息进入历史或界面。

在状态核对重连上下文（`resumeContext`）时，若原回合仍有活动提示或活动后台工作（`pending || backgroundWork`），系统 MUST 保持原会话活跃与原权限模式（`permissionMode`），MUST NOT 因重连未传递原权限模式而关闭正在运行的 `full-access` 原生进程。

当因达到单轮后台自动续行上限而暂停、且当前已不存在待处理模型提示、待回答请求或运行中工具时，执行器 MUST 关闭空闲原生会话进程并允许通过物理进程退出核验后释放控制资源，同时保留上限暂停诊断。

#### Scenario: 后台命令晚于原生回合结束

- **WHEN** `agy` 在命令工具仍运行时返回 `end_turn`，随后命令退出且原生没有开始新的模型回合
- **THEN** 系统 MUST 保持该轮运行
- **AND** 对接层 MUST 在同一原生会话发送内部续行，把命令结果交回模型
- **AND** 只有在模型处理结果并再次结束后，系统才发出一次 `completed`

#### Scenario: 定时等待晚于原生回合结束并在到期后续行

- **WHEN** `agy` 在 `Run schedule` 定时工具仍运行时返回 `end_turn`
- **THEN** 系统 MUST 将该轮保持为 `running` 与 `backgroundWork: true`，MUST NOT 标为 `unknown`
- **AND** 当 `Run schedule` 经 ACP 完成通知或原生转录 `Timer`/`Cron` 系统触发记录完成后，系统 MUST 在同一原生会话发送内部续行交回模型并等待正常完成
- **AND** 在等待期间用户发送的执行中追加 MUST 能在同一原生会话被正常受理

#### Scenario: 非后台工具缺少回执仍保护为未知

- **WHEN** `agy` 在 `read` 等非后台工具仍为运行中时返回 `end_turn`
- **THEN** 系统 MUST 保持将该轮置为 `unknown` 并提示存在缺少完成回执的工具，MUST NOT 误判为后台任务

#### Scenario: 状态核对保留原权限模式不误关进程

- **WHEN** 系统对采用 `full-access` 权限模式的执行轮触发状态核对或重新读取
- **THEN** 重连与恢复上下文 MUST 保留原轮次的 `permissionMode`，MUST NOT 退化为默认模式并关闭仍在执行的原生进程

#### Scenario: 原生 harness 保持当前回合

- **WHEN** 后台工作结束后原生 harness 仍在当前回合内继续，并在拿到结果后正常结束
- **THEN** 系统 MUST 映射该回合并等待其正常结束
- **AND** 系统 MUST NOT 发送内部续行

#### Scenario: 续行无法建立

- **WHEN** 后台结果已取得，但同一原生会话无法建立续行
- **THEN** 系统 MUST 保留 `unknown` 并保留后台结果供查看
- **AND** 系统 MUST NOT 报告该轮 `completed`

#### Scenario: 达到单轮续行上限后暂停并释放空闲资源

- **WHEN** 单轮后台自动续行次数达到上限且所有当前工具均已取得结果，后台任务再次结束触发续行
- **THEN** 系统 MUST 将本轮置为 `unknown` 并保留自动续行上限诊断，MUST NOT 再向模型发送新的内部续行
- **AND** 执行器 MUST 关闭空闲会话进程并允许在核验物理退出后释放本轮控制资源
