## MODIFIED Requirements

### Requirement: Google 个人账号来源必须由 Antigravity 托管官方登录并仅供 Antigravity 使用

系统 MUST 使用 `agy` 官方支持的 Google 个人账号登录路线，接受免费、Google AI Pro 与 Ultra 账号。来源可用的条件 MUST 是 `agy` 确认当前 `oauth-personal` 登录有效、可建立稳定绑定身份且返回非空可用模型目录：当 `agy` 在官方协议字段中公开账号标识时，系统 MUST 显示该账号并以账号标识摘要作为绑定身份；当 `agy` 已确认个人账号登录但不公开账号标识字段时，系统 MUST 在连接私有状态中建立受管登录世代身份、如实显示 `agy` 未公开邮箱并说明终端原位换号需执行切换账号；当 `agy` 返回的账号字段损坏或认证归属无法确认时，来源 MUST 表示为身份不可确认且不可用于发送。系统 MUST 显示订阅档位，档位不可读时 MUST 显示“档位不可读”且不影响使用。来源 MUST 显示 `agy` 实际报告的可用模型及思考深度。

额度 MUST 通过受管 `agy` 的官方用量命令（打印模式下的 `/usage`，等价 `/quota`）读取，并按 Gemini 与 Claude / GPT 分组展示官方返回的每周、5 小时剩余百分比与重置时间；MUST NOT 读取、复制、保存或转发系统密钥环中的登录凭据，MUST NOT 通过本机网关或其他执行器转发该账号的模型调用。额度读取失败时 MUST 保留上次已观察的可用窗口并标记过期；没有历史观察时 MUST 显示不可读并提供官方 `/usage` 入口，MUST NOT 根据模型列表、档位、历史用量或返回值缺失推算余额或档位。

来源 MUST 声明仅供 Antigravity 使用且不提供网关推理：其他执行方中显示为不可选并说明原因，系统 MUST NOT 为其签发租约，也 MUST NOT 在 Buildr 内提取、保存或转发其登录凭据。

#### Scenario: 登录免费账号
- **WHEN** 用户以未订阅的 Google 个人账号完成登录，`agy` 确认登录有效并返回可用模型
- **THEN** 来源 MUST 显示当前 Google 账号状态、免费档位与可用模型，对话中可选择 Antigravity 与这些模型

#### Scenario: 档位不可读
- **WHEN** `agy` 确认登录有效且可建立绑定身份并返回可用模型，但没有提供可识别的档位
- **THEN** 来源 MUST 可用并显示“档位不可读”，MUST NOT 推断为免费、Pro 或 Ultra

#### Scenario: 账号身份无法确认
- **WHEN** `agy` 返回损坏的账号标识字段或认证归属无法确认
- **THEN** 来源 MUST 显示身份不可确认，相关发送 MUST 在工作输入前拒绝

#### Scenario: 读取官方用量窗口
- **WHEN** 受管 `agy -p '/usage'` 返回 Gemini 与 Claude / GPT 的每周、5 小时窗口
- **THEN** 账号卡片 MUST 按 `Gemini` 与 `Claude / GPT` 分组显示每个窗口的剩余百分比和重置时间
- **AND** 这些窗口 MUST 来自本次官方命令输出，不从模型目录、档位或历史用量推算

#### Scenario: 官方额度暂不可读
- **WHEN** 官方用量命令失败、超时或没有返回可识别窗口
- **THEN** 若已有上次可用窗口，来源 MUST 继续展示这些窗口并标记为过期观察
- **AND** 若没有历史窗口，来源 MUST 显示额度不可读并链接官方 `/usage` 说明，模型 MUST 仍可正常使用

#### Scenario: 在 Claude Code 中查看 Google 账号模型
- **WHEN** 用户为 Claude Code 打开模型选择
- **THEN** Google 账号模型 MUST 显示为不可选，并说明受官方授权限制仅可在 Antigravity 中使用
