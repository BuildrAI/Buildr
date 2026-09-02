## ADDED Requirements

### Requirement: 正式研发必须由 Agent 直接组合专业能力
Buildr MUST让Agent依据Task目标和真实现场按需组合Task Environment、OpenSpec、Current Knowledge、Task Review、Task Verification、Git与默认`task-finish` Skill，MUST NOT要求Development Receipt、Task Candidate、统一`proceed|blocked`或Development Handoff。

#### Scenario: 带OpenSpec的实现任务
- **WHEN** active Task在ready Environment中创建、实施并收敛OpenSpec Change
- **THEN** Agent MUST可直接完成strict validation、semantic preflight、实现、Current Knowledge、convergence、Review、Verification与交付
- **AND** 全程 MUST不调用Task Development或Task Planning Identity

#### Scenario: 内容变化后重新检查
- **WHEN** Review或Verification后真实内容变化
- **THEN** Agent MUST根据实际subject/content identity判断并重做受影响检查
- **AND** MUST不创建Candidate generation或统一stale状态

## REMOVED Requirements

### Requirement: task-development Skill 必须编排P0.5 authority顺序
**Reason**: Task Development整体退役。
**Migration**: Agent直接组合专业Skill和工具。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Development 必须区分任务贡献与交付基线适用性
**Reason**: Candidate和handoff退役。
**Migration**: Git与实际交付工具直接核对内容和目标。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: OpenSpec workflow 必须消费统一 planning identity resolver
**Reason**: Task Planning Identity整体退役。
**Migration**: strict validation与semantic preflight继续保护OpenSpec；Review直接读取真实artifacts。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Formal Task 启动必须优先使用 compact entry surface
**Reason**: Task Entry与Development compact链均已退役。
**Migration**: 使用Task Record和实际命中的专业Skill。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: OpenSpec 变更必须按可绑定顺序接入任务
**Reason**: 顺序中的Development begin不再存在。
**Migration**: 先建立Task与必要Environment，再创建Change并绑定Task，然后直接写artifacts。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Formal Verification 交接预检必须避免白跑且不干扰开发反馈
**Reason**: Development交接预检退役。
**Migration**: Agent直接依据当前内容、测试地图和专业结果选择验证。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Agent workflow MUST consume current input discovery and focused consumer coverage
**Reason**: Development current input discovery退役。
**Migration**: 保留受影响消费者测试选择，不再生成Development mutation input。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: OpenSpec 直接 consumers 必须表达真实 capability 停止条件
**Reason**: 旧Requirement把Development设为OpenSpec必需依赖。
**Migration**: 直接consumer只依赖Task、必要Environment、Current Knowledge和OpenSpec自己的语义保护。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入
