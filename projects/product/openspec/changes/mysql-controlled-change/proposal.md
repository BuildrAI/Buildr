## Why

内置 `mysql-connection` 目前只有 `test` 与 `databases` 两个只读槽位（Slot），程序 `buildr-mysql` 也只实现这两个动作；独立查询工具保持单条只读查询。智能体在工作空间中遇到需要修改 QA 数据库的目标时没有任何可调用的写入动作，只能让用户切到外部客户端手工执行，目标执行与结果核验都离开了工作现场。

## What Changes

- `buildr-mysql` 新增受控变更动作 `apply`，按语句类别分流：DML 在事务内执行并提供受影响行数上限保护，DDL 明确不可回滚并依赖写前结构指纹与写后回读。
- 连接声明新增 `targetEnvironment` 与 `allowDestructive` 配置字段。两者缺失时按「未声明」处理，`apply` 拒绝执行；配置版本保持 `1`，既有实例的只读与查询行为不变。
- `allowDestructive` 默认 `false`，拒绝 `DROP TABLE` 与 `TRUNCATE`；用户可在连接配置页开启以解除该限制。权限、服务器状态、过程/触发器与文件类语句不由该开关放行。
- `targetEnvironment: prod` 的连接一律拒绝 `apply`。
- 技能正文与命令参考文档从「只读接入」更新为「只读接入 + 受控变更」，说明环境分域、开关语义、写前核对、结果回读与未知结果处理。
- 不改变：`mysql-query` 的单条只读语义与绑定校验、连接配置版本、连接槽位（Hook）只读约束。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `builtin-connection-skills`：MySQL 接入职责从「只读测试与数据库发现」扩展为包含受控变更动作；新增变更语句类别、环境与破坏性语句边界，以及不可回滚事实的表达要求。查询工具继续保持单条只读，职责划分不变。

## Impact

- 实现：`services/buildr/resources/workspace/skills/connections/mysql-connection/`（`assets/connection.yml`、`SKILL.md`、`references/commands-and-results.md`）、`services/buildr/src/modules/mysql-query/`（程序命令、领域接口与执行器）。
- 测试：`test/integration/mysql-connection-program.test.ts`、`test/integration/mysql-query-skills.test.ts`、`test/e2e/connection-skills.ts`。
- 兼容：连接配置版本保持 `1`，既有实例无需重录；未声明 `targetEnvironment` 的实例只失去 `apply`，只读测试、发现与查询不受影响。
- 无 `mysql-query` CLI、HTTP 接口或页面行为变化；变更动作只经已选连接的通用启动入口执行。
