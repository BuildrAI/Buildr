## MODIFIED Requirements

### Requirement: Magpie 模型上下文默认值与配置上限分别判断

Buildr SHALL 区分 Magpie 模型的目录默认窗口、明确最大窗口、用户配置和执行生效值，不按模型名判断上限。仅有默认窗口或没有窗口信息时 MUST 表达最大值未知，并允许用户在 Buildr 的输入范围内手动覆盖，不将其表述为上游已验证能力。Magpie 明确报告最大窗口时 MUST 继续校验新配置并限制生效值。刷新 MUST 保留用户配置；恢复默认 MUST 清除覆盖并恢复目录默认值。其他来源 MAY 保持自身既有默认和上限策略。

#### Scenario: 使用较大的 GPT‑6.2 窗口
- **WHEN** Magpie 对 GPT‑6.2 Sol 或 Astra 只报告默认窗口且用户配置 800K
- **THEN** 系统 MUST 允许保存；恢复默认分别回到 500K 或 272K

#### Scenario: 目录只报告默认窗口
- **WHEN** Magpie 对任意模型报告默认 500K 但未报告明确最大窗口，用户配置 800K
- **THEN** Buildr MUST 保存 800K 并用于新的执行窗口配置，明示上限未知；重置后恢复 500K

#### Scenario: 网关显式限制优先
- **WHEN** 已配置 800K 的模型后来明确报告 600K 最大窗口
- **THEN** Buildr MUST 保留 800K 偏好但将生效值限制到 600K，拒绝新的超限输入
