## ADDED Requirements

### Requirement: 日常正式任务引导必须按阶段装配上下文
Buildr 内置任务 Skills MUST 引导 Agent 只在当前动作成为 next executable action 时读取该动作所需的 Skill、capability contract、selected provider 与直接 authority，并 MUST 将后续阶段的专业上下文延后到对应动作开始前。该引导 MUST NOT允许跳过已触发 Skill、required Rule、provider contract、授权或 result evidence。

#### Scenario: Triage 正在选择任务路径
- **WHEN** Agent 正在判断语义治理、执行形态、repository set 与下一 provider action
- **THEN** `task-triage` MUST只要求读取当前分支决策和立即执行动作所需的 binding
- **AND** MUST不要求在 proposal 前预先读取 Verification、Completion、Finish 等尚未到达阶段的完整 provider 指引

#### Scenario: 已具备进入 proposal 的事实
- **WHEN** 用户已授权实现，Task、Environment 与 Development begin 所需事实已经完整
- **THEN** guidance MUST引导 Agent 进入 proposal 或当前首个研发动作
- **AND** MUST不因收集非当前阶段信息、预读下游 Skills 或建立额外进度 authority而延迟该动作

#### Scenario: 首次修改前建立 source map
- **WHEN** Agent 准备修改 proposal、Skill、代码、测试或当前知识
- **THEN** guidance MUST要求从直接相关的 canonical specs、current knowledge、实现、测试与 registry 建立一次有界 authority source map
- **AND** 后续 MUST只在 scope、authority 或相关事实变化时增量刷新，不得把该 map 写成新的产品 authority或反复全量扫描

### Requirement: 验证范围引导必须保持计划预览与正式 evidence 分离
Buildr 任务 Skills MUST 在 Project 已提供 plan-only 或 dry-run 能力时，引导 Agent先消费该计划以判断 affected 范围、成本与补充风险，再选择必要的反馈和正式 capability；计划预览 MUST NOT作为 Verification evidence、Result fact或跳过 required capability 的依据。Project 未提供计划入口时，guidance MUST允许 Agent依据变更路径、declaration 与风险作出有证据的范围判断，不得因此阻塞。

#### Scenario: Project 提供验证计划预览
- **WHEN** Project registry 或现有命令提供不会执行测试的 affected plan
- **THEN** Agent MUST在追加 broad transient verification 前先读取该计划
- **AND** MUST结合计划覆盖与任务风险决定是否需要额外反馈，避免仅凭习惯重复整套测试

#### Scenario: 进入正式 Verification
- **WHEN** stable Content Target 已形成且 Development policy 要求正式 capabilities
- **THEN** Task Verification MUST实际执行或复用符合 invocation 语义的 required capabilities，并由 Application维护 current Result
- **AND** 先前 plan preview、CLI 输出或 Agent 推理 MUST不替代该 execution 与 repository authority

#### Scenario: Project 没有计划预览能力
- **WHEN** Project 只声明可执行 verification capability而没有 plan-only 或 dry-run 入口
- **THEN** Agent MUST基于实际变更、declaration applicability 与已识别风险选择范围
- **AND** guidance MUST不要求创建 planner、猜测命令或把缺少 preview 记录为 coverage gap

### Requirement: 日常任务效率指标必须保持非门禁
Buildr 内置任务 Skills MUST将 proposal 启动耗时、重复 Skill/authority 读取、重复命令、实现到 handoff 耗时与 verification wall-clock 仅作为 Task Retrospective 的跟踪、评估和优化参考。指标 MUST NOT进入专业 Result、Task Development gate、Task status、Candidate identity或自动 skip/advance 决策。

#### Scenario: 复盘发现任务耗时偏高
- **WHEN** Task Retrospective 使用已保存时点、execution timing或会话事实评估日常任务效率
- **THEN** Agent MAY据此提出 Skill guidance、工具或测试范围优化
- **AND** MUST不回写既有 Verification/Review Result、不改变 Task 完成事实，也不得把目标耗时解释为 pass/fail threshold

#### Scenario: 当前任务超过参考目标
- **WHEN** 某阶段实际耗时超过团队参考值但全部当前 authority 与 required action仍合法
- **THEN** workflow MUST继续依据专业事实和用户授权推进或阻塞
- **AND** MUST不因指标单独创建失败结果、跳过验证、降低审查范围或自动终止任务
