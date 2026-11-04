## 1. 交接记录与恢复

- [x] 1.1 新增 `runtimeConfigurationHandoff.ts`：按工作空间保存 `{code,name,conversationId,baseline,startedAt}`，以内存快照为读取源、写入同步到 `localStorage`（键含 Web profile），读取时校验必需字段并丢弃损坏条目。
- [x] 1.2 提供订阅、读取、写入与清除动作；写入或存储不可用时保留内存观察，不阻断已提交的对话执行。
- [x] 1.3 `useRuntimeConfiguration` 复用该记录作为 `pending`：`open` 时同一服务回到原对话、其他服务说明原交接仍在进行；`submit` 成功后写入记录，不再使用页面内 `useState`。

## 2. 入口与状态

- [x] 2.1 服务目录行操作、服务运行区未配置入口、任务本地运行提示与交接抽屉主操作统一为“运行配置”。
- [x] 2.2 进行中的服务给出“查看对话”而不是不可点击的“配置中”，并复用同一打开对话动作。
- [x] 2.3 交接抽屉对已在进行中的服务只提供“查看对话”，不渲染可提交的确认动作。
- [x] 2.4 状态单元格在刷新恢复后仍显示“配置中/检查中”，并保留 `data-service-runtime-configuring` 验收属性。

## 3. 完成观察

- [x] 3.1 `RuntimeConfigurationOutcome` 改为读取当前工作空间的交接记录，自行清除记录与广播运行状态变化，不再由三个入口分别挂载。
- [x] 3.2 在应用壳层挂载一次完成观察；存在记录时每 3 秒读取原对话，执行进入终态后读取运行定义并给出结果，30 分钟上限只结束观察。
- [x] 3.3 原对话不可读取或已不存在时明确结束观察并说明，不伪造完成或失败；其余读取失败保留到上限。
- [x] 3.4 完成或检查完成且运行定义可读时，结果通知直接提供“启动本地”，其他结果只提供“查看服务”。
- [x] 3.5 完成通知登记一次性的内存启动请求；服务页切到“本地运行”并由运行区打开现有启动抽屉、消费请求；不自动启动进程，刷新不重复弹出。

## 4. 测试

- [x] 4.1 新增 `service-runtime-configuration-handoff.test.mjs`：写入、读取、工作空间隔离、无效记录丢弃、清除与订阅通知。
- [x] 4.2 更新 `service-runtime-configuration-hook.test.mjs`：进行中服务回到原对话、其他服务被说明、提交后记录可恢复、`pending` 来自存储。
- [x] 4.3 更新 `service-runtime-journey.ts`：动作名“运行配置”、刷新后进行中状态与“查看对话”入口、任务入口不再显示可提交配置，并补充下拉浮层边界断言。
- [x] 4.4 浏览器旅程覆盖完成通知的“启动本地”直接打开启动抽屉，并断言只消费一次。
- [x] 4.5 新增 `service-runtime-configuration-start.test.mjs`：请求只对匹配的工作空间与服务生效、消费一次、退订后不再通知。

## 5. 当前知识

- [x] 5.1 更新 `knowledge/code-map/technical-layers.md` 与 `knowledge/docs/architecture/agent-integration.md` 中交接状态恢复、跨入口一致与完成观察的位置。
- [x] 5.2 更新 `knowledge/index.yml` 中交接钩子、抽屉、完成反馈的摘要，并登记新增交接记录模块。
- [x] 5.3 当前工作空间没有 `.buildr/knowledge-impact.yml`，不新建第二份影响清单；本次影响已写入本清单与当前知识文档。
