## ADDED Requirements

### Requirement: CLI 必须提供最小 Task 列表入口
Buildr CLI MUST 公开只读命令 `buildr task list`，把 canonical Workspace 中真实存在的 Task 以轻量列表投影返回给智能体（Agent）与人，并 MUST 只把解析后的过滤、分页与 canonical target 交给 Task Record Application。CLI MUST NOT 通过该入口创建、修改、激活、完成或放弃 Task，MUST NOT 返回 `brief` 正文，MUST NOT 扫描文件系统或读取复盘文档，MUST NOT 暴露 database path、table、row id、SQL 或 storage internals。

#### Scenario: 默认列出未终结任务
- **WHEN** 用户运行 `buildr task list --target <canonical-workspace> --json` 且未指定任何过滤或分页参数
- **THEN** CLI MUST 以 `status=open` 与 `pageSize=20` 调用与 HTTP `GET /tasks` 同一 Application query projection
- **AND** 响应 MUST 在 `filters` 中回显实际生效的默认值，使默认行为对调用方自描述
- **AND** 匹配结果超出单页时 MUST 通过 `hasMore` 与 `nextCursor` 显式表达截断，MUST NOT 静默省略剩余结果

#### Scenario: 显式过滤与翻页
- **WHEN** 用户提供 `--status`、`--project`、`--service`、`--q`、`--page-size` 或 `--cursor`
- **THEN** CLI MUST 把解析后的值原样交给 Application 校验，MUST NOT 自行实现第二套过滤、排序或分页语义
- **AND** 非法枚举值或越界 `--page-size` MUST 由 Application 拒绝并返回结构化诊断，MUST NOT 静默回退到默认值

#### Scenario: 拒绝任务标识位置参数
- **WHEN** 用户运行 `buildr task list <task-id>`
- **THEN** CLI MUST 以语法错误拒绝并返回该命令的 usage，MUST NOT 把该输入解释为单任务读取
- **AND** 单任务读取继续由 `buildr task inspect <task-id>` 承担，两个入口 MUST NOT 互相替代

#### Scenario: 查看 Task list help
- **WHEN** 用户运行根帮助、`buildr task --help`、`buildr help task list` 或 `buildr task list --help`
- **THEN** help MUST 说明该命令是只读轻量列表、默认 `status=open` 与 `pageSize=20`，以及 `--status all` 与 `--cursor` 的用法
- **AND** help MUST NOT 把它描述为 `workbench` 工作概览或 `task inspect` 的替代入口
