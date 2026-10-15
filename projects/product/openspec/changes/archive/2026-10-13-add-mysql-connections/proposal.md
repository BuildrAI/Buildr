## Why

用户与智能体（Agent）当前无法复用 Buildr 中登记的数据库连接完成真实查询，用户还需要打开 DataGrip 搬运数据。本次把已经确认的连接设计落到最小可用实现：配置一次 MySQL 连接，两种入口均可查询。

## What Changes

- 增加工作空间（Workspace）连接管理，区分连接类别与具体类型，环境是自由填写的简单属性，首版接入 MySQL。
- 增加本机认证存储、连接测试，以及数据库、表、字段发现和只读查询能力。
- 智能体（Agent）通过 Buildr 命令行工具（CLI）使用已保存连接，页面通过同一应用层提供简单查询工具。
- 查询默认 100 行、最多 500 行；数据库展示选择不改变账号权限，支持当前数据库及 `database.table`。
- 采用已确认原型的连接列表、统一抽屉（Drawer）、数据库列表、查询编辑器和结果表格；按用户最新决定不建立查询结果接手或共享编辑功能。
- 不包含破坏性变更；生产修改仍走 DMP，其他系统在后续真实接入时扩展。

## Capabilities

### New Capabilities

- `external-connections`: 工作空间连接身份、配置维护、类型扩展、本机凭据与连接诊断。
- `mysql-query`: MySQL 结构发现、只读查询边界，以及用户页面和智能体（Agent）的调用入口。

### Modified Capabilities

无。

## Impact

- 后端新增 `src/modules/connections/`，在既有模块注册中装配，提供命令行工具（CLI）与 HTTP 入口。
- 前端新增 `features/connections/` 并接入工作空间导航，复用已有组件与主题。
- 新增 `mysql2` 和 `node-sql-parser` 运行依赖，随主包交付；不要求用户另装数据库客户端或部署额外工具服务。
- 为 Buildr 技能（Skill）补充连接发现与查询指引，并补充针对性存储、语法、真实 MySQL、页面和包消费验证。
- 原型来源与源码位置接续同一任务 `external-connections-design`；任务整体说明见[任务说明](@task/external-connections-design)。
