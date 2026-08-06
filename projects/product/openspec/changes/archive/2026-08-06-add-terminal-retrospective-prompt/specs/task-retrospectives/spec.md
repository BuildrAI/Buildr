## MODIFIED Requirements

### Requirement: Task Retrospective 只基于当前可见证据
`task-retrospective` Skill MUST 让 Agent 基于当前 session/runtime 可访问的任务步骤与结果，识别执行时间、token 消耗、重复尝试、等待和人机协作中的高成本点，并推理可落地的优化方向；Skill MUST NOT 要求或声称读取隐藏推理、完整对话、完整工具日志或后台任务事件，也 MUST NOT 为补齐 Token 数字新增上下文回放、强制估算或采集流程。

#### Scenario: 可见精确成本数据
- **WHEN** 当前上下文提供可信的 Token 数
- **THEN** Agent MUST 在报告中记录该数值、数据来源和覆盖范围
- **AND** MUST 只把该覆盖范围内的数据用于定量判断

#### Scenario: Token 数据部分可得
- **WHEN** 当前上下文只提供部分步骤、阶段或模型调用的可信 Token 数
- **THEN** Agent MUST 记录可得数值、数据来源和实际覆盖范围
- **AND** MUST 明确该数值不代表完整 Task 消耗

#### Scenario: Token 数据不可得
- **WHEN** 当前上下文不能提供可信 Token 数
- **THEN** Agent MUST 将 Token 数据标记为缺失
- **AND** MUST 继续使用可观察的耗时、重复尝试、等待、工具调用和人机协作事实完成复盘
- **AND** MUST NOT 伪造精确数值或仅为补齐 Token 数据增加任务消耗

#### Scenario: 精确成本数据不可见
- **WHEN** 当前上下文不能提供完整耗时或其他精确成本数据
- **THEN** Agent MUST 明确数据缺口并只使用可观察事实与标明的推断
- **AND** MUST NOT 伪造精确数值

#### Scenario: 保持自由推理空间
- **WHEN** Agent 生成第一版复盘
- **THEN** capability MUST 只要求一份自由 Markdown 报告
- **AND** MUST NOT 强制评分、固定问题分类、候选列表或结构化优化项
