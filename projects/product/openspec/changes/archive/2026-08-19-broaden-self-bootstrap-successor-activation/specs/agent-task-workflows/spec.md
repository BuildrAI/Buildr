## ADDED Requirements

### Requirement: Buildr 工作流门禁必须保持宽而薄
Buildr required Core MUST 将“宽而薄”定义为通用治理原则：只有继续推进会造成越权、错误对象写入、未经授权的外部或不可逆副作用、证据失真或完成误报时才关闭式失败；其他可恢复不确定性 MUST 如实报告事实、风险与下一步，并保留 Agent 的安全判断和推进空间。Product scope MUST要求新增硬门禁明确其保护的 authority 或结果不变量及放行造成的具体伤害，MUST NOT仅因缺少辅助 provenance、推荐流程、特定工具身份或统一工作方式而阻断原本可安全检查和继续的工作。

#### Scenario: 缺少辅助证明但结果边界仍可检查
- **WHEN** 工作流缺少推荐的 metadata 或 provenance hint，但 authority、目标、授权、副作用和真实完成条件仍能由当前事实检查
- **THEN** Buildr MUST提供诊断与 Agent 指引并允许安全推进
- **AND** MUST NOT把辅助证明升级为唯一硬门禁或要求 Agent 伪造证明

#### Scenario: 推进会造成错误写入或完成误报
- **WHEN** 当前 identity、authority、授权或结果 evidence 不完整，继续动作可能写入错误对象、产生未经授权副作用或把未验证结果报告为完成
- **THEN** Buildr MUST在对应副作用或完成声明前关闭式失败
- **AND** MUST报告实际 blocker 与可恢复入口，不得用“宽而薄”绕过真实边界

#### Scenario: Product 设计新增硬门禁
- **WHEN** Product Change 准备新增会阻断 Agent 工作流的硬门禁
- **THEN** proposal、design 或 specification MUST明确该门禁保护的 authority/结果不变量和放行的具体伤害
- **AND** 若只有自动化信心降低或工作方式不同、但存在可检查的安全继续路径，Product MUST选择 typed diagnostic、风险报告或 Agent guidance
