# service-deployment-adapters Specification

## Purpose
规范部署适配器（Deployment Adapter）能力的当前边界：内置部署入口已暂停，服务运行页、目录、工作台与 service-runtime 命令及网页接口不暴露部署计划、提交和最近部署结果，本地运行不要求连接技能（Connection Skill）应用；用户已有部署配置、历史与通用连接程序（Program）保留，不因暂停部署能力自动删除。

## Requirements

### Requirement: 暂停内置部署入口
Buildr MUST NOT 在服务运行页、目录、工作台或 service-runtime 命令/网页接口暴露部署计划、提交和最近部署结果；MUST NOT 为本地运行要求连接技能应用。用户已有配置、历史和通用连接程序 MUST 保留，不因移除本模块部署能力自动删除。

#### Scenario: 本地运行不依赖部署
- **WHEN** 工作空间存在旧 QA 配置或没有任何部署连接
- **THEN** 本地运行独立可用，服务运行页面和接口不提供部署动作。
