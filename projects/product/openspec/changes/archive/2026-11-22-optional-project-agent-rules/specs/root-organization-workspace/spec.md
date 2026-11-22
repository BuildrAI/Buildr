## MODIFIED Requirements

### Requirement: 项目资产使用根 projects 目录
Buildr MUST 默认使用根 `projects/<project>/` 维护项目级业务资产，并使用 `projects/manifest.yml` 管理 Project 集合，但 MUST NOT 在 Project 下创建或维护 Skill 源目录。

#### Scenario: 创建项目
- **WHEN** 在没有全局服务（Service）及代码库实例（Repository Instance）清单的旧项目级布局中，Agent executes `buildr project create pig --target <root>`
- **THEN** Buildr MUST create `openspec/`、`services/` and `services/manifest.yml` under `<root>/projects/pig/`
- **AND** Buildr MUST NOT create `<root>/projects/pig/skills/`、`<root>/projects/pig/skills/manifest.yml` or `<root>/projects/pig/practices/`

#### Scenario: 项目规则按需维护
- **WHEN** 创建、同步或修复项目，或对项目进行诊断
- **THEN** Buildr MUST NOT 默认生成、补建项目 `AGENTS.md` 或因文件不存在报告基线缺失
- **AND** 已有项目规则 MUST 保持原文，并继续作为对应作用域的规则来源

#### Scenario: 未指定组织的 service 接入
- **WHEN** 在旧项目级服务（Service）布局中，Agent executes `buildr service create pig/freshx <repo-ref> --target <root>`
- **THEN** Buildr MUST attach that service to `<root>/projects/pig/` service metadata and default service repo directory
- **AND** service metadata MUST be written to `<root>/projects/pig/services/manifest.yml`
