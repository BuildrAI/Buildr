## Context

`dispatch()`（`src/bootstrap/cli/registry.ts`）用固定下标解构 `rawArgs`：`[domain, action, runtimeId, ...args]`。第三个槽位被两类命令共用：三词命令把它当命令词判别（如 `task verification inspect`、`web preview start`），`requiresAgent` 的 runtime 命令把它当位置身份。当前实现不做选项判别，省略身份时 `--target` 占位身份、其值掉成裸参数。`cli-reference.md` 已把 `<agent>` 记为可选；`retire-vendor-runtime-adapters`（已归档）把该缺陷记为遗留项并在 `runtime-command-selection.test.ts` 钉住了真实行为。

路由侧另有两处同源问题：`sync` 从 `context.action`（第二槽位）直接取身份；`runScopedRender` 的 rules 能力门禁与 `runtime check` 的适配器选择用 `resolveRuntimeAdapter`，只按身份字面量查表，不做 workspace 现场检测、也不看 `--adapter`，省略身份时错误落到默认适配器。

## Goals / Non-Goals

**Goals:**
- 省略身份时所有 runtime 命令的参数尾完整到达操作层，身份为 `null` 并走同一选择规则（现场证据、`--adapter`、默认标准）。
- 显式身份与显式 `--adapter` 的行为不变；三词命令词的判别不受影响。

**Non-Goals:**
- 不重构分派器为按路由 arity 推导参数；不为 CLI 引入通用选项解析器。
- 不改变选择规则本身（`selectWorkspaceRuntime` 语义不变）与各 render 内部实现。

## Decisions

### 决策一：在共享分派器保护身份槽，而非各路由自行补偿
`runtimeId`/`args` 是所有模块共用的路由上下文契约，根因在分派器。修复方式：第三个位置参数只在不以 `--` 开头时才消费为 `runtimeId`，否则 `runtimeId = null` 且 `args` 从 `rawArgs[2]` 起保留完整尾部。

理由：三词命令词的 `match` 要求字面量相等（如 `runtimeId === 'inspect'`），选项位为 `null` 时同样不匹配，行为不变；而 runtime 命令得到 `null` 身份与完整参数尾。`render` 路由此前已在自身 `run` 内做过同样规则的自解析，现在与分派器契约一致，保留现状或顺手归一均可——选择保留现状，避免无谓 diff。

替代方案（按匹配路由 key 的词数推导身份位）被否决：match 在上下文构造之后运行才可知路由，而三词命令的 match 本身就依赖该槽位，顺序上不可行，且让契约更隐晦。

### 决策二：rules render 门禁与 runtime check 改用 `selectWorkspaceRuntime`
省略身份时正确适配器可能来自现场证据（如 `claude-code` 受管文件）；`--adapter` 也已在 `render*Runtime` 内部被消费。CLI 侧预检必须与之一致，否则 `rules render --target <dir>` 在 claude-code 现场仍被默认适配器的能力门禁挡掉。做法：先 `withResolvedTarget` 得 `targetRoot`，再 `selectWorkspaceRuntime(targetRoot, { runtimeId, adapterId })` 取适配器做门禁；`runtime check` 同样用该结果挑 checker。为此在 CLI facade（`cliApplication`）暴露 `selectWorkspaceRuntime`，与已暴露的 `resolveRuntimeAdapter` 同级。

取舍：现场检测会多一次只读扫描；这只发生在命令真实执行时，成本可忽略。传给 `render*Runtime`/`installProductRuntimeSkill` 的仍是原始身份（`null`），内部再跑一次同一选择规则，结果确定一致，不引入第二条选择路径。

### 决策三：`sync` 改用 `parseRuntimeCommandArgs` 解析自身尾部
`sync` 的身份在第二槽位（`context.action`），`sync --target <dir>` 目前把 `--target` 当身份、把 `<dir>` 留成未知参数报错。改为对 `rawArgs.slice(1)` 应用与 `render` 相同的 `parseRuntimeCommandArgs` 规则：首个非选项 token 为身份，否则 `null`。

### 决策四：usage 文本对齐 `[<agent>]`
`cli-reference.md` 已声明可选；把 `skills render`、`rules render`、`skill install`、`runtime check`、`sync`、`render` 的 usage 中 `<agent>` 改为 `[<agent>]`，使命令帮助与文档一致。

## Risks / Trade-offs

- [身份槽由 `undefined` 变为显式 `null`，或有路由依赖 `undefined` 判别] → 现有消费方均用 `?? null` 或字面量比较，测试覆盖路由边界；实现后跑相关集成测试确认。
- [`rules render` 门禁改为现场感知后，对标准适配器现场仍须以非零退出说明不执行] → 保留 `usage()` + `process.exit(2)` 分支，仅替换适配器来源。
- [省略身份的 `sync` 开始真实写入选定 runtime] → 这正是文档已声明的语义；选择规则在存在多份受管证据时要求显式选择，不静默切换。

## Migration Plan

纯行为修复，无数据迁移。发布后旧用法（显式身份）不受影响；此前被错误拒绝的省略身份形式开始按文档工作。
