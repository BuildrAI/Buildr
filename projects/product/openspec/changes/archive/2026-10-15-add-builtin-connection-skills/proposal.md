## Why

新连接架构已支持完整技能（Skill）声明与执行，但 MySQL、Kibana、XXL-JOB 仍依赖旧连接实现。现在需要交付三个可随包安装的内置连接技能（Connection Skill），并让独立 MySQL 查询工具使用新实例，避免配置成功却无法查询。

## What Changes

- 新增三个完整内置接入，包含声明、方法及必要专业程序，复用精确绑定、认证交接、只读槽位和既有分发。
- MySQL 连接技能负责接入、测试及数据库发现；查询工具作为独立内置能力（Builtin）提供命令和页面，继续复用只读执行约束与现有布局。
- Kibana 保留视图、字段、搜索和统计；XXL-JOB 保留服务定位、任务维护及执行日志，专业关联和授权记录由专业程序维护。
- 为新 MySQL 实例提供明确版本的查询适配及独立本机偏好，不影响旧路径，不自动导出或迁移原认证；本次无破坏性变更。

## Capabilities

### New Capabilities

- `builtin-connection-skills`: 三个内置连接技能的完整交付、独立程序、专业保护和接续方法。

### Modified Capabilities

- `mysql-query`: 独立查询工具消费新架构显式绑定实例，保持旧查询、界面与本机偏好边界。

## Impact

产品 `resources/workspace/skills/connections/`、资源清单、独立 `mysql-query` 模块、必要内部连接访问端口、应用装配、查询页面适配和对应测试。本任务只追加最小连接访问端口，不重写通用存储、制作指南或 Nacos，避开并行任务。真实验收使用用户允许的集鲜 QA 连接做有界只读操作；调度写入、触发和生产操作只进行模拟保护验证。
