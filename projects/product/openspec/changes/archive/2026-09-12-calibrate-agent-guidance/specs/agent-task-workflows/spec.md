## MODIFIED Requirements

### Requirement: 日常正式任务引导必须按阶段装配上下文
本条研发顺序仅约束显式采用的研发能力；收尾独立触发，MUST不消费研发交接或通过 task next 推荐，已有验证能力只保护自身动作。
Buildr 内置任务 Skills MUST 引导 Agent 只在当前动作成为 next executable action 时读取该动作所需的 Skill、capability contract、selected provider 与直接 authority，并 MUST 将后续阶段的专业上下文延后到对应动作开始前。该引导 MUST NOT允许跳过已触发 Skill、required Rule、provider contract、授权或 result evidence。

#### Scenario: Triage 正在选择任务路径
- **WHEN** Agent 正在判断语义治理、执行形态、repository set 与下一 provider action
- **THEN** `task-triage` MUST只要求读取当前分支决策和立即执行动作所需的 binding
- **AND** MUST不要求在 proposal 前预先读取 Verification、Completion 等尚未到达阶段的完整 provider 指引

#### Scenario: 已具备进入 proposal 的事实
- **WHEN** 用户已授权实现，Task、Environment 与 Development begin 所需事实已经完整
- **THEN** guidance MUST引导 Agent 进入 proposal 或当前首个研发动作
- **AND** MUST不因收集非当前阶段信息、预读下游 Skills 或建立额外进度 authority而延迟该动作

#### Scenario: 首次修改前建立 source map
- **WHEN** Agent 准备修改 proposal、Skill、代码、测试或当前知识
- **THEN** guidance MUST按实际影响核对直接相关实现和约束；小改动不要求遍历规范、知识、测试与登记信息，涉及行为、职责或权威来源变化时才扩大调查并形成有界来源图（Authority Source Map）
- **AND** 后续 MUST只在 scope、authority 或相关事实变化时增量刷新，不得把该 map 写成新的产品 authority或反复全量扫描
