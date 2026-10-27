# 命令与结果

以下调用均先读取当前实例（Connection Instance）及版本（Revision），再使用 `buildr connection-skill run --help` 展示的通用启动格式，明确提供实例编号、已观察版本、程序 `cli` 和专业参数。帮助与版本检查不接收认证。

```text
buildr connection-skill run --connection <id> --expected-revision <revision> --program cli -- <专业参数>
```

| 专业参数 | 作用 | 完成依据 |
| --- | --- | --- |
| `--help` | 离线列出程序能力 | 程序正常退出并返回帮助 |
| `--version` | 离线核对程序协议版本 | `buildr-mysql 1.1.0` |
| `test --json` | 只读版本检查 | `status: success`、检查通过、服务器版本和耗时 |
| `databases --json` | 读取账号可见数据库 | `status: success` 及有界 `options`、`databases` |
| `fingerprint --table <表> [--database <库>] --json` | 读取目标表结构摘要 | `status: success`、`exists` 与 `fingerprint` |
| `apply --statement-file <文件\|-> --expected-fingerprint <摘要> [--max-affected-rows <1-10000>] --json` | 执行单条受控变更 | `status: success`、`committed`、`rollbackable`、`affectedRows`、`fingerprintAfter`、`readback` |

声明的测试槽位（Hook）和数据库发现槽位（Hook）可用于保存前的候选配置，不保存配置或个人认证。数据库发现允许尚未选择默认数据库；地址、端口和完整认证组必须有效。

程序只支持以上专业动作，不接受任意查询语句（SQL）。表结构、查询和展示数据库选择由独立内置查询工具负责。查询工具要求每次调用提供实例已观察版本；旧版本失败后重新读取并让用户继续使用同一明确目标，不静默切换实例。

## 受控变更

变更读取连接配置中的 `targetEnvironment` 与 `allowDestructive`。`prod` 一律拒绝；未声明环境时按非生产执行，并在结果中以 `environment: undeclared` 标注没有生产保护。`allowDestructive` 默认关闭时拒绝 `DROP TABLE` 与 `TRUNCATE`，开启后仍需写前核对与回读。权限与账号、服务器全局状态、过程/触发器/事件及文件导入导出类语句始终拒绝。

一次 `apply` 只接受一条语句，且只允许涉及一张表。语句文件请使用绝对路径，或用 `-` 从标准输入读取。数据修改类（`INSERT`、`UPDATE`、`DELETE`、`REPLACE`）在事务内执行，必须提供 `--max-affected-rows`；`UPDATE` 与 `DELETE` 缺少 `WHERE` 时拒绝。结构变更类（`CREATE TABLE`、`ALTER TABLE`、`CREATE INDEX`、`DROP INDEX`、经允许的 `DROP TABLE`、`TRUNCATE`）不接受 `--max-affected-rows`，结果为已执行且不可回滚。

`--expected-fingerprint` 必须来自同一连接上 `fingerprint` 的实际返回。执行前程序重新读取目标表结构，摘要不一致即拒绝；执行后回读列、索引数量与结构摘要并返回。结构变更读取与写入并非原子操作，只降低并发覆盖风险。

## 结果与失败

- `status: success` 且 `committed: true`：语句已提交。`rollbackable: true` 仅表示本次数据修改在事务中完成，不表示可以撤销已提交结果。
- `status: unknown` 且 `committed: null`：超时、连接中断或外层终止，结果未知。先重新读取实际结构与数据，不自动重试。
- `status: unknown` 且 `committed: true`：语句已提交，但回读未完成。按实际状态核对结果，不重复执行同一变更。
- `status: failure`：语句未提交或已回滚；区分环境、策略、结构摘要、行数上限、语法与权限问题。

MySQL 每次调用使用独立连接与只读事务或受控变更事务，禁用多语句（Multiple Statements）和本地文件（LOCAL FILE）能力。只读调用限时 10 秒，变更最长 240 秒；通用入口默认 60 秒外部时限，预计更久的结构变更须显式放宽 `--timeout-ms`（上限 300000 毫秒），并为程序输出与清理留出余量。发现结果超过 1000 个数据库则明确失败，不能将截断列表冒充完整发现。程序错误输出使用有界诊断，不回显认证、原始驱动错误或完整远端响应。

独立命令行接口（CLI）入口为 `buildr mysql-query --help`。先读取连接列表或 `get` 的当前版本，再使用 `databases`、`tables`、`columns`、`query`、`preferences` 或 `save-preferences`，每次明确 `--connection <id> --expected-revision <revision>`。查询可用 `--sql-file <file|->` 保留完整输入；保存偏好使用含其独立 `expectedRevision` 的文件。同名实例仍分别使用明确身份，不自动合并账号或偏好。查询入口始终只读，不执行本页的变更动作。
