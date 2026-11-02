## 1. CLI 参数解析

- [x] 1.1 在 `services/buildr/src/modules/task/interfaces/cli/task.ts` 把 `TaskAction` 扩展出 `'list'`，并在 `TaskCommandRuntime` 增加 `queryTasks(targetRoot: string, input: TaskListInputDto): TaskListOutputDto` 签名；验证 `npm run typecheck`（或该服务既有静态检查入口）通过，且 `interfaceRuntime as TaskCommandRuntime` 的既有断言不需要新增运行时适配。
- [x] 1.2 在 `parseTaskCli` 的 `usages` 与 `allowedByAction` 中加入 `list` 条目，允许 `--status`、`--project`、`--service`、`--q`、`--page-size`、`--cursor`、`--target`、`--json`；验证传入未登记参数时抛出的 `task_record_cli.syntax` 错误带有 `list` 的 usage 文本。
- [x] 1.3 把「恰好一个位置参数」规则改为按 action 分支：`list` 要求零个位置参数，其余 action 保持恰好一个；验证 `buildr task list some-task-id` 返回语法错误与 usage，而 `buildr task inspect some-task-id` 行为不变。
- [x] 1.4 实现 `list` 的输入组装：未指定时默认 `status: 'open'`、`pageSize: '20'`，`--page-size` 以原始字符串交给既有 `listRequest` 校验，不在 CLI 侧另写数值范围判断；验证非法 `--page-size 0`、`--page-size 101` 与非法 `--status` 由 Application 拒绝并返回结构化诊断，CLI 不静默回退默认值。

## 2. 命令执行与输出

- [x] 2.1 在 `taskCommand` 中增加 `list` 分支，调用 `runtime.queryTasks(parsed.targetRoot, input)` 并直接返回 `buildr.task-record-list/v7` 投影，不包裹 `buildr.task-record-result` 信封；验证 `--json` 输出顶层 `schemaVersion` 为 `buildr.task-record-list/v7`，且 `filters.status` 为 `open`、`pageSize` 为 `20`。
- [x] 2.2 为非 `--json` 模式增加紧凑人类可读输出（标识、状态、标题），复用既有 stdout/stderr 分工；验证无 `--json` 时输出为多行摘要而不是 JSON，空结果给出明确的一行说明而不是空白。
- [x] 2.3 确认列表输出不含 `brief` 正文，也不含 database path、table、row id、SQL 或 storage internals；验证对含非空 `brief` 的真实任务执行 `task list --json`，输出中不出现 `brief` 字段与任何存储内部标识。

## 3. Descriptor 注册与命令面

- [x] 3.1 在 `services/buildr/src/modules/task/module.ts` 的 `createTaskCliContributions` 增加 `key: 'task list'`、`surface: 'primary'` 的 descriptor，`match` 为 `domain === 'task' && action === 'list'`，`run` 传 `context.argv.slice(4)`；验证 `buildr help` 的 Primary workspace commands 分组出现 `task list` 一行，且 `COMMAND_CATALOG` 合并后 unknown-command candidates 自动包含 `task list`。
- [x] 3.2 撰写该 descriptor 的 `summary` 与 `help` 数组，说明只读轻量列表、默认 `status=open` 与 `pageSize=20`、`--status all` 与 `--cursor` 用法，并明确它不是 `workbench` 概览也不是 `task inspect` 的替代；验证 `buildr help task list`、`buildr task list --help`、`buildr task --help` 与根帮助四处都能查到，且帮助文本不把该命令描述为工作概览或单任务读取入口。
- [x] 3.3 核对 `specs/product-source-layout` 增量中 descriptor 来源枚举已含 `list`，且实现确实由 Task 模块公开入口贡献、公共 Host 未复制第二份命令目录；验证 bootstrap 合并目录中 `task list` 只出现一次。

## 4. 测试

- [x] 4.1 新增单元或集成测试覆盖：默认过滤与分页生效并在 `filters` 回显、`--status all` 返回全部状态、`--cursor` 取得下一页且 `hasMore`/`nextCursor` 语义正确、空结果返回空 `tasks` 与真实计数；验证新增测试在该服务既有测试入口下通过。
- [x] 4.2 新增测试覆盖语法边界：`task list <task-id>` 被拒绝、未登记参数被拒绝、非法 `--page-size` 与非法 `--status` 返回结构化诊断；验证这些用例断言错误 code 与 usage 文本而不是仅断言非零退出码。
- [x] 4.3 新增或扩展 public JSON 契约测试，覆盖 `task list --json` 的 v7 顶层 identity、关键字段 guard、不含 `brief`，以及 checkout 与 npm tarball 的 schema parity；验证按 `public-json-contracts` 既有 registry 漂移保护，命令可达而契约测试缺失时 static/package verification 失败。
- [x] 4.4 按 `services/buildr/AGENTS.md` 的开发验证隔离要求，通过 `tools/development/run-isolated-workspace-check.ts` 执行 Workspace CLI 场景检查（从 `projects/product/services/buildr` 的 `npm run test:e2e` 选择），覆盖含数百个 Task 的 workspace 下 `task list` 默认返回有界结果；验证不使用裸 `mktemp` 启动指向默认用户 profile 的 `buildr web`，且隔离检查登记不写入真实用户状态。

## 5. 当前认知维护

- [x] 5.1 按 `current-knowledge-maintenance` 执行 assess，核对 `knowledge/docs/reference/json-contracts.md:37` 与 `:68` 把 v7 列表描述为「Buildr Web Task stored detail/list query」的范围是否需要扩展为「Buildr Web HTTP 与 CLI 共用」，并核对 `knowledge/code-map/task-system.md` 是否描述 Task CLI 接口层而需要纳入 `list`；只更新实际受影响内容，无影响则如实记录不适用理由。
- [x] 5.2 核对本次是否引入新术语或改变既有术语含义（`open` 查询状态、轻量列表投影、CLI 默认值与 HTTP 默认值的区别）；验证相关解释文档与术语表达一致，不新增第二份术语权威，且不存在 `.buildr/knowledge-impact.yml` 需要另建（当前工作空间无该文件）。

## 6. 收敛前直接验证

- [x] 6.1 在真实 canonical workspace 上执行 `buildr task list --json` 与不带 `--json` 两种形态，核对返回条数、`filters` 回显、`hasMore`/`nextCursor`，并测量输出字符数与 `workbench inspect` 的 53,221 字符对比；验证输出体积显著更小且包含全部未终结任务。
- [x] 6.2 执行四服务静态检查与单元测试（Buildr 产品推送前要求），确认新增命令未破坏既有 Task CLI、HTTP 与 Buildr Web 行为；验证失败项如实报告，不以单条命令通过替代完整检查结论。
- [x] 6.3 执行 `openspec validate add-cli-task-list --strict` 与 `buildr openspec convergence preflight`，处理真实诊断（含与活跃变更 `record-check-applicability` 的规范条目冲突）；验证两者均无 error，且诊断结果对应当前材料而不是过期结论。

## 7. 执行用量保留
- [x] 7.1 两处runOutcomes投影保留contextUsage并兼容generation，旧记录不回填猜测值。
- [x] 7.2 完成跨轮归档持久化回归，并执行Agent集成与类型检查。
