## MODIFIED Requirements

### Requirement: service metadata 作为最小服务资产索引
Buildr MUST 将服务作为工作空间全局业务实现对象，使用根 `services/manifest.yml` 保存稳定身份、名称、说明、类型、唯一代码库实例引用和可选模块路径；项目关系由项目清单维护。

#### Scenario: Service entity 字段完整
- **WHEN** 多个项目引用服务
- **THEN** 系统 MUST 返回同一服务标识，不要求唯一 projectId

#### Scenario: 文件系统定位
- **WHEN** 系统定位服务代码
- **THEN** MUST 解析被引用的代码库实例及可选模块路径，不从项目目录拼接代码位置

#### Scenario: 封闭 schema 与规则边界
- **WHEN** 用户维护服务规则
- **THEN** 系统 MUST 从服务资产目录发现 AGENTS.md，并保留代码目录实际适用规则

#### Scenario: Attached Root文件系统定位
- **WHEN** 服务引用的代码库是附接来源
- **THEN** 系统 MUST 解析明确登记的绝对位置，不复制或移动外部代码

#### Scenario: Git 来源
- **WHEN** 服务引用 Git 代码库实例
- **THEN** 系统 MUST 从实例读取地址、远端和集成分支，不在服务重复登记

#### Scenario: 父实体关联
- **WHEN** 项目引用全局服务
- **THEN** 系统 MUST 核对工作空间及稳定标识，不要求唯一父项目

#### Scenario: 空服务集合
- **WHEN** 项目没有关联服务
- **THEN** 系统 MUST 接受空引用集合且不创建项目内独占清单

### Requirement: 共享服务通过 Project 表达
Buildr MUST 允许服务独立存在并由多个项目引用，不再要求为共享服务创建占位项目。

#### Scenario: 用户未说明 service 归属
- **WHEN** 用户登记服务而未指定项目
- **THEN** 系统 MUST 允许有效全局登记，且可稍后建立项目引用

#### Scenario: 共享服务 metadata
- **WHEN** 多个项目使用同一服务
- **THEN** 服务 MUST 在全局清单登记一次，项目仅保存稳定引用

#### Scenario: 共享服务默认目录
- **WHEN** 创建服务资产目录
- **THEN** 系统 MUST 使用 `services/<code>`，实际代码由被引用代码库定位

### Requirement: Service Git 声明与观察必须分离
Buildr MUST 将 Git 来源与集成分支归代码库实例维护，并将实际工作状态作为实时观察，通过服务引用提供。

#### Scenario: 读取 Git Service 详情
- **WHEN** 多个服务引用同一代码库实例
- **THEN** 系统 MUST 展示相同来源与集成基线，不复制独立可写 Git 声明

#### Scenario: 当前分支偏离 integration branch
- **WHEN** 当前代码目录分支与集成分支不同
- **THEN** 系统 MUST 展示差异，不自动切换、暂存、合并或丢弃内容
