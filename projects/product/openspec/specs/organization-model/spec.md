# Buildr Organization 模型

## Purpose

定义 Organization 作为 Buildr workspace 下最高所有权、规则和项目资产边界的语义与路径规范，统一个人、组织、客户、公司和企业治理场景。

## Requirements

### Requirement: Organization 作为一级所有权和规则边界
Buildr MUST 使用 Organization 表示最高层级的所有权、规则和项目资产边界；默认情况下，一个 Buildr root 即一个 Organization 上下文实例。

#### Scenario: 个人用户使用根组织上下文
- **WHEN** 个人用户在 Buildr root 中管理自己的项目
- **THEN** Buildr MUST 以该 root 表示该用户的默认项目资产边界

#### Scenario: 企业用户使用根组织上下文
- **WHEN** 企业组织在 Buildr root 中管理项目上下文
- **THEN** Buildr MUST 以该 root 表示企业、组织或客户的规则和资产边界

### Requirement: Buildr root 承载默认 Organization 资产路径
Buildr MUST 将 Buildr root 作为默认 Organization 资产路径，并在根目录通过 `AGENTS.md` 维护组织级 Rules，通过 `skills/`、`components/` 和 `commands/` 维护其他组织资产与项目入口。

#### Scenario: 组织级资产路径
- **WHEN** Buildr 表示当前 Organization 上下文的 Rules、Skills、Components 或 Commands
- **THEN** Rules MUST 位于 Buildr root 的 `AGENTS.md`
- **AND** Skills、Components 与 Commands MUST 分别位于 Buildr root 的 `skills/`、`components/` 和 `commands/` 下
- **AND** Buildr MUST NOT 将 `rules/` 或 `rules/manifest.yml` 表示为当前 Organization 规则资产路径
- **AND** Buildr MUST NOT 将 `practices/` 表示为独立 Organization 资产类型

#### Scenario: 项目级资产路径
- **WHEN** Buildr 表示当前 Organization 上下文下的项目
- **THEN** 项目资产 MUST 位于 `projects/<project>/` 下

#### Scenario: 共享服务路径
- **WHEN** Buildr 表示当前 Organization 上下文下的共享、基础或平台服务
- **THEN** 这些服务 MUST 归属某个 Project，并位于 `projects/<project>/services/` 下

### Requirement: Buildr 层级术语使用组织而非公司
Buildr MUST 在层级、路径、scope、模板和资产边界描述中使用“组织”或 `Organization`，不得使用“公司”或 `Company` 表示 Buildr 一级层级。

#### Scenario: 描述 Buildr 层级
- **WHEN** 文档描述 Buildr 的上下文层级
- **THEN** 层级 MUST 表示为框架、组织、项目、服务

#### Scenario: 描述现实企业
- **WHEN** 文档描述现实中的企业采用场景或法律公司主体
- **THEN** 文档 MAY 使用“公司”或“企业”，但 MUST NOT 将其作为 Buildr 层级名

### Requirement: 产品 MVP 基于 Organization 模型
Buildr 产品 MVP MUST 基于 root-as-Organization 模型设计初始化、项目创建、服务接入和诊断能力。

#### Scenario: 设计默认组织
- **WHEN** 产品 MVP 描述首次使用、个人使用或公司使用场景
- **THEN** MVP MUST 将用户选择的 Buildr root 视为默认 Organization 上下文

#### Scenario: 设计服务接入路径
- **WHEN** 产品 MVP 描述 service repo 接入和 service metadata
- **THEN** MVP MUST 使用 `projects/<project>/` 作为默认资产路径基础
