## Why

智能体在真实执行中反复调用不存在的 `buildr task list`：本机 Buildr Dev 对话库的只读归属分析（本工作空间 387 次执行 / 74 个对话 / 13,662 条 shell 记录，2026-10-24 至 11-01，已排除分析对话自身）测得 51 次调用、涉及 43 次执行（占使用过 CLI 的 240 次执行的 18%），其中 31 次直接返回 `cli.unknown_command`。失败后 42/54 次执行退回 `task inspect <task-id>`（需要先知道标识），只有 10 次退回 `workbench`。

现有唯一列任务途径是 `buildr workbench inspect`，实测单次输出 53,221 字符，包含每个活跃任务的完整 v4 记录、工作摘要与偏好项，智能体普遍靠 `head` 截断使用。任务列表投影本身已经规范且已实现（`buildr.task-record-list/v7`、HTTP `GET /tasks`、Buildr Web 轻量列表），只有 CLI 缺少入口，使智能体付出一次失败往返或一次超大聚合读取。

本变更不包含破坏性变更：只新增一个只读命令，不改既有命令的输出、默认值或 schema。

## What Changes

- 同时兑现关联任务已授权的执行用量保留：归档保存已观察到的 contextUsage，不推测缺失的厂商用量。

- 新增只读 CLI 命令 `buildr task list`，复用既有 Task Record Application 的 `queryTasks` 与既有 `buildr.task-record-list/v7` 投影，与 HTTP `GET /tasks` 共用同一应用与同一投影，不发明新的数据语义。
- CLI 参数：`--status <open|todo|active|completed|abandoned|all>`、`--project <code>`、`--service <project/service>`、`--q <text>`、`--page-size <1..100>`、`--cursor <text>`、`--target <canonical-workspace>`、`--json`。
- **CLI 默认值有意区别于 HTTP**：CLI 默认 `status=open`、`pageSize=20`；HTTP `GET /tasks` 保持默认 `status=all` 且不分页。理由是当前工作空间 439 个任务中 428 个已 `completed`，无界默认列表约 35 万字符，对智能体既无用又昂贵。`open` 是既有规范定义的非持久化查询状态，不新增语义。默认值通过响应中既有的 `filters` 回显自描述，截断通过既有 `hasMore` / `nextCursor` 显式表达，不静默省略。
- `task list` 不接受 `<task-id>` 位置参数；`--json` 返回 v7 列表投影本身，不包裹 `buildr.task-record-result` 信封（列表不是单任务 mutation 结果）。非 `--json` 模式输出人类可读的紧凑列表（标识、状态、标题）。
- 列表 MUST NOT 返回 `brief` 正文，MUST NOT 暴露 database path、table、row id、SQL 或 storage internals，沿用 v7 既有约束。
- 命令 descriptor 由 Task 模块公开入口贡献，`surface` 为 `primary`，与 `task inspect` 一致；根帮助、`buildr task --help`、`buildr help task list` 与 `buildr task list --help` 均可查询。

明确不改：

- 不改 `buildr.task-record-list/v7` schema 本身，不改 HTTP `GET /tasks` 的行为与默认值，不改 Buildr Web。
- 不改写类命令的回显行为（`task work-context record`、`task verification record`、`task review record`、`task update`、`task create`）。`public-json-contracts` 现文明确要求它们回显完整 Result/record，约 150–250 处测试断言依赖该形状，且 work-context 契约正被活跃变更 `record-check-applicability` 扩展。属独立变更。
- 不改 `printCliError` 的 suggestions 派生规则。补上 `task list` 后该输入不再进入 unknown-command 路径；suggestions 的意图相关性单独评估。
- 不改 `workbench` 聚合命令。

## Capabilities

### New Capabilities

无。列表投影、`open` 查询状态与轻量列表要求均已由既有 capability 规范；本变更只把它暴露到 CLI。

### Modified Capabilities
- `agent-conversations`: 归档保留已观察的执行词元用量；不更改当前上下文用量口径。

- `cli-product-surface`：新增要求，CLI MUST 公开最小 Task 列表入口，并说明其与 `workbench` 聚合、`task inspect` 单任务读取的职责边界及帮助主题可达性。沿用同规范中 `buildr task review inspect|record` 入口要求的写法。
- `public-json-contracts`：`task list --json` 的公开 JSON identity 为 `buildr.task-record-list/v7`，不套用 `buildr.task-record-result` 信封；明确 CLI 默认 `status=open`、`pageSize=20` 必须在响应 `filters` 与分页字段中自描述。
- `product-source-layout`：注册 Task Record CLI 命令的场景中，descriptor 来源枚举纳入 `list`。

`task-record` 不需要增量：该规范已要求 `inspect/list` 只返回 SQLite authority 中真实存在的 Task、已把 `open` 定义为非持久化查询状态、并已要求轻量 query projection 来自唯一 authority；本变更新增的是 CLI 客户端入口，不改变这些要求的语义。

## Impact

- 实现：`services/buildr/src/modules/task/interfaces/cli/task.ts`（`TaskAction`、`TaskCommandRuntime`、`parseTaskCli` 的 usage / allowedByAction / 位置参数规则）、`services/buildr/src/modules/task/module.ts`（`createTaskCliContributions` descriptor 注册）。
- 复用不改：`services/buildr/src/modules/task/application/task-query-application.ts` 的 `queryTasks`、`services/buildr/src/modules/task/interfaces/http/task-http-schema.ts` 的 `listRequest` / `listResponse` 与 `PUBLIC_JSON_SCHEMAS.taskRecordList`。
- 命令面：`buildr help` 输出增加一条 primary 命令（当前 8,536 字符）；unknown-command candidates 自动包含 `task list`，因为它们消费同一合并目录。
- 测试：新增覆盖默认分页、`--status all`、`--json` 与非 JSON 输出、不返回 `brief`、不接受 `<task-id>` 位置参数的检查。按 `services/buildr/AGENTS.md` 的开发验证隔离要求，Workspace CLI 场景检查经 `tools/development/run-isolated-workspace-check.ts`，从 `npm run test:e2e` 选择。
- 关联正式任务：`cli-task-list-and-usage-retention`。

- 归档实现影响：buildr-agent 的 runOutcomes 类型及两处归档投影，兼容既有 generation，并新增跨轮替换后的持久记录回归。
