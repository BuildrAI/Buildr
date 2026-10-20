# 查询编辑器快捷操作设计

原型已确认并授权正式实施；正式设计见 `openspec/changes/archive/2026-10-20-add-sql-editor-shortcuts/design.md`。目标是在现有“连接 → MySQL 查询”中验证连续键盘选表，并为后续快捷操作保留清晰扩展位置。快捷操作改善确定性编辑效率，人与智能体（Agent）继续使用同一查询能力与既有执行边界。

## 当前事实与原型范围

正式界面由 `ConnectionSkillsPage` 打开 `MySqlQuery`，后者编排数据库选择、`SqlQueryEditor` 和 `MySqlResults`。编辑器基于 CodeMirror，通过 `FileCodeEditor` 管理视图。后端已有 `databases`、`tables`、`columns` 读取入口；前端查询客户端（Client）目前只接入数据库列表、偏好和查询执行。

原型直接导入正式查询页、编辑器、结果、数据库选择、应用壳、分栏和统一原型阅读器。演示入口复用同一正式快捷扩展。原型构建脚本（Build Script）只在内存构建期间设置初始语句、焦点与说明位置，不复制快捷操作实现。模拟连接和库表信息均在本地内存中；没有真实数据库访问或真实查询执行。

## 建议的正式职责

以下职责已进入正式实现：

```text
features/mysql-query/
  components/
    MySqlQuery.tsx             页面装配，提供当前连接和数据库
    SqlQueryEditor.tsx         编辑器生命周期和既有运行快捷键
  editor/
    shortcut-actions.ts       快捷操作定义及编辑计划
    sql-context.ts            当前语句、位置、库表引用的上下文识别
    sql-completion.ts         CodeMirror 适配、候选展示与键盘优先级
    database-catalog.ts       库表字段读取、缓存与失效
    sql-statement-highlight.ts 当前执行目标范围框与运行期间的固定范围
  sql-execution-target.ts      执行文本和展示范围的唯一定位来源
  sql-statement-analysis.ts    本地词法边界和完整 MySQL 语法验证，无分号推断及文档分析缓存
  api/
    mysql-query-api.ts        复用现有接口，补充 tables / columns
```

不建立通用插件平台或跨页面命令总线。当前稳定分界是操作定义、语句上下文、候选交互、数据来源；实现时可按实际复杂度合并相邻小单元。

| 职责 | 代表对象与方法 | 约束 |
| --- | --- | --- |
| 快捷操作 | `ShortcutAction`：`id`、`trigger`、`title`、`available(context)`、`createPlan(context)` | 返回文本修改、光标位置和下一步候选类型；不直接处理按键、请求数据库或运行查询 |
| 语句上下文 | `SqlContextReader.read(state, selection)` | 识别代码、字符串、注释、当前语句与 `FROM` / `JOIN` / 限定库名；不负责网络请求 |
| 候选交互 | `createSqlCompletionExtension(dependencies)` | 统一展示操作、数据库、表；应用编辑计划（Edit Plan），保持焦点，控制确认、关闭、重开与撤销 |
| 库表目录 | `DatabaseCatalog.tables(target, database, signal)`，后续扩展 `columns` | 经既有客户端读取，按连接身份、连接版本及库名缓存；不保存凭证、不改变执行数据库 |
| 页面装配 | `MySqlQuery` | 提供已观察的连接身份与版本、当前库和已启用库；查询仍调用既有 `run` |

关键调用链：按键 → 语句上下文 → 匹配操作或库表候选 → 选择 → 编辑计划 → 单次编辑事务（Transaction）→ 必要时继续选表。运行查询走独立的既有入口。

以后增加查询行数、插入常用查询模板等快捷操作，优先增加操作定义；需要字段选择时增加对应候选提供者（Provider），复用展示与键盘交互。新操作若有真实执行或外部副作用，必须接入已有执行边界，不能因选中候选而隐式获得执行授权。

## 本轮交互决定

- `sel` 在语句起始位置出现候选；`Enter` / `Tab` 展开 `SELECT *\nFROM ;`，光标停在分号前并打开库表候选。
- 当前库的表优先，其次为同一连接下其他已启用库。输入字符作不区分大小写的包含过滤，前缀匹配优先。
- 选择数据库插入限定库名与点号，继续显示该库的表；不改变上方当前库。选择表插入带反引号的标识符（Identifier）。
- `↑↓` 选择，`Enter` / `Tab` 确认，`Esc` 关闭，`Ctrl+Space` 重开。没有候选时回车正常换行；`⌘ / Ctrl + Enter` 保留运行功能。
- 每次展开、选库、选表分别形成可撤销步骤。候选没有独立搜索框，输入始终落在真实语句中。
- 加载、空结果、无匹配、失败重试留在光标附近；失败保留原语句。切换连接、连接版本或当前库后关闭旧候选，过期返回不得替换新上下文。
- 当前语句范围框与执行共用 `sqlExecutionTarget` 的文本和起止位置；有选区时按选区，不扩大范围。执行期间固定已提交范围，完成、失败或取消后恢复跟随光标。
- 无分号时先验证整段是否为完整查询，再结合引号、注释、括号层级及完整前段推断独立查询；子查询、`UNION`、`WITH` 保持整体。复用后端同版本的本地 MySQL 解析器（Parser）精简构建，光标移动复用当前文档分析；不重写原文、不访问数据库、不替代后端只读校验。语法未完成、解析器不支持或超过分析预算时不猜边界，运行时提示显式选中查询或补充分号。

## 实现边界

确认版使用局部模式匹配（Pattern Matching）；正式实现已改为 MySQL 语法树（Syntax Tree）上下文，覆盖注释、字符串、引号、别名、多语句、嵌套与光标中段替换。它只识别本轮表引用与快捷操作位置，不承担完整查询语义或字段推导。

正式库表读取支持取消、去重、范围缓存和显式刷新，并复用连接版本校验。现有后端单库超过 1000 张表会返回明确错误；正式方案应如实反馈，另行评估按名称检索，不能把截断列表当作完整结果。

演示数据保持在内存中；正式入口通过已有只读接口获取表列表，新增 CodeMirror SQL 和候选依赖。查询执行与偏好保持原有边界。正式任务（Task）为 `sql-editor-shortcuts`，规范变更（OpenSpec Change）为 `add-sql-editor-shortcuts`。

## 成果位置与接续

- 稳定隔离标识：`sql-editor-shortcuts`。
- 工作树（Worktree）：`/Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/sql-editor-shortcuts`。
- 分支（Branch）：`codex/sql-editor-shortcuts`，尚未提交或推送。
- 来源提交（Commit）：`e71d4284dca5c33d23ab7dd84874ec72e65bff90`。
- 构建来源：本目录及 `tools/build-sql-editor-shortcuts-prototype.mjs`；完整来源摘要随 HTML 内联保存。
- 临时产物：`/tmp/buildr-sql-editor-shortcuts-review/review.html`（统一阅读入口）、同目录 `query-shortcuts.html`（自包含正文）。确认版已保全到关联变更的 `prototype/confirmed.html`，原阅读器与必要源码保全于 `prototype/confirmed-source/`。任务为 `sql-editor-shortcuts`，临时目录不承诺保留期限；源码保留在上述工作树中。
