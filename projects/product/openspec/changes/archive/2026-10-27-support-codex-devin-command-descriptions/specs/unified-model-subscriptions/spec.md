## MODIFIED Requirements

### Requirement: Devin 登录与模型推理

系统 MUST 提供 Devin 浏览器登录、准确回调、动态模型发现与模型调用，MUST 保留工具回合、流式结果、取消和真实错误；MUST NOT 用 Devin 云端任务执行代替模型推理。对话界面 MUST 按当前已知兼容状态提供选择：DSH 可选 Devin，Codex 当前仅允许 SWE-2 与用户显式选择的完全访问组合；其他 Codex/Devin 模型组合及 Qoder/Devin 保留可见选项并置灰，说明当前限制，MUST NOT 表达为厂家永久不支持或账号失效。请求兼容处理 MUST 保留工具身份、参数语义、权限规则及结果配对；未知工具说明 MUST 原样传递。后端准确来源与诊断能力 MUST 保留。

#### Scenario: 任一执行方使用 Devin
- **WHEN** 用户完成 Devin 登录并选择与当前执行方兼容的可用模型
- **THEN** 所选执行方 MUST 能通过对应兼容协议使用该模型
- **AND** 已输出的失败请求 MUST NOT 被静默换源重放

#### Scenario: 不兼容执行方查看 Devin
- **WHEN** 用户选择 Qoder，或选择 Codex 但模型及当前权限不在已验证组合中，并打开模型列表
- **THEN** 对应 Devin 选项 MUST 可见但不可选，界面说明限制及可用组合或切换 DSH 的方式
- **AND** 其他来源仍按自身可用条件提供选择

#### Scenario: 恢复既有不兼容选择
- **WHEN** 对话恢复了不满足当前模型及权限条件的 Codex 或 Qoder 与 Devin 来源模型选择
- **THEN** 界面 MUST 保留原选择、历史与草稿并显示原因，不发送本次输入
- **AND** 用户 MUST 能显式改选模型、智能体或权限后继续，不自动提高权限、更换来源或重发

#### Scenario: Codex 完全访问使用 SWE-2
- **WHEN** 用户显式选择 Codex、Devin SWE-2 和完全访问
- **THEN** 模型 MUST 可选，真实原生工具读取和结果接续可完成，工具身份及参数不因说明兼容而改变
- **AND** 切回默认权限 MUST 保留草稿和模型选择并禁止下一轮发送，不能静默恢复完全访问

#### Scenario: 精确工具说明兼容
- **WHEN** Devin 收到 Codex 两个命令工具的已知用途说明
- **THEN** 系统 MUST 用含义相同的说明交付，保留原参数说明、名称、权限上下文和结果配对
- **AND** 非 Codex 请求及未知版本说明 MUST 不被该兼容处理改写
