## REMOVED Requirements

### Requirement: Declaration Intake必须只编排Preparation与Verification声明
**Reason**: 删除独立声明接入技能（Skill），避免第三个测试中转步骤。
**Migration**: 准备声明归产品入口指引，测试能力登记归 project-testing，选择和报告归 project-verification。

### Requirement: 自动触发必须止于只读发现
**Reason**: 删除独立声明接入技能（Skill），避免第三个测试中转步骤。
**Migration**: 准备声明归产品入口指引，测试能力登记归 project-testing，选择和报告归 project-verification。

### Requirement: Intake必须把外部能力缺口交还原体系
**Reason**: 删除独立声明接入技能（Skill），避免第三个测试中转步骤。
**Migration**: 准备声明归产品入口指引，测试能力登记归 project-testing，选择和报告归 project-verification。

### Requirement: Verification Intake 必须发现当前测试地图候选
**Reason**: 删除独立声明接入技能（Skill），避免第三个测试中转步骤。
**Migration**: 准备声明归产品入口指引，测试能力登记归 project-testing，选择和报告归 project-verification。

### Requirement: 旧声明迁移必须由真实测试事实重建当前地图
**Reason**: 删除独立声明接入技能（Skill），避免第三个测试中转步骤。
**Migration**: 准备声明归产品入口指引，测试能力登记归 project-testing，选择和报告归 project-verification。

## ADDED Requirements

### Requirement: 声明维护必须由实际专业维护者直接承接
Buildr SHALL 不再交付独立 `declaration-intake` 技能（Skill）。项目准备声明 SHALL 由产品入口指引核对实际准备命令、根和范围后维护；测试地图 SHALL 由 `project-testing` 依据实际稳定入口维护。只读发现 SHALL 不自动写入声明，写入 SHALL 核对当前授权、准确对象及版本，未知外部能力 SHALL 交还原专业能力。

#### Scenario: 用户授权开发导致测试入口变化
- **WHEN** 当前授权范围内的测试入口增加、删除或变化
- **THEN** project-testing SHALL 核对真实覆盖并维护相应稳定声明，不要求经过独立接入技能（Skill）

#### Scenario: 新的外部副作用尚未授权
- **WHEN** 声明变化扩大外部副作用或长期语义且既有授权未覆盖
- **THEN** 智能体（Agent）SHALL 展示准确影响请求必要决定，并继续不依赖该决定的安全工作
