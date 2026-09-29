# Tasks

- [x] `src/bootstrap/cli/registry.ts`：分派上下文的第三槽位只在不以 `--` 开头时消费为 `runtimeId`，否则 `runtimeId = null` 且 `args` 从 `rawArgs[2]` 起保留完整尾部。
- [x] `src/modules/agent-assets/module.ts`：CLI facade（`cliApplication`）暴露 `selectWorkspaceRuntime`。
- [x] `src/modules/agent-assets/interfaces/cli/agent-assets.ts`：
  - `runScopedRender` 先 `withResolvedTarget` 得 `targetRoot`，用 `selectWorkspaceRuntime(targetRoot, { runtimeId, adapterId })` 的适配器做 rules 能力门禁；
  - `runtime check` 路由改用同一现场感知选择决定 checker 适配器，并先消费 `--adapter` 再交给 checker；
  - `sync` 路由对 `rawArgs.slice(1)` 应用 `parseRuntimeCommandArgs`，不再从 `context.action` 取身份；
  - `render`、`sync`、`runtime check`、`skill install`、`skills render`、`rules render` 的 usage 中 `<agent>` 改为 `[<agent>]`。
- [x] `test/integration/runtime-command-selection.test.ts`：把钉住缺陷的断言改为修复后契约（省略身份时 `runtimeId === null`、参数尾完整保留 `--target <dir>`），并按新 facade 补齐 stub；补充 `--adapter` 不经位置身份的覆盖。
- [x] 验证：运行该测试文件及相关 CLI 集成用例（70/70 通过）、`npm run test:fast`（通过）；真实 CLI 复现 `skills render`/`rules render`/`skill install`/`runtime check`/`sync` 的省略身份形式与 `--adapter`、现场检测组合。
- [x] 知识影响核对：`knowledge/code-map/technical-layers.md` 与 `services/buildr/docs/cli-reference.md`、已声明 `[<agent>]` 的文档一致，无语义改动；结果已写入 `projects/product/.buildr/knowledge-impact.yml`。
