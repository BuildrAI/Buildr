## ADDED Requirements

### Requirement: Task Finish CLI 必须显式限定零差异适配确认
`buildr task finish run` MUST接受布尔参数`--accept-zero-delta-adaptation`，且只允许它与已有`adaptation-required` run的`--run`、matching `--resume`及canonical target共同使用。CLI MUST把该参数作为本次Agent审查输入交给同一Task Finish Application，不得创建新action、第二套恢复路由或持久化调用方自定义evidence。

#### Scenario: matching resume 显式确认零差异
- **WHEN** Agent审查run-owned carrier后使用`task finish run --run <id> --resume <token> --accept-zero-delta-adaptation`
- **THEN** CLI MUST调用同一run执行器并让Application核验该确认的适用性
- **AND** help MUST说明该参数不创建commit、不替代token且只用于零差异Delivery Adaptation

#### Scenario: 在不适用上下文传入确认参数
- **WHEN** 调用方在首次run、inspect、非adaptation blocked run、缺失run/token或错误token时传入`--accept-zero-delta-adaptation`
- **THEN** CLI MUST返回canonical input error与Task Finish run帮助
- **AND** MUST在Finish phase、carrier、远端与Task终态零副作用状态停止
