## REMOVED Requirements

### Requirement: Task Development 必须维护唯一 current Receipt
**Reason**: Development Receipt复制其他owner事实且已无current消费者。
**Migration**: 删除Application、接口和`task_development_current`，Agent直接读取Task、OpenSpec、Git、文件和专业结果。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Development Receipt 必须使用关闭且最小的数据模型
**Reason**: Receipt整体退役。
**Migration**: 不迁移、不保留历史表或兼容reader。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task context identity 必须绑定完整 Intent、scope 与 Change context
**Reason**: Task Record与OpenSpec已经拥有这些事实。
**Migration**: 调用所属owner读取current事实。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Content Target 必须完整且不预设源码工具
**Reason**: 没有独立消费者，内容版本可从Git、文件或外部系统直接观察。
**Migration**: Review和Verification使用真实subject/content identity。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Candidate identity 与generation必须只由Development生成
**Reason**: Task Candidate不再驱动任何current动作。
**Migration**: 删除Task Candidate；Product/Release Candidate保持独立。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Development 必须独占proceed/blocked、scoped risk与Finish handoff
**Reason**: 推进是Agent判断，具体风险由实际动作owner保护。
**Migration**: 不建立统一决定或风险许可层。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Development 必须覆盖完整正式研发区间
**Reason**: 正式研发不需要Application级总流程。
**Migration**: Agent按目标组合Skill与现有工具。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Planning snapshot 必须最小、可移植且不是事件历史
**Reason**: OpenSpec artifacts已是规划authority。
**Migration**: 直接读取当前proposal、design、specs和tasks。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Development operation 必须提供有界的执行成本诊断
**Reason**: 对应operation退役。
**Migration**: 删除profile surface及专属测试。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Development operation 必须限制重复 Workspace 观察
**Reason**: 对应operation退役。
**Migration**: 各专业动作按自己的current事实观察。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: terminal Task 必须提供交付时研发快照且不得伪造 live currentness
**Reason**: 用户接受删除旧研发和Finish历史。
**Migration**: Task Record只保留顶层结果，不补造交付快照。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Development applicability 必须由正式 action 原子保存
**Reason**: 保存的适用性不是current事实且无消费者。
**Migration**: 删除applicability row和writer。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Development driver 必须提供同源调用契约发现
**Reason**: 内部driver退役。
**Migration**: 删除route、schema、example和help。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: OpenSpec planning target 必须使用语义身份
**Reason**: Development planning与Task Planning Identity一并退役。
**Migration**: Agent直接审查current OpenSpec artifacts。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Buildr Web 必须只读投影任务研发 read model
**Reason**: 研发页没有独立用户价值。
**Migration**: 删除页签和HTTP；其他专业页继续独立读取。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Development driver 必须提供紧凑 current 与 next-action 投影
**Reason**: 内部driver退役。
**Migration**: Agent依据Skill和owner Result决定下一步。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Development 在 Content Target 前检查新增文本文件 EOF
**Reason**: EOF是Product源码约束，不应依附退役模块。
**Migration**: 由Product规则和开发检查直接保护新增文本文件。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: 多Project Current Knowledge必须按Project完整聚合
**Reason**: Development不再聚合Current Knowledge。
**Migration**: Agent逐Project消费专业Result并处理真实冲突。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: 研发必须退出父子协调写入
**Reason**: 整个研发Application退役。
**Migration**: 父子协调继续只使用Task Record与可读计划。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Development必须与Task Verification独立
**Reason**: Task Development退役。
**Migration**: Task Verification继续独立。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Development current input discovery不得编排任务验证
**Reason**: discovery与Development一并退役。
**Migration**: Agent直接读取Task和项目测试地图。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入

### Requirement: Task Development必须与Task Review独立
**Reason**: Task Development退役。
**Migration**: Task Review继续独立。

#### Scenario: 调用退役入口
- **WHEN** 调用方请求该已退役行为
- **THEN** 系统 MUST不再提供该行为
- **AND** MUST保持其他当前事实与数据零写入
