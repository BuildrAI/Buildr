## ADDED Requirements

### Requirement: Project context必须识别Preparation Declaration
Buildr MUST将已登记Project根的`preparation.yml`识别为可选Project context asset，保持Project ownership并独立于`capabilities.yml`、`commands.yml`和`verification.yml`。Project create、sync、Doctor或GET MUST不静默生成或更新该声明。

#### Scenario: Project没有Preparation Declaration
- **WHEN** 创建或诊断一个没有`preparation.yml`的Project
- **THEN** Project registry MUST保持有效
- **AND** Buildr MUST不根据Service目录内容自动写入声明

#### Scenario: 未登记Project目录包含声明
- **WHEN** `projects/`下未登记目录包含`preparation.yml`
- **THEN** Buildr MUST不把它当作已登记Project声明执行
- **AND** Doctor MAY按现有未登记资产政策报告目录事实
