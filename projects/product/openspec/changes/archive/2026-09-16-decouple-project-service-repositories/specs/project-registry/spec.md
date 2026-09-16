## MODIFIED Requirements

### Requirement: Project registry remains separate from service metadata
Buildr MUST 在项目清单保存 `serviceIds` 引用，全局服务与代码来源信息 MUST 分别位于 `services/manifest.yml` 和 `repositories/manifest.yml`，不在项目条目复制。

#### Scenario: Project registry 不记录 services
- **WHEN** 两个项目使用同一个服务
- **THEN** 两个项目 MUST 引用同一稳定标识，服务与代码信息仅登记一次

#### Scenario: service create 不改变 Project source
- **WHEN** 用户创建服务或修改项目的服务引用
- **THEN** 系统 MUST 保持项目自身 source 不变

### Requirement: 新建 Project 必须初始化 canonical Service registry
新建项目 MUST 使用全局服务清单并保存空或明确选择的 `serviceIds`，不再创建项目内的独占服务清单。

#### Scenario: 创建 Workspace Project
- **WHEN** 用户创建项目且未选择服务
- **THEN** 系统 MUST 创建有效项目并允许稍后维护关联

#### Scenario: Project 创建回滚
- **WHEN** 项目及其新增服务或代码库草稿任一步验证失败
- **THEN** 系统 MUST 保持提交前登记状态，不留下半完成引用
