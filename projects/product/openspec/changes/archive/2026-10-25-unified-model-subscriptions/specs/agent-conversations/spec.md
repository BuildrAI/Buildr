## ADDED Requirements

### Requirement: 每轮模型来源必须固定并可追溯

系统 MUST 将模型账号、模型、档位及绑定版本纳入发送预览、本轮持久记录与真实请求。跨来源不兼容的原生上下文 MUST 在同一可见对话内准确接续，MUST NOT 搬运隐藏推理或静默覆盖旧恢复引用。

#### Scenario: 同名模型有多个来源
- **WHEN** 用户选择 Devin 账号的 GPT 而另有 Codex 账号提供同名模型
- **THEN** 本轮 MUST 固定使用 Devin，记录真实来源，失败时不自动扣另一套餐

#### Scenario: 原执行仍未结束
- **WHEN** 原执行、活动工具或受理结果尚未确认结束
- **THEN** 系统 MUST 保留原绑定，阻止换源开始新轮，不重放未知输入
