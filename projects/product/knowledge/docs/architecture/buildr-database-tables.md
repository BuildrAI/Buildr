# Buildr 数据库表与实体关系

本文是 [Buildr 数据全景与领域设计](buildr-data-design.md) 的物理存储附录。本附录只解释 `workspace.sqlite` 的当前表、字段、关系与数据库之外的校验，不代替全领域事实主线，也不把文件对象画成不存在的数据库表。

阅读入口：[独立交互阅读页](../../archify/data/workspace-sqlite-erd.html) · [原尺寸矢量图](../../archify/data/workspace-sqlite-erd.svg) · [Graphviz 图源](../../archify/data/workspace-sqlite-erd.dot.txt) · [图示范围与维护说明](../../archify/data/workspace-sqlite-erd.md)。阅读页内联图形与本附录，不需要网络；图形保留正文大小，可缩放与滚动，而非强制压成一屏缩略图。

## 1. 范围与事实依据

基线是 [迁移目录](../../../services/buildr/src/infrastructure/sqlite/migrations/) 的 `0000` 至 `0034`，不是把历史建表语句全部相加。核对方法是在空内存数据库 `:memory:` 按顺序执行全部 35 个脚本，遵循 `-- buildr:foreign-keys-off` 标记，再读取 `sqlite_schema`、`PRAGMA table_xinfo`、`PRAGMA foreign_key_list` 和 `PRAGMA index_list`。未打开或读取真实 `workspace.sqlite` 中的业务数据。

重放后的持久结构为 **10 张普通表、1 张全文检索虚拟表（FTS5 Virtual Table）、4 张内部影子表（Shadow Table）**，以及 13 个显式索引（Index）、3 个检索同步触发器（Trigger）。普通表共 50 个声明字段。迁移中的临时断言表和已删除旧表不属于当前结构；约束自动建立的索引不计入这 13 个显式索引。

- 所有普通表均为严格类型表（STRICT）。`task_projects`、`task_services`、`task_changes`、`task_verification_current`、`task_review_current` 还采用无行号表（WITHOUT ROWID）；其余普通表保留隐式 `rowid`。
- `tasks.task_id` 是文本主键（Primary Key，PK），不是 `rowid` 别名。`task_review_history.id`、`schema_migrations.version` 是整数主键（INTEGER PRIMARY KEY），也是 `rowid` 别名；没有 `AUTOINCREMENT`。
- 主键（PK）数字后缀表示复合主键中的顺序；外键（Foreign Key，FK）不等于逻辑引用（Logical Reference）；唯一约束（Unique Constraint，UQ）不是主键。
- 字段表中的可空性（Nullability）表示实际存储能否为 `NULL`，不代表某个业务状态是否允许缺省。两个整数主键虽在 `table_xinfo` 中显示 `notnull=0`，实际不会存储空值：省略或传入 `NULL` 会分配整数键。
- 结构化文本（JSON）仍以 `TEXT` 存储。对象、数组及其中的引用不自动成为独立实体表，也不自动受外键（FK）保护。

本图由本机 Graphviz 生成，使用鸟脚表示法（Crow's Foot Notation）。它不是 Archify 产物；目录位置沿用项目已有技术图目录，不表示扩展了 Archify 能力。

## 2. 关系、基数与删除行为

实线是 SQL 外键（FK）；端点双竖线代表恰好一项，圈加竖线代表零或一项，圈加鸟脚代表零至多项。数字给出基数（Cardinality）上限，尤其是鸟脚本身无法表达的 `0..2`。点线只表示逻辑引用（Logical Reference），蓝色虚线表示触发器同步（Trigger Sync）或检索引擎内部维护。

| 被引用对象 | 引用字段 | 每个被引用对象可有多少引用记录 | 每个引用记录对应多少被引用对象 | 删除动作 |
| --- | --- | --- | --- | --- |
| `tasks.task_id` | `tasks.parent_task_id` | `0..N` 个子任务 | `0..1` 个父任务 | `SET NULL`，删除父任务后子任务保留 |
| `tasks.task_id` | `task_projects.task_id` | `0..N` | `1` | `CASCADE` |
| `tasks.task_id` | `task_services.task_id` | `0..N` | `1` | `CASCADE` |
| `tasks.task_id` | `task_changes.task_id` | `0..N` | `1` | `CASCADE` |
| `tasks.task_id` | `task_verification_current.task_id` | `0..1` | `1` | `CASCADE` |
| `tasks.task_id` | `task_review_current.task_id` | `0..2`，每种 `review_type` 为 `0..1` | `1` | `CASCADE` |
| `tasks.task_id` | `task_review_history.task_id` | `0..N` | `1` | `CASCADE` |
| `tasks.task_id` | `task_work_context_current.task_id` | `0..1` | `1` | `CASCADE` |

上述 8 个外键（FK）的更新动作均为默认 `NO ACTION`。删除级联（CASCADE）针对真实删除行，不等于任务进入 `completed` 或 `abandoned` 后清空附属记录。[数据库连接与迁移实现](../../../services/buildr/src/infrastructure/sqlite/workspace-sqlite.ts) 在正常连接上启用 `PRAGMA foreign_keys = ON`，仅重建被引用表的特定迁移临时关闭它并核对一致性。

以下关系不能画成 SQL 外键（FK）：

- `project`、`service`、`change_name` 引用文件承载的项目（Project）、服务（Service）、变更（Change）。没有 `projects`、`services` 或 `changes` 实体表；三个 `task_*` 关联表只保存任务范围引用。
- `task_services` 没有 `(task_id, project)` 到 `task_projects` 的复合外键（FK）；`task_changes` 同样没有这样的约束。
- `task_review_history` 只引用 `tasks`，没有到 `task_review_current` 的外键（FK）。保存旧值的动作是应用写入，不是数据库触发器。
- `workbench_preferences.object_key` 按 `kind` 解释，可能定位任务、项目或其他资源。目标不存在时，数据库不会自动拒绝该偏好或级联删除它。
- `task_search.rowid` 对应 `tasks.rowid` 是检索同步，不是声明的外键（FK），也不能把 `task_search.task_id` 标成主键（PK）。

## 3. 任务主记录：`tasks`

职责：保存任务身份、目标、当前状态、结果，以及父子关系、终态更正记录与复盘文档引用。当前完整定义来自 [0031](../../../services/buildr/src/infrastructure/sqlite/migrations/0031_finalize_task_record.sql)；检索排序补充来自 [0032](../../../services/buildr/src/infrastructure/sqlite/migrations/0032_add_task_query_indexes.sql)。

| 字段 | 类型 | 键 | 可空 | 释义与默认值 |
| --- | --- | --- | --- | --- |
| `task_id` | `TEXT` | 主键（PK） | 否 | 稳定任务标识 |
| `title` | `TEXT` | — | 否 | 简短标题 |
| `intent` | `TEXT` | — | 否 | 目标与意图 |
| `status` | `TEXT` | — | 否 | `todo`、`active`、`completed`、`abandoned` |
| `result_summary` | `TEXT` | — | 是 | 终态结果摘要；未终结时为空 |
| `created_at` | `TEXT` | — | 否 | 创建时间 |
| `updated_at` | `TEXT` | — | 否 | 最近修改时间 |
| `parent_task_id` | `TEXT` | 外键（FK） | 是 | 父任务标识；删除父任务时置空 |
| `is_parent` | `INTEGER` | — | 否 | 是否已标识为父任务；默认 `0`，值为 `0` 或 `1` |
| `parent_completion_json` | `TEXT` | — | 是 | 父任务完成证据对象的结构化文本（JSON） |
| `result_history_json` | `TEXT` | — | 否 | 终态结果更正历史数组的结构化文本（JSON）；默认 `'[]'` |
| `legacy_parent_plan_json` | `TEXT` | — | 是 | 迁移保留的旧父任务计划结构化文本（JSON），不是当前计划表 |
| `retrospective_state` | `TEXT` | — | 是 | `pending-decision` 或 `decided` |
| `retrospective_document_digest` | `TEXT` | — | 是 | 复盘文档内容摘要，格式为 `sha256-` 加 64 位小写十六进制 |

关键约束：`task_id` 非空，仅含小写字母、数字及 `._-`，首尾必须为小写字母或数字；`title`、`intent` 去首尾空白后非空。两时间字段须可由 SQLite `datetime()` 解释，`updated_at >= created_at` 是文本比较。`parent_task_id` 不能等于自身；该检查不证明整条祖先链无环。

`parent_completion_json` 与 `legacy_parent_plan_json` 的 SQL 检查仅要求非空时 `json_valid()`；`result_history_json` 额外要求根为数组。数据库未对前两者要求根为对象。复盘状态与摘要须同时为空，或同时存在且任务已终结。

终态摘要的检查表达式意图是 `todo/active` 没有摘要、`completed/abandoned` 摘要非空，但 SQLite 的 `CHECK` 在表达式为 `NULL` 时也允许写入，故不能据此声称数据库本身拒绝所有缺失终态摘要。应用的完整记录校验在 [task-validation.ts](../../../services/buildr/src/modules/task/application/task-validation.ts)，与 SQL 约束必须分层理解。

[任务领域对象](../../../services/buildr/src/modules/task/domain/task.ts) 定义 `Task`、`ParentCompletion`、`TaskResultHistory`、`TaskRetrospective`；[父任务计划领域定义](../../../services/buildr/src/modules/task/domain/parent-coordination.ts) 解释迁移遗留计划。这里只解释对象职责，不复制完整结构。

父任务完成证据位于 `parent_completion_json`，终态更正保存到 `result_history_json`，复盘状态及文档摘要位于两个 `retrospective_*` 字段；它们不是过去的完成表、执行表或复盘当前表。[持久化映射](../../../services/buildr/src/modules/task/persistence/task-repository.ts) 把这些字段组成任务对象；`is_parent` 写入采用 `MAX(is_parent, ?)` 并可被显式标记，不等价于“此刻存在子任务”。复盘 Markdown 正文不在本表。

## 4. 范围关联：`task_projects`、`task_services`、`task_changes`

三个表均来自 [0001](../../../services/buildr/src/infrastructure/sqlite/migrations/0001_create_task_store.sql)，保存任务与文件实体的关联，而非项目或服务本身的属性。

### `task_projects`：任务涉及的项目

| 字段 | 类型 | 键 | 可空 | 释义 |
| --- | --- | --- | --- | --- |
| `task_id` | `TEXT` | 主键（PK）第 1 列、外键（FK） | 否 | 所属任务 |
| `project` | `TEXT` | 主键（PK）第 2 列 | 否 | 项目代码，文件实体逻辑引用（Logical Reference） |

### `task_services`：任务涉及的服务

| 字段 | 类型 | 键 | 可空 | 释义 |
| --- | --- | --- | --- | --- |
| `task_id` | `TEXT` | 主键（PK）第 1 列、外键（FK） | 否 | 所属任务 |
| `project` | `TEXT` | 主键（PK）第 2 列 | 否 | 项目代码 |
| `service` | `TEXT` | 主键（PK）第 3 列 | 否 | 与项目代码一起定位服务的逻辑引用（Logical Reference） |

### `task_changes`：任务涉及的变更

| 字段 | 类型 | 键 | 可空 | 释义 |
| --- | --- | --- | --- | --- |
| `task_id` | `TEXT` | 主键（PK）第 1 列、外键（FK） | 否 | 所属任务 |
| `project` | `TEXT` | 主键（PK）第 2 列 | 否 | 项目代码 |
| `change_name` | `TEXT` | 主键（PK）第 3 列 | 否 | OpenSpec 变更名称；领域字段名为 `change` |

各复合主键（PK）避免同一任务内重复关联。`project`、`service`、`change_name` 均非空，只含大小写字母、数字及 `._-`，且首字符必须为字母或数字；它们与小写任务标识的规则不同。

[task-command-application.ts](../../../services/buildr/src/modules/task/application/task-command-application.ts) 的 `assertScopeReferencesAvailable` 读取项目及服务登记，`assertChangeReferencesAvailable` 核对实际可解析的变更；不是通过不存在的目标表校验。[变更解析实现](../../../services/buildr/src/modules/task/change/application/change-application.ts) 定位当前工作副本及保留副本中的 OpenSpec 文件。类型映射分别见 [TaskProject](../../../services/buildr/src/modules/task/domain/task-project.ts)、[TaskService](../../../services/buildr/src/modules/task/domain/task-service.ts)、[TaskChange](../../../services/buildr/src/modules/task/domain/task-change.ts)。

## 5. 当前验证：`task_verification_current`

职责：每个任务最多保存一份当前验证报告。当前定义来自 [0023](../../../services/buildr/src/infrastructure/sqlite/migrations/0023_refactor_task_verification_report.sql)。

| 字段 | 类型 | 键 | 可空 | 释义 |
| --- | --- | --- | --- | --- |
| `task_id` | `TEXT` | 主键（PK）、外键（FK） | 否 | 所属任务 |
| `result_json` | `TEXT` | — | 否 | 验证报告的结构化文本（JSON） |
| `target_identity` | `TEXT` | — | 否 | 报告 `content.identity` 的查询列 |
| `outcome` | `TEXT` | — | 否 | `passed`、`not-passed`、`incomplete` |
| `updated_at` | `TEXT` | — | 否 | 报告 `completedAt` 的查询列 |

SQL 检查 `json_valid(result_json)`，并比较 `schemaVersion = 'buildr.task-verification-report/v1'` 及 `taskId = task_id`；查询身份去首尾空白后非空，时间可解析。缺失的结构化文本（JSON）键可能让比较得到 `NULL` 而通过 `CHECK`，因此这不是完整对象校验。

[task-verification.ts](../../../services/buildr/src/modules/task/domain/task-verification.ts) 定义和校验报告对象，包括范围、被验证内容、声明引用、检查、缺口与结论。[task-verification-repository.ts](../../../services/buildr/src/modules/task/persistence/task-verification-repository.ts) 在读写时核对对象与查询列一致性，写前比较 `expectedReportDigest`。其第 59–66 行只更新当前表，**没有验证历史表，也不会自动保存被替换的旧报告**。

## 6. 当前审查：`task_review_current`

职责：每个任务为 `planning`、`completion` 各保留至多一份当前审查。来自 [0027](../../../services/buildr/src/infrastructure/sqlite/migrations/0027_migrate_task_review_result_v2.sql)。

| 字段 | 类型 | 键 | 可空 | 释义 |
| --- | --- | --- | --- | --- |
| `task_id` | `TEXT` | 主键（PK）第 1 列、外键（FK） | 否 | 所属任务 |
| `review_type` | `TEXT` | 主键（PK）第 2 列 | 否 | `planning` 或 `completion` |
| `result_json` | `TEXT` | — | 否 | 审查结果的结构化文本（JSON） |
| `subject_identity` | `TEXT` | — | 否 | 被审查对象身份的查询列 |
| `outcome` | `TEXT` | — | 否 | `accepted` 或 `changes-requested` |
| `updated_at` | `TEXT` | — | 否 | 结果 `completedAt` 的查询列 |

复合主键（PK）与两值类型检查共同形成每任务 `0..2` 的上限，不是笼统的无限多。SQL 要求有效的结构化文本（JSON）对象，比较 `schemaVersion = 'buildr.task-review-result/v2'`、`taskId` 和 `reviewType`；查询身份非空，时间可解析。缺失键的比较同样存在 `CHECK(NULL)` 边界；完整字段和查询列一致性由 [task-review.ts](../../../services/buildr/src/modules/task/domain/task-review.ts) 与 [task-review-repository.ts](../../../services/buildr/src/modules/task/persistence/task-review-repository.ts) 校验。

审查对象含审查方法、已审内容、未覆盖项、发现及结论；这些是单个 `result_json` 内的结构化文本（JSON），不是额外子表。

## 7. 审查替换历史：`task_review_history`

职责：保留同任务、同类型的被替换审查结果。来自 [0034](../../../services/buildr/src/infrastructure/sqlite/migrations/0034_add_task_review_history.sql)。

| 字段 | 类型 | 键 | 可空 | 释义 |
| --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 主键（PK）、`rowid` 别名 | 否* | 插入时分配的整数键；不是时间戳 |
| `task_id` | `TEXT` | 外键（FK） | 否 | 所属任务 |
| `review_type` | `TEXT` | — | 否 | `planning` 或 `completion` |
| `result_json` | `TEXT` | — | 否 | 旧审查结果的完整结构化文本（JSON） |

`否*` 表示省略或传入 `NULL` 会分配整数键，不会存储空值。SQL 只检查类型取值与 `json_valid()`，未强制该对象的完整结构、内部任务身份或类型一致性；读取时沿用当前审查的领域校验。

**先保存旧值，再替换当前值**：在 [task-review-repository.ts 第 100–109 行](../../../services/buildr/src/modules/task/persistence/task-review-repository.ts#L100-L109)，同一事务先读取并校验当前记录及 `expectedCurrentDigest`；已有当前值时将原始 `result_json` 插入历史表，然后更新当前表。首次创建没有旧值，不产生历史行。历史行没有指向当前表的外键（FK），也没有独立 `updated_at`；读出的 `observedAt` 来自旧结果的 `completedAt`，按 `id` 排序。该表不是任务所有变动的通用事件流水。

## 8. 当前工作摘要：`task_work_context_current`

职责：每任务一份可接续的工作摘要及待处理意见。来自 [0033](../../../services/buildr/src/infrastructure/sqlite/migrations/0033_add_daily_workbench.sql)。

| 字段 | 类型 | 键 | 可空 | 释义 |
| --- | --- | --- | --- | --- |
| `task_id` | `TEXT` | 主键（PK）、外键（FK） | 否 | 所属任务 |
| `context_json` | `TEXT` | — | 否 | 工作摘要对象的结构化文本（JSON） |
| `attention_state` | `TEXT` | — | 是 | `pending` 或 `resolved`；没有意见对象时为 `NULL` |
| `updated_at` | `TEXT` | — | 否 | 摘要的更新时间查询列 |

SQL 只检查有效的结构化文本（JSON）、可空的状态取值和可解析时间，不检查查询列等于对象字段。[work-context.ts](../../../services/buildr/src/modules/task/work-context/domain/work-context.ts) 定义进展、下一步、可选阶段、意见与答复；`context_json` 保存的是其中的摘要对象，不是整个响应封套。

[work-context-repository.ts](../../../services/buildr/src/modules/task/work-context/persistence/work-context-repository.ts) 写入前比较摘要，校验已解决意见必须具有答复，并从对象派生 `attention_state` 与 `updated_at`。读取当前对象只查询 `context_json`，待处理列表使用 `attention_state`；SQL 不独立保证这两份表示一直相符。

## 9. 工作台偏好：`workbench_preferences`

职责：保存置顶、计划、关注、收藏及最近访问。来自 [0033](../../../services/buildr/src/infrastructure/sqlite/migrations/0033_add_daily_workbench.sql)，无外键（FK）。

| 字段 | 类型 | 键 | 可空 | 释义 |
| --- | --- | --- | --- | --- |
| `kind` | `TEXT` | 主键（PK）第 1 列 | 否 | 偏好类型 |
| `object_key` | `TEXT` | 主键（PK）第 2 列 | 否 | 类型范围内的目标键，长度 `1..300` |
| `label` | `TEXT` | — | 否 | 显示名称，去首尾空白后非空 |
| `href` | `TEXT` | — | 否 | 可打开的页面地址，去首尾空白后非空 |
| `updated_at` | `TEXT` | — | 否 | 可解析的更新时间 |

`kind` 仅允许 `pinned-task`、`planned-task`、`followed-project`、`saved-resource`、`recent-resource`。复合主键（PK）只在同类型内去重，`object_key` 本身不全局唯一。该表不是无行号表（WITHOUT ROWID）；最近访问的排序实际使用 `updated_at DESC, rowid DESC`。

[preferences-application.ts](../../../services/buildr/src/modules/workbench/application/preferences-application.ts) 按类型解析任务或项目，添加计划项时要求任务为 `todo`，目标不可读时展示诊断名称而非伪造存在。[workbench.ts](../../../services/buildr/src/modules/workbench/domain/workbench.ts) 校验目标键与当前工作空间内的允许页面地址；[preferences-repository.ts](../../../services/buildr/src/modules/workbench/persistence/preferences-repository.ts) 限制每类非最近偏好最多 500 项，最近访问保留 30 项。这些是应用约束，不是 SQL 外键（FK）、检查约束或删除触发器。

## 10. 迁移账本：`schema_migrations`

职责：记录实际应用的迁移版本、脚本名称、脚本摘要与时间。来自 [0000](../../../services/buildr/src/infrastructure/sqlite/migrations/0000_create_migration_ledger.sql)，无业务关联。

| 字段 | 类型 | 键 | 可空 | 释义 |
| --- | --- | --- | --- | --- |
| `version` | `INTEGER` | 主键（PK）、`rowid` 别名 | 否* | 非负版本号；应用明确写入迁移版本 |
| `name` | `TEXT` | 唯一约束（UQ） | 否 | `0000_name.sql` 形式的迁移文件名 |
| `checksum` | `TEXT` | — | 否 | `sha256-` 加 64 位小写十六进制 |
| `applied_at` | `TEXT` | — | 否 | 可由 SQLite 解析的应用时间 |

`否*` 的含义与历史表整数主键相同；不是建议让数据库自行选择迁移版本。名称的 SQL 检查包含四位数字前缀、下划线、受限名称字符与 `.sql` 后缀。[workspace-sqlite.ts](../../../services/buildr/src/infrastructure/sqlite/workspace-sqlite.ts) 负责脚本版本连续性、账本与当前脚本名称及摘要一致性、迁移执行和账本写入。单独重放 SQL 得到的是结构，不应把空内存账本当成真实安装的迁移记录。

## 11. 全文检索与内部影子表

`task_search` 来自 [0032](../../../services/buildr/src/infrastructure/sqlite/migrations/0032_add_task_query_indexes.sql)，使用外部内容全文检索（External-content FTS5）：`content='tasks'`、`content_rowid='rowid'`、`tokenize='trigram'`。正文仍由 `tasks` 提供；初次创建执行 `rebuild`。

| 字段 | 声明类型 | 键 | 可空性声明 | 释义 |
| --- | --- | --- | --- | --- |
| `task_id` | 未声明 | 无主键（PK）/外键（FK） | 未约束 | 被检索的任务标识 |
| `title` | 未声明 | — | 未约束 | 被检索的任务标题 |
| `intent` | 未声明 | — | 未约束 | 被检索的任务意图 |
| `task_search` | 未声明，隐藏列 | — | 未约束 | 全文检索（FTS5）的同名命令接口列 |
| `rank` | 未声明，隐藏列 | — | 未约束 | 全文检索（FTS5）的排序接口列 |

三个可见列没有 SQL 类型、主键（PK）或非空声明，不能因为源表使用 `TEXT NOT NULL` 就给虚拟表虚构相同约束。两个隐藏列来自 `table_xinfo`，不是迁移显式声明的业务字段；`rowid` 是引擎文档标识，不属于上述五个声明/隐藏列清单。

| 触发器（Trigger） | 同步动作 |
| --- | --- |
| `tasks_search_after_insert` | 用 `new.rowid` 及三列新值写入检索表 |
| `tasks_search_after_delete` | 用 `old.rowid` 及三列旧值发出检索删除命令 |
| `tasks_search_after_update` | 仅监听 `task_id/title/intent` 更新；先删旧检索内容，再写新内容 |

以下四个内部影子表（Shadow Table）由全文检索（FTS5）引擎维护，仅归为基础设施，不展开为业务实体，也不建议直接写入：

| 表名 | 职责 |
| --- | --- |
| `task_search_config` | 引擎配置 |
| `task_search_data` | 索引数据块 |
| `task_search_docsize` | 每文档的词数统计 |
| `task_search_idx` | 索引段定位信息 |

外部内容模式没有额外 `task_search_content` 表。隐式 `rowid` 相等与触发器同步是实现关系，不是声明的一对一外键（FK）约束。

## 12. 当前显式索引清单

下表列出所有 13 个显式索引（Index）。主键（PK）及唯一约束（UQ）的自动支持结构另算；检索引擎内部结构也不并入此表。

| 表 | 索引名称 | 键及顺序 | 用途 |
| --- | --- | --- | --- |
| `tasks` | `tasks_status_updated_at_idx` | `status, updated_at DESC, task_id` | 按状态筛选和时间排序 |
| `tasks` | `tasks_updated_at_idx` | `updated_at DESC, task_id` | 全部任务时间顺序 |
| `tasks` | `tasks_parent_task_idx` | `parent_task_id, task_id` | 查找子任务 |
| `tasks` | `tasks_retrospective_state_idx` | `retrospective_state, updated_at DESC, task_id` | 按复盘状态查询 |
| `tasks` | `tasks_feed_order_idx` | 状态映射表达式、`updated_at DESC, task_id` | `active=0, todo=1, completed=2, abandoned=3` 的列表顺序 |
| `task_projects` | `task_projects_project_idx` | `project, task_id` | 项目范围反查任务 |
| `task_services` | `task_services_identity_idx` | `project, service, task_id` | 服务范围反查任务 |
| `task_changes` | `task_changes_identity_idx` | `project, change_name, task_id` | 变更反查任务 |
| `task_verification_current` | `task_verification_current_target_idx` | `target_identity, updated_at DESC, task_id` | 按报告目标身份查询 |
| `task_review_current` | `task_review_current_subject_idx` | `review_type, subject_identity, updated_at DESC, task_id` | 按审查类型及对象身份查询 |
| `task_review_history` | `task_review_history_task_idx` | `task_id, review_type, id` | 同任务同类型审查历史顺序 |
| `task_work_context_current` | `task_work_context_attention_idx` | `attention_state, updated_at DESC, task_id` | 待处理意见队列 |
| `workbench_preferences` | `workbench_preferences_recent_idx` | `kind, updated_at DESC, object_key` | 类型与时间维度访问 |

## 13. 外键之外的完整性边界

关系图不代表所有业务合法性都由数据库保证。以下边界必须回到实际应用与领域文件理解：

1. 父子关系：SQL 禁止直接自引用；[task-command-application.ts 第 139–151 行](../../../services/buildr/src/modules/task/application/task-command-application.ts#L139-L151) 还要求新关联的父任务为 `active`，沿祖先链检查循环。普通外键（FK）不表达这些条件。
2. 文件实体：范围引用、变更可用性与当前工作副本位置由登记读取和实际文件解析决定，不由 SQL 表自动保证。
3. 并发写入：当前审查、验证、工作摘要以及适用任务修改使用已观察内容摘要检查冲突。摘要是运行时计算，不是本图遗漏的 `digest` 数据库列。
4. 对象校验：`json_valid()` 不等于业务对象合法；`CHECK` 的未知值 `NULL` 也不会自动失败。审查、验证及工作摘要分别有领域校验和不同的查询列一致性行为，不能混为统一数据库保证。
5. 结果与历史：审查替换保留旧值，验证只保留当前值；任务终态更正历史在 `tasks.result_history_json`，不是 `task_review_history`。父完成证据、复盘状态和复盘文档摘要同样属于任务主记录。
6. 偏好：目标键解析、页面地址限制、数量限制由应用执行；删除任务不会自动级联删除偏好行。

## 14. 维护与验收边界

迁移结构变化时，应先在 `:memory:` 重放到新的末版本，核对当前表而非累加历史表；同步更新此附录、图源、矢量图与内联阅读页。领域文件变化但物理表不变时，只调整相关解释，不虚构数据库迁移。

已核对结构重放、图源生成、脚本语法与相对链接，并在浏览器检查字体、关系连线、缩放上下限、搜索命中与空结果、下一项及重置。实体关系图（ERD）在 1440×900、1920×1080、2048×1320 下无页面横向溢出；图内按原尺寸滚动，不以缩小到不可读代替完整字段展示。产品知识读取器已验证正文和图源可读；完整 Buildr Web 应用内的导航尚未验收，独立阅读检查不冒充应用验收。
