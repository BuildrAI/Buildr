## ADDED Requirements

### Requirement: 账号卡片必须支持独立 ChatGPT API 来源原位配置

账号设置 MUST 提供与订阅账号分开显示的独立 `ChatGPT API` 来源卡片。未配置时 MUST 在原卡片提供密码输入与保存动作，不要求切换独立页面，也不提供 URL 输入。校验成功后 MUST 在同一卡片展示账号状态、模型入口、观察时间及额度未知事实；校验失败 MUST 保留输入操作与其他来源，不得把失败账号显示为已登录。订阅来源与 API Key 来源 MUST 能同时显示为已连接或可用，不提供互斥启用要求。账号来源列表 MUST 按显示名称稳定排序，`全部来源` 固定在首位，使 `ChatGPT` 与 `ChatGPT API` 相邻显示。

#### Scenario: 首次配置 API Key

- **WHEN** 用户在 ChatGPT API 卡片填写密钥并保存
- **THEN** 卡片 MUST 显示校验中状态，完成后显示可用模型与观察时间
- **AND** 密钥 MUST 以密码输入呈现且保存后不再显示原文

#### Scenario: 无效密钥诊断

- **WHEN** 保存的密钥被服务商拒绝
- **THEN** 卡片 MUST 显示具体认证或权限诊断并允许重新输入
- **AND** 其他账号卡片 MUST 保持原状态和模型

#### Scenario: 管理已连接 API Key

- **WHEN** ChatGPT API 来源已连接
- **THEN** 用户 MUST 能刷新模型、更换密钥、管理模型启停和上下文并断开该来源
- **AND** 断开或更换 MUST 不影响 ChatGPT 订阅账号及无关来源

#### Scenario: 订阅和 API Key 同时可用

- **WHEN** ChatGPT 订阅账号和 ChatGPT API 来源均已成功连接
- **THEN** 两张来源卡片 MUST 同时保持可用状态
- **AND** 系统 MUST NOT 要求停用其中一个来源才能启用另一个

#### Scenario: 账号来源名称排序

- **WHEN** 账号设置同时展示 ChatGPT 订阅、ChatGPT API 与其他来源
- **THEN** 来源列表 MUST 按显示名称排序，`ChatGPT` 与 `ChatGPT API` MUST 相邻
- **AND** `全部来源` MUST 始终位于来源列表首位，排序不得改变当前选择或账号状态
