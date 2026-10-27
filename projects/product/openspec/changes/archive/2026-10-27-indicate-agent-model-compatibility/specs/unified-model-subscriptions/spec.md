## MODIFIED Requirements

### Requirement: 套餐账号与执行方独立

系统 MUST 允许 Codex、Qoder、DSH 独立选择已接入账号中与当前执行方兼容的模型，MUST 保留稳定账号来源、真实模型身份和观察版本；程序自身必需认证与模型套餐认证 MUST 分别表达。来源已登录、模型已启用与执行方兼容 MUST 分别判断；界面兼容提示 MUST NOT 改写账号模型偏好或静默切换付费来源。

#### Scenario: DSH 使用 Codex 套餐
- **WHEN** 用户选择 DSH 和已接入 Codex 账号的 GPT 模型
- **THEN** 推理由所选套餐提供，工具执行和权限仍由 DSH 原生负责
- **AND** MUST NOT 因未登录 DeepSeek 而统一拒绝此组合

### Requirement: Devin 登录与模型推理

系统 MUST 提供 Devin 浏览器登录、准确回调、动态模型发现与模型调用，MUST 保留工具回合、流式结果、取消和真实错误；MUST NOT 用 Devin 云端任务执行代替模型推理。对话界面 MUST 按当前已知兼容状态提供选择：Devin 来源当前仅在 DSH 下允许选择，Codex、Qoder 下保留可见选项并置灰，显示当前暂不兼容及改选方式，MUST NOT 将此限制表达为厂家永久不支持或账号失效。后端的准确来源与诊断调用能力 MUST 保留。

#### Scenario: 任一执行方使用 Devin
- **WHEN** 用户完成 Devin 登录并选择与当前执行方兼容的可用模型
- **THEN** 所选执行方 MUST 能通过对应兼容协议使用该模型
- **AND** 已输出的失败请求 MUST NOT 被静默换源重放

#### Scenario: 不兼容执行方查看 Devin
- **WHEN** 用户选择 Codex 或 Qoder 并打开模型列表
- **THEN** Devin 来源模型 MUST 可见但不可选，界面 MUST 就地说明暂不兼容当前智能体并提示切换 DSH 或其他来源
- **AND** 其他来源仍按自身可用条件提供选择

#### Scenario: 恢复既有不兼容选择
- **WHEN** 对话恢复了 Codex 或 Qoder 与 Devin 来源模型的旧选择
- **THEN** 界面 MUST 保留原选择、历史与草稿并显示原因，不发送本次输入
- **AND** 用户 MUST 能显式改选模型或智能体后继续，不自动更换来源或重发
