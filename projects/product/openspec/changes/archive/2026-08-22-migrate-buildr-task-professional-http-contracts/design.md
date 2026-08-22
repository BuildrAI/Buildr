## Context

P0 已把 Task Record 五个基础操作的 HTTP Schema、Ajv 编译、DTO 生成和 typed Client 交付到 canonical dev。Task 专业阶段目前由两类边界组成：Task HTTP Interface 中的 retrospective/review handler，以及 Local App read executor/worker 暴露的 overview、development、reviews、verification、coordination 与 execution-record 读取操作。页面仍有 `any`、低层 `api` 直呼和局部断言，专业 payload 的机器 authority 尚未集中。

本 Child 横跨 Buildr 与 Buildr Web 两个 Service，但只迁移 HTTP 边界；各 Application、Domain、Persistence、Execution Record 与 Parent Coordination writer 继续是事实 authority。

## Goals / Non-Goals

**Goals:**

- 在一个 Task-professional contract catalog 中登记专业 HTTP operations、稳定 `$id`、请求/成功/错误 Schema 与所属 authority。
- 复用 P0 的 strict Draft 2020-12 Ajv compiler、deterministic DTO generator、tracked output 和 drift check。
- 让 handler/read executor 在现有安全与输入边界之后执行 Schema 校验，并把 Interface DTO 显式映射为既有 Application input。
- 为页面提供按能力拆分的 typed Client，替换本 Change operation callsite 的直呼低层 transport、手写 response DTO 与无边界 assertion；既存页面 ViewModel `any` 只作为展示兼容层保留，不把整页 ViewModel 重构扩大为本 Change 门禁，也不改变页面信息架构。
- 用真实 HTTP Contract Test 锁定成功、错误、字段拒绝、查询白名单、Execution Record 文件白名单和不可变异语义。

**Non-Goals:**

- 不迁移 Workspace、Agent Assets、Runtime/System 或尚未列入 catalog 的其他 route。
- 不修改 Task 专业 API 的路径、状态码、错误 code、错误优先级、payload major、writer 或生命周期语义。
- 不在生产响应路径默认重复执行 Ajv；成功响应以 Contract Test 校验为主，只有高风险边界保留已有运行时检查。
- 不建立第二套 OpenAPI、全局业务 schema 仓库、前端 Ajv 或全局 Store。

## Decisions

### 1. Task-professional 本地 catalog，基础 compiler 继续归 Infrastructure

专业 operation catalog 和 Schema authority 放在 `task/interfaces/http` 的能力子目录；Infrastructure 只复用 P0 的 generic compiler/registry。这样每个专业能力仍持有语义 owner，后续可在 catalog 规模真实增长后再提取共享索引。全局 registry、OpenAPI 或复制 Domain schema 都不作为本 Child 的前置条件。

### 2. 按现有 HTTP 形态建模，而不是强行统一为 CRUD

只读 read-executor 操作使用各自的 query/path DTO，retrospective PATCH 和 review prompt POST 使用各自 request DTO；Execution Record body 的 filename/view 白名单仍是安全语义。catalog 的 operation id 由能力和动作组成，例如 `task-development.detail`、`task-execution-record.body`，稳定 `$id` 不绑定文件路径或内部类名。

### 3. 校验顺序保持现有边界

路由匹配、workspaceId/path 禁止、Origin/session/content-type/body size/JSON parse 和 write authorization 仍先执行；随后才运行 operation validator。重复 query、未知 query、forbidden filename、Execution Record identity、digest/conflict/terminal 错误继续由 Interface/Application 映射，不能被通用 Ajv 错误覆盖。校验器显式关闭 `coerceTypes`、`useDefaults`、`removeAdditional`，并在 handler 继续使用新建的 mapped object。

### 4. 生成 DTO 只是一套 authority 的投影

生成器从 catalog Schema 产生 Buildr backend DTO 与 Buildr Web DTO，输出包含 source `$id`/generator identity，格式化和排序固定；`generate` 更新 tracked 文件，`check` 比较临时生成结果并对 drift 返回非零。Web client 只依赖 generated types，不安装 Ajv；低层 `ApiClient` 保留 transport 的 `unknown` 边界。

### 5. 真实契约测试按能力覆盖，页面验收保持有界

Contract Test 启动真实 Local App host，覆盖每组 operation 的合法请求、成功 DTO、错误 envelope、未知/缺失/非法字段、不变异和 authority 未被错误调用。受影响的 Task Detail 专业 tab 使用正式 `web-dist` build/typecheck 和现有 Task Browser Smoke；未迁移 route 仅记录诊断，不阻塞其他 HTTP 能力。

## Risks / Trade-offs

- [专业 payload 字段多且随生命周期变化] → 以现有 Application read model、fixture 和 Contract Test 建模，Schema 变化必须同步生成物并由 drift check 暴露。
- [统一 catalog 误吞并专业错误] → 将安全/并发/terminal/digest 错误保持在各 Interface mapping，Ajv 只负责结构性输入错误。
- [页面类型化范围过大] → 先按能力 client 划分边界，页面只替换当前请求和响应类型，不重构状态、组件或视觉结构。
- [完整迁移被误解为 Child 完成] → catalog 明确列出 migrated operations，coverage check 输出未迁移列表但不设全局 hard gate。

## Migration Plan

1. 从 P0 机制建立 Task professional catalog、Schema、operation mapping 与 generated DTO；补齐 generator/drift 入口。
2. 接入 read executor、retrospective/review handlers 的 strict validation 和 DTO → Application mapping，保留原有错误及安全顺序。
3. 增加按能力 typed clients，迁移 Task Detail 的 overview/development/reviews/verification/coordination/execution-records/retrospective 调用点。
4. 增加真实 Contract Test，运行 affected typecheck、Buildr Web production build、tracked `web-dist` 和 Task Browser Smoke。
5. 完成 current knowledge assess/reconcile，勾选 Change-owned tasks，执行 strict validation、convergence preflight 和单一 converge/archive 事务。

回滚只需回退本 Change 的 catalog、handler/read executor mapping、生成物、client 和测试；不涉及 SQLite、Task lifecycle 或对外路径迁移。

## Open Questions

无。具体 operation 文件布局和生成器入口以当前 P0 实现及 apply 阶段的真实目录为准，不改变上述 authority 与边界。
