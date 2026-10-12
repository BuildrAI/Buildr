## MODIFIED Requirements

### Requirement: 任务关联入口清楚展示当前事实

任务无会话（Session）关系时 MUST 简洁显示“尚未关联会话”，不得默认展示确认流程、大块空态或不可操作入口。帮助 MUST 提供包含任务编号及工作空间定位的可复制指令。已关联任务 MUST 提供准确会话（Session）的打开与解除，关系展示 MUST 不依赖插件状态，旧请求 MUST 不阻塞长期关系。

#### Scenario: 空状态
- **WHEN** 任务没有会话（Session）关系
- **THEN** 任务页 MUST 简洁显示尚未关联并提供具体关联指令

#### Scenario: 已有关联无需面板
- **WHEN** 任务有准确关系且没有安装 Buildr 插件
- **THEN** 任务页 MUST 继续提供准确会话（Session）链接及管理操作

## ADDED Requirements

### Requirement: 智能体关联入口必须使用会话术语

相关界面、帮助与知识说明 MUST 用会话（Session）表示有身份及上下文的智能体工作单元，用对话表示交流内容。会话 MAY 持续保存或临时生成；统一名称 MUST NOT 合并 Codex 原生 thread 与 ACP session 的身份、协议、历史或生命周期，既有字段和命令参数 MUST 保持兼容。

#### Scenario: 关联与临时生成并存
- **WHEN** 用户查看任务关联或生成提交说明
- **THEN** 入口 MUST 使用会话用语，并区分 Codex 原生会话关联与独立临时生成，不暗示共用执行后台
