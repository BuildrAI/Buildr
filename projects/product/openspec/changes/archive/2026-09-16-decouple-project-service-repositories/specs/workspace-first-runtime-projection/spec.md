## ADDED Requirements

### Requirement: 平级服务与代码库规则作用域
规则发现 MUST 支持 `services/<code>` 与 `repositories/<code>` 及其子目录，沿实际目录读取组织根及局部规则；项目引用不自动建立唯一父项目规则链。

#### Scenario: 共享代码规则
- **WHEN** 多个项目服务引用同一代码库实例
- **THEN** 规则发现 MUST 保持代码库真实祖先规则，任务所需项目规则由明确上下文选择，不合并所有引用方

#### Scenario: 路径边界
- **WHEN** 规则作用域穿越工作空间或符号链接
- **THEN** 系统 MUST 拒绝相关访问，不降低原有路径保护
