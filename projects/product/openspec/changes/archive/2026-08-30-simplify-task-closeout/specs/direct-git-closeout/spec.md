
## ADDED Requirements

### Requirement: 直接工具交付必须同时支持有无任务
直接 Git 交付 MUST作为默认收尾方法，不以是否有 Buildr 任务分叉为两套交付流程。没有任务不创建；有任务通过已有应用保存结果。顺序由智能体（Agent）结合事实与授权选择，不强制变基或额外诊断。

#### Scenario: 任务已存在
- **WHEN** 用户有匹配任务并要求直接 Git 交付
- **THEN** 智能体 MUST核验仓库、目标、贡献与远端结果，之后保存任务结果，不补造正式验证或收尾记录。

#### Scenario: 任务不存在
- **WHEN** 用户没有匹配任务
- **THEN** 智能体 MUST只完成相关工具动作并报告事实，不写任务或环境状态。

## REMOVED Requirements

### Requirement: 直接 Git 收尾必须按明确顺序执行
**Reason**: 固定变基顺序不能覆盖单仓、多仓及已交付现场。
**Migration**: 由智能体根据实际仓库约定选择操作，保留具体动作安全边界。

#### Scenario: 退役原前置要求
- **WHEN** 默认收尾采用本次确认的技能流程
- **THEN** 系统 MUST不要求本条退役流程，使用 Migration 中的替代方式。

### Requirement: 直接 Git 收尾不得伪造正式生命周期证据
**Reason**: 禁止伪造仍成立，但禁止更新已有任务和一律运行 Doctor 的旧约束与统一收尾冲突。
**Migration**: 只写真实任务结果，不伪造正式验证或旧收尾记录；诊断按实际需要选择。

#### Scenario: 退役原前置要求
- **WHEN** 默认收尾采用本次确认的技能流程
- **THEN** 系统 MUST不要求本条退役流程，使用 Migration 中的替代方式。
