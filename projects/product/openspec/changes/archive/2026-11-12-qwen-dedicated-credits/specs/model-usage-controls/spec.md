## MODIFIED Requirements

### Requirement: Qoder 套餐额度与资源包必须分别表达

Qoder 来源 MUST 同时解析 `/usage` 返回的套餐额度与资源包额度，个人账号的 `addOnQuota` 与组织账号的资源包字段 MUST 按真实响应表达。系统 MUST 分别展示套餐窗口与资源包窗口，并按可用额度和总量计算账号级剩余比例；平台返回剩余与总量时，账号卡片与额度概览 MUST 在对应窗口同时显示剩余 credits 数量与总量，MUST NOT 只显示百分比。未返回数量时 MUST NOT 推算或伪造数值。MUST NOT 仅因套餐窗口为 0% 判定整个账号耗尽，也 MUST NOT 因额度读取失败阻断模型目录。

`/usage` 返回 `dedicatedResourcePackages` 时，系统 MUST 为其中每个可用资源包生成独立额度窗口，名称取 `displayLabels` 中 `dimension` 为 `title` 的 `valueI18n['zh-CN']`，其次取同项 `value`，均缺失时回退“千问专属积分”。窗口 MUST 使用包含资源包 `id` 的唯一标识，并在平台返回时显示该资源包的剩余与总量 credits；`resetsAt` MUST 取该资源包的 `expiresAt`。`available` 不为 `true` 或已过期的资源包 MUST NOT 生成窗口，`description` 等说明文案 MUST NOT 进入额度窗口。专属积分只在对应模型系列内抵扣，MUST NOT 计入账号级剩余比例或通用额度耗尽判断。

#### Scenario: 套餐耗尽但资源包仍有余额

- **WHEN** `/usage` 返回套餐总额 1000、剩余 0，资源包总额 2700、剩余 1599
- **THEN** 账号卡片与额度概览 MUST 同时显示套餐与资源包窗口，并显示 `0 / 1,000 credits` 与 `1,599 / 2,700 credits`
- **AND** 账号级剩余比例 MUST 大于零，模型执行 MUST NOT 因额度耗尽被拒绝

#### Scenario: 数量字段缺失

- **WHEN** `/usage` 返回额度百分比但缺少剩余或总量数值
- **THEN** 系统 MUST 保留百分比或未知表达，MUST NOT 推算数量

#### Scenario: 资源包读取失败

- **WHEN** 资源包字段缺失或本次额度读取失败
- **THEN** 系统 MUST 保留模型目录并明确额度未知或保留旧观察
- **AND** MUST NOT 把未知资源包当作零余额

#### Scenario: 千问专属积分独立展示

- **WHEN** `/usage` 返回一项 `available` 为 `true`、总量 2000、剩余 2000、`expiresAt` 有值的资源包，且其标题文案为“Qwen 专属积分”
- **THEN** 额度窗口 MUST 新增该专属积分窗口，显示“Qwen 专属积分”与 `2,000 / 2,000 credits`
- **AND** 窗口重置时间 MUST 对应该资源包的到期时间
- **AND** 账号级剩余比例与额度耗尽判断 MUST NOT 因该窗口变化

#### Scenario: 专属积分名称回退

- **WHEN** 资源包缺少 `dimension` 为 `title` 的 `displayLabels`，或其中缺少 `valueI18n['zh-CN']`
- **THEN** 系统 MUST 依次使用同项 `value` 与“千问专属积分”作为窗口名称
- **AND** `description` 文案 MUST NOT 出现在额度窗口

#### Scenario: 不可用资源包不生成窗口

- **WHEN** `dedicatedResourcePackages` 中某项 `available` 不为 `true` 或已过期
- **THEN** 系统 MUST NOT 为该资源包生成额度窗口
- **AND** 其余可用窗口 MUST 保持正常展示
