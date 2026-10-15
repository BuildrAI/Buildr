## Why

服务故障调查目前依赖人打开 Kibana Discover、查询日志并向智能体（Agent）转述，重复搬运且容易丢失时间、服务与调用链上下文。现有连接（Connection）已经统一管理 MySQL、Nacos 的身份与本机认证，且已在授权测试环境验证 Kibana 8.5.1 可直接通过接口（API）查询，因此现在可以把日志查询作为同一体系中的专业工具交给不同智能体（Agent）复用。

## What Changes

- 在现有连接（Connection）中新增日志系统类别 `logs`、Kibana 类型 `kibana`，不创建独立日志连接注册表、日志数据库或新服务（Service）。
- 接受 Kibana 网站地址、用户名密码及默认数据视图（Data View）；不同环境使用不同连接编号，沿用环境属性、配置版本保护、本机加密认证及规范工作空间（Canonical Workspace）解析。
- 增加面向智能体（Agent）的视图发现、字段发现、有界日志搜索和分组统计命令；支持服务、命名空间（Namespace）、关键字、时间和调用链标识（Trace ID）条件，允许基于实际字段指定过滤，不依赖浏览器操作（Computer Use）。
- 基于 Node.js 原生 `fetch` 适配 Kibana 查询通道，明确内部接口（Internal API）的兼容范围、字段映射差异、超时、部分结果、截断及敏感信息遮蔽，不把登录成功或空结果当作调查完成。
- 在既有连接列表与编辑抽屉（Drawer）中增加 Kibana 配置、视图选择、查询能力测试和原网站入口，不实现另一套 Discover 页面。
- 更新现有 Buildr 技能（Skill）的外部连接使用指引，让智能体（Agent）在调查服务问题时主动发现合适连接并组合查询；不增加后台调度、固定故障处理流程或自动重启权限。
- 本次为增量能力，无破坏性变更（Breaking Change）；MySQL 与 Nacos 的现有配置、命令、认证和副作用边界保持不变。

## Capabilities

### New Capabilities

- `kibana-log-query`：Kibana 目标解析、视图与字段发现、只读日志查询和统计、结果边界、兼容诊断及智能体（Agent）自主使用。

### Modified Capabilities

- `external-connections`：在既有类别与类型模型中声明 `logs/kibana`，扩展统一配置界面、视图选择及打开原网站的行为，保留现有类型承诺。

## Impact

- 后端：`services/buildr/src/modules/connections/` 的提供者（Provider）注册、专业应用、命令行接口（CLI）及配置发现接口（API）；复用 `ConnectionRepository`，不增加存储迁移。
- 前端：`services/buildr-web/src/features/connections/` 的类型、表单、显示与客户端（Client）；不新增导航页面，不涉及 DSH 插件。
- 智能体（Agent）入口：`services/buildr/resources/runtime/skills/buildr/references/external-connections.md`；不引入额外模型上下文协议（MCP）服务或第三方命令行工具依赖。
- 检查：补充 Kibana 查询、字段映射、认证边界、结果完整性和前端配置测试，回归 MySQL/Nacos 邻近检查；真实测试环境验证仅使用明确授权的本机连接，生产兼容性单独验证。
- 当前知识：实现后校准已有技术架构与代码地图（Code Map）中的连接职责及来源，规划阶段不把候选能力写成已交付事实。
- 本轮只形成方案、架构、增量规范和实施清单；现有外部探索不等同于产品已实现。任务整体范围见[任务说明](@task/kibana-log-connection)。
