## 1. 运行定义与记录模型（buildr）

- [x] 1.1 `runtime-definition.ts`：解析 `local.backends` 数组并与 `local.backend` 归一为声明列表；校验每项 serviceCode/environmentVariable/remoteUrl、列表内 serviceCode 与变量唯一、`backend`/`backends` 并存拒绝；渲染统一输出 `backends`；验证方式：定义解析单测覆盖归一、冲突拒绝与旧声明兼容。
- [x] 1.2 `runs.ts` 与运行记录持久化：`connection` 扩展为逐后端 `connections`；读取归一旧单连接记录，新记录写 `connections` 并保留首连接 `connection` 兼容字段；验证方式：记录归一与写入的单测。

## 2. 目标解析与启动链路（buildr）

- [x] 2.1 `service-runtime-application.ts`：新增 `backendTargets` 可选输入并校验；`resolveConnection` 扩展为逐后端解析（显式 runId→归属与存活重验 / `remote`→remoteUrl / 全局 `local`→同范围唯一严格 / `auto`→同范围唯一否则远程）；多环境变量注入；`expectedBackendRunId` 映射为所属声明后端的显式目标；验证方式：应用层单测覆盖各解析路径、失效拒绝与切换先校验后停止。
- [x] 2.2 `service-task-runtime-application.ts`：任务组合启动对前端声明的每个后端逐个处理（已选则等待就绪并注入实际地址，未选按连接规则解析），逐项保留成功/复用/错误；验证方式：多后端组合启动的单测。
- [x] 2.3 `service-runtime-view.ts` 与 `module.ts`：服务摘要透传登记 `type`；`connectionTargets` 返回按声明后端分组的候选（remoteUrl、全部已就绪实例含来源/分支/地址/同范围标记、默认目标）；验证方式：视图单测或既有覆盖。
- [x] 2.4 `service-runtime-http.ts` 与 `service-runtime-cli.ts`：接受 `backendTargets` 可选输入并在 JSON 输出返回逐后端连接与候选；验证方式：接口层测试或编译契约检查。

## 3. 前端（buildr-web）

- [x] 3.1 `service-runtime-api.ts` 与 `model.ts`：类型更新（`backends`、`connections`、`type`、后端候选结构）；连接展示与选择辅助函数逐后端化；验证方式：类型检查。
- [x] 3.2 `RuntimeStartOptions.tsx` 与 `StartWorktreeModal.tsx`：按声明后端分组渲染候选（默认自动/各就绪实例/远程），跨范围实例标注来源；逐后端选择状态与 `backendTargets` 提交；去掉顶部大块告警，改为标题下一行小字（影响实例、端口、校验失败保留原运行）；验证方式：类型检查 + 浏览器走查启动与切换对话框。
- [x] 3.3 `LocalRunCard.tsx` 与 `LocalRuntimeSurface.tsx`：逐后端连接列表展示；「打开」仅 `type === 'frontend'`；验证方式：类型检查 + 浏览器确认后端运行卡无「打开」、前端有。
- [x] 3.4 `AssetEditDrawer.tsx`、`asset-edit-draft.ts` 与 `ServiceCreateDrawer.tsx`：服务类型可登记与修改（仅「前端」「后端」两值，显示为中文标签），冲突对照区与更新载荷携带 `type`；验证方式：类型检查 + 浏览器保存服务类型并回读。
- [x] 3.5 `ServiceRuntimeStatusCell.tsx` 与 `service-runtime.css`：目录浮层卡片化（边框、区块标题、结构化条目、明细入口），样式经 overlayClassName 限定作用域；验证方式：浏览器查看浮层边框与排版。

## 4. 文档与当前知识

- [x] 4.1 `resources/runtime/skills/buildr/references/local-services.md`：多后端声明结构、实例级选择语义、`backendTargets` 用法与组合启动说明；验证方式：对照实现核对命令与字段示例。
- [x] 4.2 `knowledge/code-map/technical-layers.md` 与 `knowledge/index.yml`：运行定义、运行记录、应用、视图、前端特性段落的职责描述同步为多后端/逐后端连接语义；按本变更 `.buildr/knowledge-impact.yml` 核销；验证方式：描述与新语义一致。

## 5. 集成验证

- [x] 5.1 buildr 服务类型检查与受影响单测全部通过。
- [x] 5.2 buildr-web 类型检查与正式构建通过。
- [x] 5.3 浏览器走查关键路径：编辑服务保存类型；启动与切换对话框按后端服务分组列候选并可指定实例；后端运行卡无「打开」、前端保留；目录浮层有边框且条目可读。
