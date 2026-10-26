## REMOVED Requirements

### Requirement: Package必须投射Declaration Intake Skill
**Reason**: 清理旧分类、入口及技能职责，保留对应行为证明。
**Migration**: 由本变更四类检查、两个项目技能及同文件的新要求承接。

### Requirement: Task Verification Skill必须指导Agent直接验证并形成报告
**Reason**: 清理旧分类、入口及技能职责，保留对应行为证明。
**Migration**: 由本变更四类检查、两个项目技能及同文件的新要求承接。

## ADDED Requirements

### Requirement: 项目验证技能（project-verification）必须指导Agent直接验证并形成报告
Package MUST投射项目验证技能（project-verification），指导Agent探查项目测试体系、读取v4测试地图、结合用户请求、可选Task与当前改动选择具体测试，并直接使用Maven、npm、Playwright、Browser、HTTP或项目runner。Skill MUST区分开发反馈与开发完成验证；只有存在 active Task 的开发完成验证调用 `task verification record`，独立测试请求直接交付实际证据。

#### Scenario: 开发过程中运行测试
- **WHEN** Agent为当前修改运行focused单元或功能测试
- **THEN** Skill MUST指导Agent修复失败并继续开发
- **AND** MUST NOT记录Task Verification Report

#### Scenario: 开发完成
- **WHEN** Agent认为实现完成并准备验证
- **THEN** Skill MUST指导Agent先核对已有检查与当前内容、环境和目标的适用性，复用有效证据，只补充未覆盖的必要检查；扩大到完整回归 MUST具有改动影响、项目必需要求或明确未解决风险的依据
- **AND** 有 active Task 时形成包含选择理由、实际targets、结果、gaps和结论的报告后调用record；无任务时直接交付证据

#### Scenario: 已有检查仍适用
- **WHEN** 已有检查仍适用于当前成果且必需检查已通过，没有新改动、失败或明确未解决风险
- **THEN** Agent MUST 复用实际结果形成报告，不因进入完成阶段或登记报告重跑检查
- **AND** MUST 保留原执行事实并说明复用适用性，不把历史日志改写为新的执行事实

### Requirement: Package必须发现两个项目测试技能
Buildr package SHALL 交付 `project-testing` 与 `project-verification` 并移除旧 `task-verification` 和 `declaration-intake` 技能源、投射规则及现行引用。测试建设与登记 SHALL 路由 project-testing；选择、检查、执行和报告 SHALL 路由 project-verification。默认兼容能力 `buildr.task-verification/v4` SHALL 绑定新提供者，历史报告、任务应用命令与不相关用户自有能力 SHALL 不因名称调整被改写。

#### Scenario: 更新已有工作空间
- **WHEN** 用户按正常产品更新同步内置技能（Skill）
- **THEN** 当前内置来源 SHALL 发现两个项目测试技能（Skill），旧内置提供者 SHALL 按既有受管资产迁移机制退役，并保留用户自有内容

## MODIFIED Requirements

### Requirement: 核心规则与技能指引必须按实际影响控制工作量
随包核心规则 MUST在性能原则第 7 条末尾声明验证范围与改动影响匹配，并限定有效证据与必需检查已满足时的追加验证条件；MUST保持术语表达要求不变。`project-verification`、`task-triage`、`code-architecture`、`capability-adaptation` MUST使用简短且可区分的触发描述，正文保留决策与必要边界，较长的分支操作细节 MUST可按需读取。

#### Scenario: 局部修改无需完整架构地图
- **WHEN** 当前改动不涉及结构设计或跨模块重构，且用户未要求完整地图
- **THEN** `code-architecture` MUST只说明相关位置和影响，不强制输出完整目录、对象、方法及调用链地图

#### Scenario: 结构设计需要完整地图
- **WHEN** 用户要求结构设计、跨模块重构或完整代码地图
- **THEN** `code-architecture` MUST提供真实目录、主要对象、代表方法和关键调用链，区分当前与拟议结构

#### Scenario: 只选择检查而不登记报告
- **WHEN** 当前动作仅为选择和执行相关检查
- **THEN** `project-verification` MUST允许只读取选择指导，不要求预读报告登记或地图写入步骤

#### Scenario: 自有技能描述与分支读取
- **WHEN** 用户命中 Buildr 自有技能
- **THEN** 描述 MUST以具体目标和触发边界为主，入口 MUST只保留当前决策及按需参考；外部技能正文保持上游原文

#### Scenario: 诊断与组合验证复用
- **WHEN** 同步已返回最终诊断或已有组合验证仍覆盖当前成果
- **THEN** 指引 MUST消费已有结果，只在缺失、相关变化或明确未解决风险时补查；资源修改只核对实际影响的初始化、更新、安装或发布边界
