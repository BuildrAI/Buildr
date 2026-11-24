## ADDED Requirements

### Requirement: Magpie 模型上下文默认值与配置上限分别判断

Buildr SHALL 保留 Magpie 报告的默认窗口，优先使用该模型明确报告的最大上下文窗口作为配置上限。只有明确识别为直接 Codex 订阅的 GPT‑6.2 Sol 或 Astra、目录值与官方 Codex 默认配置一致且无独立上限或矛盾的输入容量时，系统 MAY 使用官方公布的 1000K 作为可配置上限。其他模型和路由 MUST NOT 根据 GPT 命名或 API 规格推测更大的订阅上限。恢复默认 MUST 清除手动覆盖。

#### Scenario: 使用较大的 GPT‑6.2 窗口
- **WHEN** Magpie 对直接 Codex 来源的 GPT‑6.2 Sol 或 Astra 分别只报告默认 500K 或 272K
- **THEN** 800K MUST 可保存并用于新执行，未配置或重置仍使用各自的默认值

#### Scenario: 网关显式限制优先
- **WHEN** 网关明确报告较小的最大上下文窗口，或目录与官方默认容量不一致且没有独立最大值
- **THEN** Buildr MUST NOT 用官方默认路径的长上下文能力扩张当前网关范围
