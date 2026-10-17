## MODIFIED Requirements

### Requirement: 发布模块必须保持唯一owner与窄consumer边界
本条既有主包上下文（Context）和完整产品候选（Product Candidate）只用于主包相关证明，MUST NOT 强迫仅插件（Plugin）选择生成主包公开产物（Artifact）。逐包候选（Candidate）、发布事实与恢复继续由各自所有者（Owner）维护；共享选择只组合准确目标事实，不建立第二权威。

发布流程与发布专用代码 MUST 随组织自有 `buildr-release` 技能（Skill）维护，负责固定选择、准确原包生产、就绪核对、公开与恢复。既有产品验证框架 MUST 负责全部检查、定义与选择、输入、结果复用、执行及完整覆盖汇总，消费相同的不可变原包。本机与 GitHub MUST 调用同一份权威代码及检查定义。发布模块 MUST 只读取任务与工作树所需的窄事实，不读取旧 Task Development 或 Finish repository，不建立旁路状态库，也不复制产品候选模型。

#### Scenario: 模块消费其他owner事实
- **WHEN** release readiness需要任务关联
- **THEN** consumer MUST调用Task Record与Worktree的窄read model并核验真实Git/发布facts
- **AND** MUST不恢复Development/Finish compatibility role或建立旁路store

#### Scenario: 发布后维护部分失败
- **WHEN** Publication已成立但Activation、具体资源cleanup、Diagnostics或dev provenance reconciliation失败
- **THEN** 系统 MUST保留Publication并按失败owner报告恢复动作
- **AND** MUST不需要或恢复legacy Task Finish Application

#### Scenario: 发布代码或检查修复
- **WHEN** 智能体在所选源码检出位置检查、准备或恢复发布
- **THEN** 技能随附脚本 SHALL 调用既有验证框架，只补必要缺项并保留原始来源
- **AND** 只有产品或真实构建输入变化才使相关原包失效，验证来源不得取得公开执行权限
