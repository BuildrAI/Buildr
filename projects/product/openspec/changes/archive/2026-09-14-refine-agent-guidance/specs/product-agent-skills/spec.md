## MODIFIED Requirements

### Requirement: 核心规则与技能指引必须按实际影响控制工作量
随包核心规则 MUST在性能原则第 7 条末尾声明验证范围与改动影响匹配，并限定有效证据与必需检查已满足时的追加验证条件；MUST保持术语表达要求不变。`task-verification`、`task-triage`、`code-architecture`、`capability-adaptation` MUST使用简短且可区分的触发描述，正文保留决策与必要边界，较长的分支操作细节 MUST可按需读取。

#### Scenario: 局部修改无需完整架构地图
- **WHEN** 当前改动不涉及结构设计或跨模块重构，且用户未要求完整地图
- **THEN** `code-architecture` MUST只说明相关位置和影响，不强制输出完整目录、对象、方法及调用链地图

#### Scenario: 结构设计需要完整地图
- **WHEN** 用户要求结构设计、跨模块重构或完整代码地图
- **THEN** `code-architecture` MUST提供真实目录、主要对象、代表方法和关键调用链，区分当前与拟议结构

#### Scenario: 只选择检查而不登记报告
- **WHEN** 当前动作仅为选择和执行相关检查
- **THEN** `task-verification` MUST允许只读取选择指导，不要求预读报告登记或地图写入步骤

#### Scenario: 自有技能描述与分支读取
- **WHEN** 用户命中 Buildr 自有技能
- **THEN** 描述 MUST以具体目标和触发边界为主，入口 MUST只保留当前决策及按需参考；外部技能正文保持上游原文

#### Scenario: 诊断与组合验证复用
- **WHEN** 同步已返回最终诊断或已有组合验证仍覆盖当前成果
- **THEN** 指引 MUST消费已有结果，只在缺失、相关变化或明确未解决风险时补查；资源修改只核对实际影响的初始化、更新、安装或发布边界
