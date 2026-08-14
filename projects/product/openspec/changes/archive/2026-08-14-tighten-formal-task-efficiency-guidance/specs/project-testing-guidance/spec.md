## ADDED Requirements

### Requirement: 共享 helper 改动必须优先运行最低成本兼容 canary
Agent 修改被多个 action、状态或公共入口复用的 validation/helper 时，Project Testing guidance MUST要求先检查完整调用面，并从现有 tests 与可用 changed-plan reasons 中选择至少一个能证明既有公共行为的最低成本兼容 canary。focused regression MUST作为 Development feedback，且 MUST NOT替代最终 Task-affected 或 Candidate Formal Verification authority。

#### Scenario: 通用必填字段 helper 覆盖多个 action
- **WHEN** 一次变更收紧共享 required-field helper，但需求只针对部分 action
- **THEN** Agent MUST检查其他调用 action 的既有错误类型、诊断顺序或公共结果
- **AND** MUST在扩大到完整 System group 前优先运行一个已存在且能够区分兼容回归的最低成本 canary

#### Scenario: changed plan 提供 owner reasons
- **WHEN** Project 的 plan-only 输出已经把共享 owner 映射到受影响测试并提供 reasons
- **THEN** Agent MUST使用这些 reasons 选择 focused canary并说明其覆盖的旧行为
- **AND** MUST不把 plan preview 或 canary 结果冒充 Formal Verification Result

#### Scenario: 单个 canary 无法证明调用面
- **WHEN** 调用面检查发现多个独立公共边界，且一个既有测试不能覆盖主要风险
- **THEN** Agent MUST按最低充分原则扩展 focused regression
- **AND** MUST不为了追求固定低耗时而遗漏已识别兼容路径
