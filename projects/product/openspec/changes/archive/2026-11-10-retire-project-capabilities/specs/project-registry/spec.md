## MODIFIED Requirements

### Requirement: Project registry 识别可选测试能力声明
Buildr MUST 将已登记 Project 的 `verification.yml` 识别为 Project context asset，并 MUST 保持该资产可选、跟随 Project ownership 且独立于技能配置。

#### Scenario: Project 没有测试声明
- **WHEN** Buildr 创建 Project 或诊断没有 `verification.yml` 的既有 Project
- **THEN** Project MUST 保持有效且默认 baseline MUST NOT 强制生成空声明
- **AND** Buildr MUST NOT 因缺失声明改变 `commands.yml` 或 Service registry

#### Scenario: Project 初始化测试声明
- **WHEN** Agent 经用户意图在已登记 Project 中创建 `verification.yml`
- **THEN** 声明 MUST 跟随该 Project 的实际 asset repo ownership
- **AND** workspace runtime render MUST NOT 把声明复制为 Skill source 或 Service repo 文件

#### Scenario: 未登记目录包含测试声明
- **WHEN** `projects/` 下未登记目录包含 `verification.yml`
- **THEN** Buildr MUST NOT 将其能力纳入有效 Project task context
- **AND** doctor MAY 报告未登记目录，但 MUST NOT 执行声明中的测试命令

### Requirement: Project context必须识别Preparation Declaration
Buildr MUST将已登记Project根的`preparation.yml`识别为可选Project context asset，保持Project ownership并独立于`commands.yml`和`verification.yml`。Project create、sync、Doctor或GET MUST不静默生成或更新该声明。

#### Scenario: Project没有Preparation Declaration
- **WHEN** 创建或诊断一个没有`preparation.yml`的Project
- **THEN** Project registry MUST保持有效
- **AND** Buildr MUST不根据Service目录内容自动写入声明

#### Scenario: 未登记Project目录包含声明
- **WHEN** `projects/`下未登记目录包含`preparation.yml`
- **THEN** Buildr MUST不把它当作已登记Project声明执行
- **AND** Doctor MAY按现有未登记资产政策报告目录事实

## REMOVED Requirements

### Requirement: Project 只引用 workspace 能力资产
**Reason**: 退役项目能力上下文，统一由工作空间管理技能和能力选择。
**Migration**: 安全空配置由同步清理，其他旧文件保留并报告退役，不自动扩大配置作用域；项目规则表达业务适用场景。

### Requirement: Project capability context 保持跨 Project 确定性
**Reason**: 退役项目能力上下文，统一由工作空间管理技能和能力选择。
**Migration**: 安全空配置由同步清理，其他旧文件保留并报告退役，不自动扩大配置作用域；项目规则表达业务适用场景。

## ADDED Requirements

### Requirement: 项目能力上下文退役并保全旧配置
Buildr MUST NOT 创建、修复或要求项目 `capabilities.yml`，MUST 保留非空需求/绑定、异常、未知字段与不安全文件且不自动迁移配置；同步 MUST 自动清理只有空需求/绑定及技能名单的安全旧文件。

#### Scenario: 新建或修复项目
- **WHEN** 创建、同步或修复一个项目
- **THEN** Buildr MUST NOT 生成 `capabilities.yml`
- **AND** 缺少此文件 MUST NOT 产生项目基线缺失诊断

#### Scenario: 已登记项目保留旧文件
- **WHEN** Doctor 发现旧 `capabilities.yml`
- **THEN** MUST 提示文件已退役且不参与能力选择
- **AND** 非空 requires/bindings 或不能安全识别的内容 MUST 给出 warning 和具体核对指引
- **AND** 只有技能名单或空字段 MUST 仅给出 info；MUST NOT 校验名单中的过期技能 ID
- **AND** Doctor MUST NOT 修改文件或自动创建工作空间绑定；同步只按安全预检执行清理

#### Scenario: 同步安全清理与版本保护
- **WHEN** 已登记且归属当前工作空间的项目旧文件为可安全识别的普通文件，只有空 requires/bindings 和技能 ID 名单
- **THEN** 同步 MUST 在既有事务内自动删除并报告准确路径，重复同步 MUST 不重复删除
- **AND** 删除前 MUST 复核观察到的文件身份与内容，变化时 MUST 保留新内容并停止对应写入
- **AND** 非空需求/绑定、未知字段、格式异常、符号链接、未登记目录和外部附加根 MUST NOT 被自动删除
- **AND** 同步后续失败时 MUST 按既有事务恢复已删除文件
