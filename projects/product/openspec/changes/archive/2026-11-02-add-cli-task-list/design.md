## Context

动机见 proposal.md 的 Why。这里只记录影响方案的当前事实与约束。

- 列表能力已经存在且已被规范：Application 侧 `queryTasks(targetRoot, input)` 返回 `PUBLIC_JSON_SCHEMAS.taskRecordList`，HTTP `GET /tasks` 与 Buildr Web 轻量列表都消费它，`workbench` 模块也已把它接为内部 `list`。CLI 是唯一缺少入口的客户端。
- `interfaceRuntime` 已经携带 `queryTasks`，CLI contribution 通过 `interfaceRuntime as TaskCommandRuntime` 注入；因此新增命令只需扩展 `TaskCommandRuntime` 类型与参数解析，不需要新增 Application 方法或 runtime port。
- `knowledge/docs/reference/json-contracts.md:68` 记录了 v7 的真实语义：默认按 `active → todo → completed → abandoned` 排序；**未提供分页参数的 Application 调用返回全部匹配 Task**；`open` 只是显式查询语义、不持久化；首批返回 `filterOptions`，cursor 后续批次返回 `filterOptions: null`。
- HTTP `listRequest.pageSize` 是字符串模式 `^(?:[1-9]|[1-9][0-9]|100)$`（query 参数天然是字符串），CLI 必须以同一类型交给同一 DTO 校验。
- 当前工作空间 439 个 Task，其中 428 个 `completed`、6 个 `active`、5 个 `abandoned`。
- CLI 参数解析器 `parseTaskCli` 目前要求恰好一个位置参数（`<task-id>`），并对每个 action 维护独立的 usage 与 allowed-argument 集合。

## Goals / Non-Goals

**Goals:**

- 让智能体（Agent）用一次有界读取取得「当前有哪些未终结任务」，替代一次失败往返或一次 53,221 字符的 `workbench inspect`。
- CLI 与 HTTP 共用同一 Application、同一投影与同一 schema，不产生第二套过滤、排序或分页语义。
- 默认值对调用方自描述，截断显式可见。

**Non-Goals:**

- 不改 v7 schema、不改 HTTP 默认值、不改 Buildr Web。
- 不改写类命令回显、不改 `printCliError` 的 suggestions 派生、不改 `workbench`。
- 不为 CLI 引入新的输出信封或新的 schema 版本。

## Decisions

### 决定 1：CLI 默认 `status=open`、`pageSize=20`，有意区别于 HTTP

HTTP 保持 `status=all` 且不分页。CLI 默认收敛为未终结任务且分页。

- 备选 A：与 HTTP 完全一致（`all`、不分页）。**否决**：Application 在无分页参数时返回全部匹配 Task，本工作空间将返回 439 条、约 35 万字符，比它要替代的 53,221 字符 `workbench inspect` 更糟。
- 备选 B：`status=all` + `pageSize=20`。因为排序是 `active → todo → completed → abandoned`，首页确实会先给出 11 个未终结任务，再补 9 个已完成任务。但它 `matchingTaskCount=439`、`hasMore=true`，对调用方呈现为「被截断的答卷」，会诱导翻页；而观测到的意图是定位当前工作，不是遍历历史。
- 备选 C（采纳）：`status=open` + `pageSize=20`。`open` 是 `task-record` 规范已定义的非持久化查询状态，不新增语义；结果通常一页装完，`hasMore=false`，是一次完整答卷。需要历史或全量时显式 `--status all`，需要更多时按 `nextCursor` 翻页。

默认值写在 CLI 层而不是 Application 层，HTTP 行为因此完全不变。默认值通过响应既有的 `filters` 回显，并在 help 中说明，不依赖调用方阅读实现。

### 决定 2：`--json` 直接返回 v7 投影，不包裹 `buildr.task-record-result` 信封

`task-record-result` 的 `operation`/`taskId`/`record`/`recordDigest`/`effects` 字段对列表没有意义，套用会需要一个新 schema 版本并产生第二套 identity。HTTP `GET /tasks` 已直接返回 v7；CLI 保持同一形状，使两个入口对同一投影可互换验证。

非 `--json` 模式输出紧凑人类可读列表（标识、状态、标题），沿用 `printTaskResult` 的既有分工：结构化模式写 stdout JSON，人类模式写摘要行。

### 决定 3：`list` 不接受位置参数，参数解析按 action 分支

`parseTaskCli` 现在硬性要求恰好一个位置参数。改为按 action 判断：`list` 要求零个位置参数，其余 action 保持恰好一个。这样 `buildr task list <task-id>` 得到明确语法错误与 usage，而不是被静默解释成单任务读取，避免与 `task inspect` 职责重叠。

### 决定 4：`--page-size` 以字符串交给同一 DTO 校验

CLI 把 `--page-size` 的原始字符串直接放入输入对象，由既有 `listRequest` 模式校验（`1..100`）。不在 CLI 侧另写数值范围判断，避免出现第二套边界规则；越界值由 Application 拒绝并返回结构化诊断。

## Risks / Trade-offs

- [CLI 与 HTTP 默认值不同，可能让调用方误判语义] → 默认值在响应 `filters` 中回显、在 help 中说明，并由 `public-json-contracts` 增量要求「MUST NOT 只存在于帮助文本」；HTTP 默认值不变，两者各自自描述。
- [`--status all` 下调用方可能翻页遍历 439 条，产生大输出] → `pageSize` 上限由既有 schema 固定为 100；help 明确默认是 `open`，全量属显式选择。这是调用方的明确决定，不是默认路径。
- [`buildr help` 输出增加一条 primary 命令（当前 8,536 字符）] → 增量约 90 字符；换来的是消除 18% CLI 执行的一次失败往返与 53,221 字符的聚合读取，净收益为正。
- [新增命令使 unknown-command candidates 变化] → candidates 消费同一合并目录，自动包含 `task list`，无需额外维护；这也意味着历史上 51 次 `task list` 输入不再进入 unknown-command 路径。
- [v7 首批返回 `filterOptions`，增加少量体积] → 内容为 projects 与 services 数组，本工作空间为 1 个 project、4 个 service，体积可忽略；cursor 后续批次已按既有语义返回 `filterOptions: null`。

## Migration Plan

纯新增只读命令，无数据迁移、无兼容性负担。既有命令的输入、输出与默认值不变，HTTP 与 Buildr Web 不受影响。回滚等价于移除该 descriptor 与其参数分支；因为不改 Application 与 schema，回滚不产生残留状态。

## Open Questions

无。默认值取舍、输出信封与位置参数规则均已在上文决定，且不改变 spec 与任务拆分。

## 已授权范围补充：执行用量保留

关联任务同时要求保留执行器已经发出的 contextUsage。沿用既有 runOutcomes 存储，不新增用量数据库或把上下文占用当成本计费。两处归档投影保存 contextUsage，并保留当前dev已引入的generation字段；旧记录无用量仍为未知。执行器不发用量时不填0、不按字符推估。跨轮替换测试直接核对持久化用量及代次；本补充不增加Qoder用量采集。
