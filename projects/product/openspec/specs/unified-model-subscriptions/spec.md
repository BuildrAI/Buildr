# unified-model-subscriptions Specification

## Purpose
定义 Buildr 按本机应用配置域集中接入模型套餐的账号、动态模型目录、准确付费来源和协议互通，使不同原生智能体能够共享模型推理，同时保持工具执行、凭据、会话恢复和实际额度事实各自的边界。

## Requirements

### Requirement: 套餐账号与执行方独立

系统 MUST 允许 Codex、Qoder、DSH 独立选择已接入账号中与当前执行方兼容的模型，MUST 保留稳定账号来源、真实模型身份和观察版本；程序自身必需认证与模型套餐认证 MUST 分别表达。来源已登录、模型已启用与执行方兼容 MUST 分别判断；界面兼容提示 MUST NOT 改写账号模型偏好或静默切换付费来源。

#### Scenario: DSH 使用 Codex 套餐
- **WHEN** 用户选择 DSH 和已接入 Codex 账号的 GPT 模型
- **THEN** 推理由所选套餐提供，工具执行和权限仍由 DSH 原生负责
- **AND** MUST NOT 因未登录 DeepSeek 而统一拒绝此组合

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

### Requirement: 私有凭据与本机路由

系统 MUST 按应用配置域隔离账号、密钥及本机网关，只允许已认证的准确模型绑定；上游秘密 MUST NOT 出现在公共响应、事件、日志或源资产。默认桌面账号 MUST NOT 被自动导入或覆盖。

#### Scenario: 访问另一套餐
- **WHEN** 客户端使用受限绑定请求未授权账号或模型
- **THEN** 网关 MUST 拒绝本次请求，不向上游发送

### Requirement: 目录和额度必须保留实际观察边界

系统 MUST 展示账号实际发现的模型、真实能力及额度更新时间；查询失败 MUST 保留可识别的旧观察，MUST NOT 将静态目录、估算用量或未知余额冒充已验证权益。某一账号查询失败 MUST NOT 阻断其他账号。

#### Scenario: 额度不可读取
- **WHEN** 模型可调用而套餐余额接口不可用
- **THEN** 系统 MUST 显示额度未知并保留模型使用能力，不制造零余额或已耗尽结论

### Requirement: 未知套餐输出路径必须如实表达

系统 MUST 区分执行方能消费外部模型和其个人套餐能供出模型。没有可靠输出接口时 MUST 明确该来源未接入，MUST NOT 伪造兼容或运行完整智能体循环冒充裸推理。

#### Scenario: Qoder 仅消费外部模型
- **WHEN** 已验证 Qoder 使用 Devin 而尚未证明 Qoder 个人套餐输出
- **THEN** 系统 MUST 分别报告这两项，不宣称全部双向互通
