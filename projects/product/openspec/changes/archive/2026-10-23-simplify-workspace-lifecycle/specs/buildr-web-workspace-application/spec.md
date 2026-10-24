## MODIFIED Requirements

### Requirement: 新增 Workspace 必须生成可复制 Agent prompt
Buildr SHALL 保留可复制智能体（Agent）指令作为可选能力，并提供选择本机目录后直接初始化、登记与准备的主要入口。普通添加 MUST NOT 要求用户复制指令、理解同步或运行时投射。

#### Scenario: 添加普通目录
- **WHEN** 用户选择目录并确认名称
- **THEN** MUST 自动初始化、登记、准备入口和检查结果，成功后说明选择该目录即可开始新对话

#### Scenario: 已有目录或准备失败
- **WHEN** 目录已有身份或之前准备失败
- **THEN** MUST 接续同一身份并允许重试，MUST NOT 重复登记或覆盖未知用户内容

#### Scenario: 生成 Workspace 新增 prompt
- **WHEN** 用户选择可选智能体指令并填写名称、说明和位置
- **THEN** MUST 返回可复制指令并保留目标核对与授权说明

#### Scenario: 复制 prompt
- **WHEN** 指令复制成功
- **THEN** MUST 说明复制不等于创建

### Requirement: 新 Workspace 动作必须统一表达为交给 Agent
全局目录 SHALL 提供直接添加工作空间入口；可选智能体（Agent）指令仍不得把复制冒充创建。顶栏交给智能体按钮 SHALL 仅在进入某空间后显示。

#### Scenario: 目录中添加
- **WHEN** 用户打开全局目录
- **THEN** MUST 能选择本机目录、确认并查看真实准备及失败重试结果

#### Scenario: 生成新 Workspace prompt
- **WHEN** 用户选择可选指令入口
- **THEN** MUST 调用既有指令生成能力并展示完整结果

#### Scenario: 复制新 Workspace prompt
- **WHEN** 指令被复制
- **THEN** MUST 保留当前空间上下文并说明尚未创建

#### Scenario: 顶栏交给 Agent 仅在工作空间内显示
- **WHEN** 用户停留在全局目录
- **THEN** MUST 隐藏顶栏交给智能体按钮并保留直接添加入口
