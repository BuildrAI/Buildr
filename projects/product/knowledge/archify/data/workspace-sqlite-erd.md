# 工作空间 SQLite 实体关系图

## 阅读入口

- [独立交互阅读页](workspace-sqlite-erd.html)：内联矢量图与完整字段附录，原生缩放、表名/字段搜索、重置；无需服务器或网络。
- [原尺寸矢量图](workspace-sqlite-erd.svg)：可独立放大、导出或嵌入其他文档。
- [Graphviz 图源](workspace-sqlite-erd.dot.txt)：字段、端点与基数的可维护来源。
- [数据库表与约束附录](../../docs/architecture/buildr-database-tables.md)：各表职责、50 个普通字段、全文检索隐藏列、索引及应用完整性边界。
- [数据全景与领域设计](../../docs/architecture/buildr-data-design.md)：从业务含义、身份、关系与存储边界理解全项目。

## 视角与来源

这是 Buildr 产品的 `workspace.sqlite` **物理实体关系图（Physical ERD）**，不是系统组成示意图，也不是全领域对象全部落库的假设。当前结构以 [SQL 迁移目录](../../../services/buildr/src/infrastructure/sqlite/migrations/) 的 `0000` 至 `0034` 为准；依次在空内存数据库 `:memory:` 重放，未读取真实工作空间（Workspace）的业务数据。

全部 10 张普通表及 1 张全文检索虚拟表（FTS5 Virtual Table）均展开字段、类型、键和可空性（Nullability）；4 张内部影子表（Shadow Table）只分组列名。全文检索（FTS5）的 `task_search`、`rank` 隐藏列有单独标识，未为该虚拟表虚构类型或键约束。隐式 `rowid` 不是额外声明字段。

当前定义与关键语义来源：

| 来源 | 覆盖事实 |
| --- | --- |
| [0000](../../../services/buildr/src/infrastructure/sqlite/migrations/0000_create_migration_ledger.sql) | 迁移账本 |
| [0001](../../../services/buildr/src/infrastructure/sqlite/migrations/0001_create_task_store.sql) | 三张任务范围关联表 |
| [0023](../../../services/buildr/src/infrastructure/sqlite/migrations/0023_refactor_task_verification_report.sql) | 当前验证报告 |
| [0027](../../../services/buildr/src/infrastructure/sqlite/migrations/0027_migrate_task_review_result_v2.sql) | 两类当前审查 |
| [0031](../../../services/buildr/src/infrastructure/sqlite/migrations/0031_finalize_task_record.sql) | 当前任务主表的 14 个字段 |
| [0032](../../../services/buildr/src/infrastructure/sqlite/migrations/0032_add_task_query_indexes.sql) | 检索与同步触发器（Trigger） |
| [0033](../../../services/buildr/src/infrastructure/sqlite/migrations/0033_add_daily_workbench.sql) | 工作摘要和偏好 |
| [0034](../../../services/buildr/src/infrastructure/sqlite/migrations/0034_add_task_review_history.sql) | 审查替换历史 |
| [审查持久化第 100–109 行](../../../services/buildr/src/modules/task/persistence/task-review-repository.ts#L100-L109) | 事务内先保存旧当前值，再替换当前值 |
| [验证持久化](../../../services/buildr/src/modules/task/persistence/task-verification-repository.ts) | 只有当前验证，不保留被替换报告 |

父完成证据、终态更正历史与复盘引用仍位于 `tasks` 的结构化文本（JSON）或普通字段内。领域对象形状以 [task.ts](../../../services/buildr/src/modules/task/domain/task.ts)、[task-review.ts](../../../services/buildr/src/modules/task/domain/task-review.ts)、[task-verification.ts](../../../services/buildr/src/modules/task/domain/task-verification.ts)、[work-context.ts](../../../services/buildr/src/modules/task/work-context/domain/work-context.ts) 为准，不在图中把内嵌对象扩建成独立实体表。

## 图例

- 主键（PK）、外键（FK）、唯一约束（UQ）；`PK1/PK2/PK3` 是同一复合主键的列顺序。
- 实线和鸟脚端点（Crow's Foot）：SQL 外键（FK）。双竖线是 `1`，圈加竖线是 `0..1`，圈加鸟脚是 `0..N`。数字明确基数（Cardinality），审查当前表每任务合计 `0..2`、每类型 `0..1`。
- 点线：逻辑引用（Logical Reference），不施加 SQL 约束。图中的文件实体与偏好对象说明框不计为数据库表。
- 蓝色虚线：触发器同步（Trigger Sync）或检索引擎内部维护，不是外键（FK）。
- `否*`：整数主键（INTEGER PRIMARY KEY）实际不存空值；省略或传入 `NULL` 会分配整数键。
- 所有任务附属表的 `task_id` 使用删除级联（CASCADE）；`tasks.parent_task_id` 使用删除置空（SET NULL）。更新动作均为 `NO ACTION`。

项目（Project）、服务（Service）、变更（Change）本身是文件实体，没有对应 SQL 实体表。`task_services` 到 `task_projects`、`task_review_history` 到 `task_review_current` 都没有复合外键（FK）；偏好的 `object_key` 也只是按 `kind` 解释的逻辑引用（Logical Reference）。

## 制作与更新边界

本图使用本机 **Graphviz**，不是 Archify 产物。Archify 未提供本次所需的实体关系图（ERD）及鸟脚端点，因此采用能表达这些关系的本机制图工具；不修改任何产品能力、绑定或声明。图源采用 `.dot.txt` 后缀，让现有知识阅读器能够直接显示文本；内容仍是原生 Graphviz DOT 格式。目录仅沿用现有技术图存放位置。没有第三方联网依赖、远端字体或脚本。

修改图源后，使用本机 Graphviz 重新生成矢量图，再把矢量图主体同步内联到阅读页；不能只改展示而留下旧图源。阅读页中 `<!-- diagram:start -->` 与 `<!-- diagram:end -->` 之间是矢量图主体，`<!-- fields:start -->` 与 `<!-- fields:end -->` 之间是附录的静态 HTML 转换结果。修改完整字段附录后，也要同步内联文字及相对链接；这些注释只是可接续的内容边界，不是产品受管区块（Managed Block）。无需新增生成框架或构建依赖。

例如以环境变量 `PRODUCT_ROOT` 指向实际产品根目录后，可重新生成矢量图：

```sh
/opt/homebrew/bin/dot -Tsvg "$PRODUCT_ROOT/knowledge/archify/data/workspace-sqlite-erd.dot.txt" -o "$PRODUCT_ROOT/knowledge/archify/data/workspace-sqlite-erd.svg"
```

独立阅读页只内联 `<svg>` 主体，不包含 Graphviz 输出的 XML 外部文档类型声明；命名空间网址不是网络资源加载。阅读页保持原尺寸滚动，缩放范围为 `25%..200%`；搜索定位匹配表并高亮匹配字段，下一项按钮轮换表。浏览器自身页面搜索可搜索下方全文。

## 本轮检查与未覆盖

结构核对使用 SQLite `3.53.4`，绘图使用 Graphviz `12.2.1`。空内存重放完成，外键检查（Foreign Key Check）无违规，确认 10 普通表、1 虚拟表、4 影子表、50 普通字段、8 外键（FK）、13 显式索引（Index）、3 触发器（Trigger）。

交付时检查当前图源到矢量图的生成、内联图一致性、阅读页脚本语法、字段与关系对应、相对文件链接及页内锚点。主线文章、数据库附录和本机数据说明已接入同一知识索引（Knowledge Index）。

已在浏览器检查独立阅读页：中文字体与表字段可读，关系线未发现穿越无关节点；缩放上下限、搜索命中、空结果、下一项和重置通过。1440×900、1920×1080、2048×1320 下无页面横向溢出；图内保留正常滚动和放大。产品知识索引（Knowledge Index）解析与安全文件读取已通过；已在 Buildr Web Dev 的“项目知识”中检索主文，打开文内关系图对照并验证搜索、缩放和重置。应用内使用外层“图示文件”查看图源与依据，独立 HTML 的相对链接用于文件或静态托管阅读。
