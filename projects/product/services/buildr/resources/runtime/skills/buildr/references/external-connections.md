# 连接与 MySQL 查询

Buildr 统一管理外部系统连接（Connection）；类别 `category` 与具体类型 `type` 区分，环境 `environment` 是自由填写的属性。当前首个提供者支持 `category: data-source`、`type: mysql`；MySQL 地址、用户和默认数据库位于 `config`。下文配置与 `credentials: {password}` 是 MySQL 示例，通用连接不固定认证字段。新类型需增加专业提供者（Provider）校验配置、认证并提供专用工具；Nacos、Kibana、DMP 等尚未对接。

## 使用已保存连接

先确认目标工作空间（Workspace），读取连接列表，从名称、环境与地址核对目标，使用返回的稳定编号。智能体（Agent）在本机直接调用查询工具，不要求用户再次提供密码或手工执行。只读查询不创建任务，也不要求先运行 Doctor。

```text
buildr connection list --target <workspace> --json
buildr connection databases --connection <id> --target <workspace> --json
buildr connection tables --connection <id> --database <database> --target <workspace> --json
buildr connection columns --connection <id> --database <database> --table <table> --target <workspace> --json
buildr connection query --connection <id> --database <database> --sql-file <query.sql> --target <workspace> --json
```

结合用户描述、代码和实际结构自行选择查询，不要求用户提前知道库表。`query` 的 `--sql` 与 `--sql-file` 二选一；输入文件使用 UTF-8，`--sql-file -` 从标准输入读取。未传 `--database` 使用连接默认库，`--database ""` 明确不设当前库；`database.table` 可引用同一连接账号有权访问的其他库。页面的启用库选择不限制发现范围或数据库权限。

查询只支持单条只读查询语句（SQL），包括支持范围内的 SELECT 和只读公共表表达式（CTE）。未设最外层 LIMIT 时补充 100，显式 1—500 保留，超过 500 拒绝。需要更多数据时收窄条件或显式调整 OFFSET，不自动抓取所有页或统计全量。

命令行工具（CLI）成功输出 `schemaVersion: "buildr.connection-result/v1"` 和当前动作 `operation`。查询读取 `submittedSql`、`executedSql`、`columns`、`rows`、`rowCount`、`rowLimit`、`elapsedMs` 和 `limitReached`。行数组按列数组位置对应，列名可能重复；大整数与小数保留返回文本精度。`limitReached: true` 只表示达到本次行数限制，不能据此判断全部数据或是否还有下一页。执行限制为 10 秒、结果容量 4 MiB；超时、超容量或当前语法不支持时明确失败，保留原输入，根据问题调整查询，不伪称已取回完整数据。

## 管理连接与本机认证

用户可在 Buildr“连接”页面通过统一抽屉（Drawer）新增、编辑或测试。命令行工具（CLI）使用 `create|update --file <json-file>`；文件字段为 `{name,category,type,environment,config,credentials?:{password}}`。只在本机文件或标准输入中提交认证，不把密码写入命令参数、仓库、提示词（Prompt）或任务正文。已保存连接只返回 `hasCredentials`，不返回认证值。

```text
buildr connection create --file <local-input.json> --target <workspace> --json
buildr connection update --connection <id> --expected-revision <revision> --file <local-patch.json> --target <workspace> --json
buildr connection test --connection <id> --target <workspace> --json
buildr connection remove --connection <id> --expected-revision <revision> --target <workspace> --json
```

编辑省略 `credentials` 保留已有认证，`credentials: {password: ""}` 表示显式空密码。地址、端口或用户名变化必须重新提供认证。修改和删除使用刚读取的 `revision`；冲突后重新读取并判断，不覆盖其他入口修改。删除只解除登记和本机认证，不删除数据库内容。

连接元数据及页面选库偏好保存在本机工作空间（Workspace）的 `.buildr/local/workspace.sqlite`，不通过 Git 共享；各人自行配置连接。旧 `connections/manifest.yml` 在首次使用时完整、幂等导入，保留连接编号和已有本机认证。导入成功后原文件只作恢复来源，不再读取或双写；遇到迁移冲突或存储错误保留现场，不手工删除数据库或用旧清单覆盖新事实。

同一工作空间（Workspace）的代码工作树（Worktree）解析到同一规范连接来源，不自动产生独立数据库。本机认证与执行机器绑定，具备相应网络访问条件后才可调用。配置保存、认证绑定与实际测试成功分别核对；单个连接失败不阻断其他连接或无关工作。

首版仅提供普通 MySQL TCP 连接及只读查询，账号原生权限继续有效；本场景的生产修改继续走已有 DMP，当前工具不提供审批提交。人可在 Buildr 页面独立编写和运行查询，选中单条语句优先，否则运行光标所在语句；长字段可点击查看全文。页面初始不启用任何库，已选择的启用库和当前库会保存并恢复；这些偏好不改变连接版本或工具权限。查询结果不自动保存或共享，也不设计接手流程。
