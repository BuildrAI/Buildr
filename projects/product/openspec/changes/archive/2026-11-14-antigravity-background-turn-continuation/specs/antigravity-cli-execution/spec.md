## ADDED Requirements

### Requirement: Antigravity 后台结果必须交回同一轮模型

系统 MUST 区分原生 `session/prompt` 返回 `end_turn` 与该轮真正完成。原生回合结束时仍有运行中的工具或后台任务，系统 MUST 保持该轮未结算，MUST NOT 写入终态或报告 `completed`。后台工作结束后，若原生 harness 保持当前回合开放并继续，系统 MUST 映射该回合并等待其正常结束；原生 harness 已结束当前回合且未继续时，Buildr 对接层 MUST 在同一原生会话发送内部续行，把后台结果交回模型并等待其处理。只有模型在后台结果之后再次结束，且没有活动后台工作或未结工具时，系统才可报告完成。无法建立续行、续行被拒绝或超过有界续行次数时，系统 MUST 保留 `unknown` 并说明后台结果未交回模型，MUST NOT 以 `completed` 冒充完成。内部续行 MUST NOT 作为用户消息进入历史或界面。

#### Scenario: 后台命令晚于原生回合结束

- **WHEN** `agy` 在命令工具仍运行时返回 `end_turn`，随后命令退出且原生没有开始新的模型回合
- **THEN** 系统 MUST 保持该轮运行
- **AND** 对接层 MUST 在同一原生会话发送内部续行，把命令结果交回模型
- **AND** 只有在模型处理结果并再次结束后，系统才发出一次 `completed`

#### Scenario: 原生 harness 保持当前回合

- **WHEN** 后台工作结束后原生 harness 仍在当前回合内继续，并在拿到结果后正常结束
- **THEN** 系统 MUST 映射该回合并等待其正常结束
- **AND** 系统 MUST NOT 发送内部续行

#### Scenario: 续行无法建立

- **WHEN** 后台结果已取得，但同一原生会话无法建立续行
- **THEN** 系统 MUST 保留 `unknown` 并保留后台结果供查看
- **AND** 系统 MUST NOT 报告该轮 `completed`
