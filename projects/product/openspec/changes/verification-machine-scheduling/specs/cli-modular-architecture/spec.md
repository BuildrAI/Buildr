## ADDED Requirements

### Requirement: 版本身份查询必须独立于完整运行时装配
CLI的精确`version`、`version --json`、`--version`和`-V`身份请求 SHALL 沿用真实产品身份来源与现有输出，同时不创建完整应用运行时或装配无关命令。其他命令解析、失败反馈和Web接续捕获语义 SHALL 保持。

#### Scenario: 完整应用无法装配
- **WHEN** 版本查询所需的身份来源可读但完整应用bootstrap失败
- **THEN** 版本请求 SHALL 仍返回原身份结果，不依赖无关业务模块成功装配

#### Scenario: 非精确版本请求
- **WHEN** 参数不是受支持的精确版本形式
- **THEN** CLI SHALL 继续原命令解析和错误处理，不把任意参数解释成成功的版本查询
