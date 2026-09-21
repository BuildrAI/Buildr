# task-work-context Specification

## Purpose
为任务（Task）补充跨页面和智能体（Agent）可接续的当前工作摘要与明确需要人处理的事项，独立维护进展、下一步和人的答复，以版本保护避免覆盖并保持任务四态、结果及专业报告的独立权威。

## Requirements

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

### Requirement: 待处理事项必须显式表达
关注事项 MUST 有稳定身份、`decision|acceptance|question` 类型、原因、创建时间与 `pending|resolved` 状态。事项只来自明确登记，不由任务状态、子项数量、缺失报告或过期记录推断。新请求、保留旧请求和清除请求 MUST 可明确区分。

#### Scenario: 更新摘要保留用户答复
- **WHEN** 智能体只更新进展且未提供关注事项字段
- **THEN** 现有事项与答复 MUST 保持不变。

#### Scenario: 新请求替换
- **WHEN** 调用方按当前版本明确登记新请求
- **THEN** 应用 MUST 创建新的事项身份，旧答复不得冒充新请求的答复。

### Requirement: 人的答复使用观察版本保护
用户回应当前待处理事项时 MUST 提供观察到的摘要版本、事项身份和非空答复。成功后 MUST 保留答复、时间和已处理状态，供智能体后续读取；不得把回应解释成通用操作授权或任务完成。

#### Scenario: 记录决定后继续工作
- **WHEN** 用户对当前待处理事项保存意见
- **THEN** 事项 MUST 从待处理集合移出，答复仍可读且任务状态不变。

#### Scenario: 并发更新或重复答复
- **WHEN** 事项已改变、已经处理或摘要版本陈旧
- **THEN** 应用 MUST 返回冲突并保留已成立的答复，界面要求重读，不静默覆盖或重放。

### Requirement: 网页与命令行共享契约
当前工作摘要 MUST 提供读取、记录、回应的命令行（CLI）与应用接口（API），共享严格输入校验、版本冲突与工作空间隔离。类型与客户端（Client） MUST 来自唯一接口契约。智能体使用指引 MUST 说明何时记录真实进展、如何提出事项以及如何读取人的答复。

#### Scenario: 两个入口接续
- **WHEN** 智能体登记事项、用户在网页回应后智能体再次读取
- **THEN** 两个入口 MUST 看到同一当前答复和版本。

#### Scenario: 非法请求
- **WHEN** 请求包含未知字段、错误身份、越界输入或不合法写入会话
- **THEN** 服务 MUST 在相关写入前拒绝，保留原有错误与安全优先级。
