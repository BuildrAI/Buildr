## ADDED Requirements

### Requirement: 自动恢复观察不打扰正常使用
对话页面 MUST 在自动重连和自动核对执行状态期间静默恢复观察，MUST NOT 仅因进入恢复过程展示故障提醒。有界重试耗尽或确认原执行失败时 MUST 保留准确错误，MUST NOT 隐藏待用户决定、授权或真实执行失败，MUST NOT 自动重发原请求。

#### Scenario: 短暂事件连接中断
- **WHEN** 事件连接短暂中断并在有界重试中恢复
- **THEN** 页面 MUST 静默恢复，不显示重连或恢复成功提示

#### Scenario: 持续连接故障
- **WHEN** 事件连接的有界重试耗尽
- **THEN** 页面 MUST 显示真实连接错误并保留当前对话与草稿
