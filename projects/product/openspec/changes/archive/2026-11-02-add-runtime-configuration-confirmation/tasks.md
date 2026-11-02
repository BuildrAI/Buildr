## 1. 交接正文与抽屉

- [x] 1.1 扩展 `AgentDiscoveryContent` 为确认与复制两种模式共用正文：默认说明“确认后才会创建对话并提交配置请求”，保留目标、三步、影响、完整指令和完成后查看位置；复制模式沿用原因说明。
- [x] 1.2 新增 `RuntimeConfigurationDrawer`（`#service-runtime-configuration-drawer`）：使用 `DrawerShell`，提供目标服务与工作空间身份、单一主操作“开始配置”、取消与状态播报；提交中禁用关闭，未接入时主操作切换为复制指令。
- [x] 1.3 在 `service-runtime.css` 增加交接抽屉的局部样式，保持窄屏不横向溢出，并删除仅被旧复制抽屉使用的样式（如有）。

## 2. 配置提交钩子

- [x] 2.1 将 `useRuntimeConfiguration` 改为持有待确认目标、提交中状态与抽屉内反馈；`open(service)` 只打开交接，`submit()` 才调用现有 `executeRuntimeConfiguration`。
- [x] 2.2 保留提交中的防重复与已有的 `started / recovering / busy / copy` 分派：已创建或恢复对话时关闭抽屉并打开原对话；未接入、提交前失败或忙碌时在抽屉内保留真实原因。
- [x] 2.3 提交成功时记录待完成观察（服务、对话、交接前定义快照、开始时间），沿用 `SERVICE_RUNTIME_CHANGED` 刷新事件；不新增后端状态。
- [x] 2.4 待完成期间阻止再发起新的配置交接，并在入口上说明原因；`resolve` 只清除本次界面观察。

## 3. 入口接线

- [x] 3.1 服务目录 `ServicesPage`、任务本地运行 `TaskLocalRuntime`、服务运行区 `ServiceRuntimeSection` 的“开始配置”入口只打开交接抽屉，移除点击即提交。
- [x] 3.2 `RuntimeConfigurationSummary` 与 `RuntimeDefinitionDrawer` 的配置动作改为关闭原抽屉后打开交接抽屉；移除 `AgentDiscoveryDrawer` 的重复渲染。
- [x] 3.3 删除被替代的 `AgentDiscoveryDrawer` 及其引用，确认没有残留入口或样式。

## 4. 完成判定与反馈

- [x] 4.1 提取 `configurationOutcome` 与运行定义快照函数：完成 = 本次执行正常结束且运行定义可读；区分首次完成、已保存但执行未完成、检查未变化、尚未完成。
- [x] 4.2 新增 `RuntimeConfigurationOutcome`：交接后读取原对话状态，执行结束后读取服务运行定义，按结果发出通知并可跳到服务运行区；30 分钟超时只停止观察，不伪造结果。
- [x] 4.3 服务目录、运行区与任务入口显示“配置中/检查中”，提供回到原对话的操作，并阻止待完成期间再次发起配置。
- [x] 4.4 `AgentDiscoveryContent` 明确完成标准：服务页从“未配置运行定义”变为“未运行”并提供“启动”；完成不等于已启动或业务验证通过。

## 5. 测试与检查

- [x] 5.1 更新 `services/buildr-web/test/service-runtime-configuration-hook.test.mjs`：打开不调用提交、确认才提交一次、重复确认被阻止、未接入反馈留在抽屉、关闭无副作用、待完成观察与阻止并发交接。
- [x] 5.2 新增 `services/buildr-web/test/service-runtime-configuration-outcome.test.mjs`：完成、已保存未完成、检查未变化、尚未完成与定义快照。
- [x] 5.3 更新 `services/buildr/test/e2e/service-runtime-journey.ts` 的运行配置段：未接入时打开抽屉并复制；接入后确认才创建对话；完成反馈与未完成反馈；重复确认仍只创建一次。
- [x] 5.4 运行前端与服务类型检查、`frontend-logic` 单元检查；浏览器 service 旅程目标段通过，选择器整体因既有 Mermaid 断言失败按局部缺口记录。
- [x] 5.5 运行 `openspec validate add-runtime-configuration-confirmation --strict` 与 `buildr openspec convergence preflight`，均通过。

## 6. 当前知识

- [x] 6.1 更新 `knowledge/code-map/technical-layers.md` 与 `knowledge/docs/architecture/agent-integration.md` 中运行配置交接顺序与完成判定的描述。
- [x] 6.2 更新 `knowledge/index.yml` 中运行配置动作、钩子、完成判定与交接正文的条目摘要。
- [x] 6.3 更新 `.buildr/knowledge-impact.yml` 的本次目标、影响与来源，并在实现完成后按最终事实复核。
