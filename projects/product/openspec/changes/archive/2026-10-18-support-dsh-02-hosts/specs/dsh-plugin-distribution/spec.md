## ADDED Requirements

### Requirement: DSH 宿主兼容范围独立于精确构建来源

Buildr DSH 正式插件（Plugin）、开发插件（Plugin）及其组合内组件 MUST 声明支持 DSH `>=0.2.0-0 <0.3.0-0`，包含 0.2.x 系列稳定版与预发布版；所有 DSH 系列宿主依赖（peer dependency）MUST 一致，MUST NOT 因构建来源为精确 `0.2.0-rc.2` 而拒绝同系列宿主。软件开发工具包（SDK）的上游版本、提交、补丁和产物摘要 MUST 继续精确核验，MUST NOT 用兼容范围替代来源证明。

#### Scenario: 升级同系列预发布宿主

- **WHEN** 插件由精确 `0.2.0-rc.2` 来源构建，宿主升级为 DSH `0.2.1-rc.2`
- **THEN** 正式版、开发版与组合内组件的宿主兼容声明 MUST 允许该版本
- **AND** 构建来源记录 MUST 仍保留真实精确版本与摘要

#### Scenario: 系列边界

- **WHEN** 按 DSH 的包含预发布版本语义匹配宿主声明
- **THEN** `0.2.0-rc.2`、`0.2.1`、`0.2.99-rc.1` MUST 匹配
- **AND** `0.1.99`、`0.3.0-alpha.1`、`0.3.0` MUST 不匹配
