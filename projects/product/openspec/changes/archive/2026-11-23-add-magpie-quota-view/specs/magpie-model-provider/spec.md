## ADDED Requirements

### Requirement: Magpie 上游账号额度独立展示

Buildr SHALL 在已绑定的 Magpie 来源详情中按上游供应商和账号展示额度观察，MUST 保留上游余额单位、窗口、重置及观察时间，不合计不同账号的额度，不推断下一轮的路由、份额或费用。读取只使用当前绑定的本机 Magpie 公开接口，MUST NOT 暴露凭据、原始响应体或完整邮箱到目录与日志。读取失败、空结果和缺失字段 MUST 分开表达，不将缺少的值填成零。模型选择和请求授权 MUST NOT 依赖该观察。

#### Scenario: 同一个供应商下有两个帐号
- **WHEN** Magpie 对同一上游供应商报告两个账号和各自的额度窗口
- **THEN** Buildr MUST 分别显示两个账号与各自的额度，不合计、不挂到模型选择器

#### Scenario: 额度暂不可读取
- **WHEN** Magpie 额度接口拒绝、失败或没有观察
- **THEN** Buildr MUST 明确说明读取状态，原模型选择与可用性不因额度读取变化
