## 1. 连接声明与程序

- [x] 1.1 更新 `services/buildr/resources/workspace/skills/connections/mysql-connection/assets/connection.yml`：新增 `targetEnvironment`（enum `dev|test|qa|reg|prod`，非必填）与 `allowDestructive`（boolean，默认 `false`）配置字段，新增 `write`/「写入范围」展示分组，程序版本约束由 `=1.0.0` 调整为 `=1.1.0`。验证：连接定义解析器接受该声明，`configVersion` 保持 `1`。
- [x] 1.2 在 `services/buildr/src/modules/mysql-query/domain/mysql.ts` 增加变更请求与结果类型，以及语句类别分类、目标表提取、禁止类别判定所需的纯函数；拒绝清单覆盖权限与账号、服务器全局状态、过程/触发器/事件、文件导入导出类语句。验证：类别边界对每类语句有确定结果。
- [x] 1.3 在 `services/buildr/src/modules/mysql-query/infrastructure/mysql-client.ts` 增加 `fingerprint()` 与 `applyChange()`：数据修改类在事务内执行、超过上限回滚；结构变更类执行后回读；连接超时或中断返回未知而不是失败。复用既有 `sql_mode` 对齐、`multipleStatements: false` 与 `LOCAL_FILES` 禁用配置。验证：上限回滚、指纹不符、结果未知三条路径都有实际语句序列佐证。
- [x] 1.4 在 `services/buildr/src/modules/mysql-query/interfaces/program/mysql-connection-program.ts` 增加 `fingerprint --table <表> [--database <库>] --json` 与 `apply --statement-file <文件|-> --expected-fingerprint <摘要> [--max-affected-rows <n>] --json`，读取 `targetEnvironment` 与 `allowDestructive` 并实施环境门禁、破坏性开关与参数必填校验，补齐诊断码，版本改为 `1.1.0`。验证：`--help` 与 `--version` 离线可用，缺少环境或上限时拒绝且未连接数据库。

## 2. 技能与参考文档

- [x] 2.1 更新 `.../mysql-connection/SKILL.md`：从「只读接入」改为「只读接入与受控变更」，说明适用目标、环境分域、破坏性开关、写前指纹、不可回滚事实与未知结果处理，并保持查询工具仍为单条只读。验证：正文与连接声明、程序行为一致。
- [x] 2.2 更新 `.../mysql-connection/references/commands-and-results.md`：补充 `fingerprint`、`apply` 的参数、结果字段与失败语义表，说明一次一条语句、DML 上限与 DDL 不可回滚。验证：命令样例可对应实际参数解析。
- [x] 2.3 核对 `services/buildr/resources/runtime/skills/buildr/references/external-connections.md` 与 `services/buildr/docs/cli-architecture.md` 中 MySQL 只读描述；仍准确处不改，出现直接矛盾时同步。验证：`grep -n -i mysql` 逐条判断并记录结论。

## 3. 测试

- [x] 3.1 扩展 `services/buildr/test/integration/mysql-connection-program.test.ts`：使用既有 MySQL fixture 覆盖数据修改提交与回滚、结构变更不可回滚、生产环境拒绝、未声明环境拒绝、破坏性默认拒绝与开关放行、越权语句永久拒绝、指纹不符拒绝、结果未知不重试，并断言认证值不进入语句与输出。验证：`npm run test:integration`（相关切片）通过。
- [x] 3.2 为类别分类、目标表提取与拒绝清单增加单元测试，覆盖每条拒绝规则与边界语句。验证：`npm run test` 相关切片通过。
- [x] 3.3 更新 `services/buildr/test/e2e/connection-skills.ts` 等受连接声明字段影响的既有断言。验证：相关端到端切片通过。

## 4. 当前认知

- [x] 4.1 更新 `projects/product/knowledge/docs/architecture/external-connections.md` 的 MySQL 职责行，加入受控变更；其余 `knowledge/` 命中文件逐条判断是否需要同步。验证：描述与最终行为一致。
- [x] 4.2 更新 `projects/product/.buildr/knowledge-impact.yml`，记录本次评估的影响对象、理由与状态。验证：文件可解析，条目与 4.1 一致。

## 5. 规范收敛

- [x] 5.1 运行 `openspec validate mysql-controlled-change --strict` 与 `buildr openspec convergence preflight`。验证：均以退出码 0 结束，或如实记录剩余诊断。
