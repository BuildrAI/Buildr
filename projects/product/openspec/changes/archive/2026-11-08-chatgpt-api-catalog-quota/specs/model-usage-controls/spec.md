## ADDED Requirements

### Requirement: Qoder 套餐额度与资源包必须分别表达

Qoder 来源 MUST 同时解析 `/usage` 返回的套餐额度与资源包额度，个人账号的 `addOnQuota` 与组织账号的资源包字段 MUST 按真实响应表达。系统 MUST 分别展示套餐窗口与资源包窗口，并按可用额度和总量计算账号级剩余比例；MUST NOT 仅因套餐窗口为 0% 判定整个账号耗尽，也 MUST NOT 因额度读取失败阻断模型目录。

#### Scenario: 套餐耗尽但资源包仍有余额

- **WHEN** `/usage` 返回套餐总额 1000、剩余 0，资源包总额 2700、剩余 1599
- **THEN** 账号卡片 MUST 同时显示套餐与资源包窗口及其真实剩余
- **AND** 账号级剩余比例 MUST 大于零，模型执行 MUST NOT 因额度耗尽被拒绝

#### Scenario: 资源包读取失败

- **WHEN** 资源包字段缺失或本次额度读取失败
- **THEN** 系统 MUST 保留模型目录并明确额度未知或保留旧观察
- **AND** MUST NOT 把未知资源包当作零余额

### Requirement: ChatGPT API 额度未知必须明确且区分模型观察

ChatGPT API 账号卡片 MUST 区分模型目录观察时间与额度观察时间。普通 API Key 无法读取剩余余额时，系统 MUST 明确显示额度未知，并说明费用与余额由 OpenAI 平台管理；MUST NOT 显示为零余额、已耗尽，或把模型目录已成功观察误显示为“尚未读取”。

#### Scenario: 模型已读取但余额不可读

- **WHEN** ChatGPT API 模型目录读取成功而官方 API 不返回剩余余额
- **THEN** 卡片 MUST 显示模型目录观察时间与额度未知说明
- **AND** 模型 MUST 保持可用，系统 MUST NOT 推断零余额

#### Scenario: 普通 API Key 无法读取账单

- **WHEN** 普通 API Key 请求组织账单或余额接口被拒绝
- **THEN** 系统 MUST 保留未知状态并指向 OpenAI 平台用量/账单，不得要求用户把管理员密钥或会话 Cookie 交给 Buildr

### Requirement: 模型候选来源快捷行必须保持单行

模型候选弹层中的来源快捷行 MUST 在常见桌面与窄视口宽度内保持单行，超出时 MUST 采用可访问的横向滚动或其他不折行方式；来源按钮 MUST 保持可点击和可聚焦。

#### Scenario: 多个来源同时存在

- **WHEN** 模型候选同时包含 ChatGPT、DSH、Qoder、Devin 与 ChatGPT API
- **THEN** 来源快捷行 MUST 不折成第二行
- **AND** 每个来源 MUST 仍能定位到对应模型分组
