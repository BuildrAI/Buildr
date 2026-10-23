# task-environments Delta Spec

## ADDED Requirements

### Requirement: 工作空间产物清单不是 Task Environment 资源注册

`task-environments` 禁止的统一环境应用、资源注册与总 cleanup MUST NOT 被理解为禁止有界的工作空间产物（Artifact）清单。Buildr MAY 提供逐项、描述性、可核验的产物登记与处置能力，前提是该能力不把登记设为任何工作的前置条件、不提供统一 Environment Application/Plan/Receipt/ready 状态、不执行总 cleanup，且逐项动作独立核验归属与授权。产物清单不满足这些条件时 MUST 按本规范原边界拒绝。

#### Scenario: 有界产物登记不构成环境前置

- **WHEN** 产物清单提供登记、发现、诊断与逐项清扫能力，且正常工作不依赖其中任何一项
- **THEN** 该能力 MUST 被允许存在
- **AND** 环境相关规范 MUST NOT 据"资源注册"字样禁止它

#### Scenario: 产物能力越界为统一环境管理

- **WHEN** 产物清单开始要求登记作为编辑、构建或交付的前置，或聚合为统一环境状态
- **THEN** 该行为 MUST 按统一 Task Environment 的既有边界拒绝
