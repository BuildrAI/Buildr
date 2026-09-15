## ADDED Requirements

### Requirement: 安装查询与更新应用必须返回结构化结果
安装状态和 CLI 更新 Application MUST接收结构化输入并返回结果；所属 CLI Interface MUST拥有参数校验、输出格式和退出码。HTTP 等非命令消费者 MUST直接消费结构化能力。

#### Scenario: 调用安装状态或更新入口
- **WHEN** 执行本场景
- **THEN** 公开参数、JSON schema、人类输出、错误、退出行为与既有更新副作用 MUST保持等价，直接应用调用 MUST不写标准输出或进程退出码。
