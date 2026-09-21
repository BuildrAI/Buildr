## MODIFIED Requirements

### Requirement: 当前工作摘要独立于任务核心
系统 MUST 为真实任务提供可空的当前工作摘要，包含最近进展、下一步、更新时间、可空关注事项及可选当前节点 stage。读取与写入 MUST 经同一应用（Application），不得修改任务目标、状态、结果或专业报告。未登记时 MUST 返回明确空值。

#### Scenario: 记录实际进展
- **WHEN** 智能体以已观察版本写入进展与下一步
- **THEN** 应用 MUST 更新当前工作摘要并返回新版本，任务记录的内容和版本保持不变。

#### Scenario: 记录与回退当前节点
- **WHEN** 调用方按当前版本设置 stage 为 requirements、design、planning-review、implementation、implementation-review、verification、acceptance 或 closeout
- **THEN** 应用 MUST保存该节点并保持其他专业事实不变，不校验执行顺序或要求前一节点通过
- **AND** 验证失败后 MUST允许记录 implementation 表达修复中的真实现场

#### Scenario: 保留与清除节点
- **WHEN** 调用方省略 stage、明确提交 null 或提交未知值
- **THEN** 应用 MUST分别保留原节点、清除节点或拒绝整个写入；旧数据缺少 stage MUST继续可读

#### Scenario: 入口与技能指引一致
- **WHEN** 智能体通过命令行记录 stage 或人在网页维护相同工作摘要
- **THEN** 两个入口 MUST共享枚举、版本与保留规则；技能指引 MUST说明记录实际节点，不按工具调用写流水
