## ADDED Requirements

### Requirement: 日常任务边界检查必须动作就近且保持 Agent 判断
Buildr 内置任务 Skills MUST 在 Agent 即将写 Change checklist、调用 OpenSpec converge、选择 focused regression 或决定 exact Verification invocation 重执行时提供动作就近的最小检查。该 guidance MUST NOT建立新的状态、关键词门禁、自动 root 选择或基于效率指标的自动推进逻辑。

#### Scenario: Agent 写入 Change checklist
- **WHEN** Agent 创建或修订 `tasks.md`
- **THEN** guidance MUST要求立即逐项确认 checkbox 能否在 Change archive 前完成
- **AND** MUST不要求预读 Verification、Candidate、Completion、Finish 或 cleanup 的完整下游流程来填充 checklist

#### Scenario: identity 输入已经变化
- **WHEN** Content Target、verification declaration、capability set 或其他 invocation identity 输入已经变化
- **THEN** Task Verification guidance MUST把后续执行视为新 identity 的首次执行
- **AND** Agent MUST不重复播报“未传 `--retry`”；只有准备重执行 exact identity 或解释复用结果时才说明显式 retry 语义

#### Scenario: 团队提供窄任务耗时参考
- **WHEN** 用户或团队为一类任务提供耗时参考区间
- **THEN** Retrospective guidance MAY将其作为当前复杂度下的跟踪、评估和优化背景
- **AND** MUST不把该数值固化为通用产品阈值、Result 字段、gate 或自动缩减验证范围的依据
