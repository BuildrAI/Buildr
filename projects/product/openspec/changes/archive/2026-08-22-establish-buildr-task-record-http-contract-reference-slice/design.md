## Context

Task Record 的五个 Buildr Web HTTP 操作已有稳定 Application、路由、安全检查和真实页面，但机器契约分散在 handler 字段白名单、Application 返回值与 React 页面手写类型/断言中。`public-json.mjs` 只登记公开 payload identity 与 envelope 规则，并不是业务 JSON Schema authority；Buildr 后端已经具备 Node 24 原生 TypeScript 执行基础，Buildr Web 由独立 React/Vite Service 持有。

本 Change 是 Parent 的第一个参考切片。它必须证明完整流水线可复制，同时避免提前建立覆盖全部 HTTP API 的平台、全局迁移门禁或第二套内部模型。

## Goals / Non-Goals

**Goals:**

- 以 Task list、detail、update、complete、abandon 建立 Schema 到页面的完整可执行链路。
- 让 Schema 成为 HTTP DTO 的唯一机器 authority，并在构建/测试阶段暴露漂移。
- 保持现有 Workspace 解析、写授权、错误 code/status/优先级和 Application/Domain/Persistence authority。
- 形成最小可复制机制，使后续 Child 能按模块扩展而无需重建基础方法。

**Non-Goals:**

- 不迁移其他 Task 专业 API、Workspace、Agent Assets、Runtime/System API。
- 不引入 OpenAPI、HTTP framework、全局业务 Schema 仓库、通用插件 registry 或新的前端状态库。
- 不修改 Task Domain、Application lifecycle、Persistence Row、SQLite schema、writer authority 或公开 payload major。
- 不要求未迁移 operation 在构建、启动或发布时全部登记。

## Decisions

### 1. Schema 语义归 Task HTTP Interfaces，Infrastructure 只提供编译机制

在 Task HTTP Interfaces 内维护 Draft 2020-12 Schema 文档和五个 operation 的稳定 catalog。`src/infrastructure/contracts/` 只提供通用 Ajv 2020 compiler/validator，`public-json.mjs` 继续只负责公开 JSON identity/envelope。这样既能复用机制，也不会让 Infrastructure 拥有 Task 字段语义。

未选择全局 schema registry、operation registry、validator registry 三套抽象，因为首个切片只有一个 owner；Task-local catalog 加一个通用 compiler 已足够证明扩展点。

### 2. Ajv validator 在模块加载时严格编译并复用

Buildr 增加 Ajv runtime dependency。compiler 固定使用 strict Draft 2020-12，并显式关闭 `coerceTypes`、`useDefaults`、`removeAdditional`；所有 Schema 在模块组合/加载时一次编译，失败使该模块启动失败，单次请求只复用 validator。

请求仍先经过现有 Workspace、Origin、session、content-type、body size 与 JSON parse 边界。`target|root|path`、未知 query、重复 query、缺少 `expectedRecordDigest` 等现有稳定错误继续由 Interface 的错误映射保持 code/status/优先级；Ajv 不吞并 Application 的 conflict、terminal 或 domain errors。

### 3. HTTP DTO 与 Application input 显式映射

Task handler 接收通过 Schema 校验的 Interface DTO，再由独立映射函数构造既有 Application Query/Command。即使当前字段一一对应，也不把 DTO 对象直接作为 Domain、Persistence 或 writer model 传播。成功响应保持 Application 既有公开 read model/result family，不新增 envelope 或 schema major。

### 4. 构建期从同一 Schema 确定性生成两端 TypeScript DTO

Buildr 内的生成工具读取 Task-owned Schema，使用固定版本生成器，规范化输出并同时写入后端与 Buildr Web 的 tracked generated 文件。`generate` 负责显式更新，`check` 在临时内存结果与 tracked 文件间比较并报告 drift；正式 typecheck/build 只消费 tracked 生成物，不在运行时生成。

Buildr Web 不安装 Ajv，只导入生成 DTO。低层 `client.ts` 继续拥有 fetch/session transport 并返回 `unknown`；新增 Task 能力 client 在唯一边界上调用 transport、按 operation 暴露 typed Promise，页面不再手写对应 response DTO 或散布 `as` 断言。

### 5. Contract Test 是响应契约主门禁，生产响应校验按风险保持最小

真实 HTTP Contract Test 启动现有 HTTP host，覆盖五个 operation 的合法请求、成功响应、错误 envelope、未知/缺失/非法字段以及不变异保证，并用同一 compiled Schema 校验真实响应。生产请求执行严格校验；生产成功响应不默认重复 Ajv 校验，避免把内部返回 bug 变成额外运行时开销和故障面。

正式 `web-dist` build 与既有 Task Browser Smoke 验证 typed Client 到页面的链路。未迁移 route 只由有界诊断列出，不让诊断失败阻断其他模块。

## Risks / Trade-offs

- [完整 response Schema 初次编写可能遗漏合法可选字段] → 从 Application 现有 closed result、真实 fixture 与 Contract Test 建模；同一 major 的未来兼容新增字段需要同步 Schema/生成物。
- [生成的前后端文件产生重复字节] → 重复是同一 authority 的构建投影，不是第二 authority；文件头、生成命令与 drift check 明确禁止手改。
- [Ajv 错误与现有错误语义不一致] → 保留特殊安全/并发错误映射，新增一般 DTO 错误使用稳定统一 envelope，并用回归测试锁定优先级。
- [把参考切片误解为全局迁移完成] → catalog 仅含五个 operation，诊断明确区分 migrated/unmigrated，不建立全局 completeness gate。

## Migration Plan

1. 先增加 Task-local Schema/catalog、通用 compiler 与生成工具，生成 tracked DTO。
2. 将五个 handler 路径切换为严格请求校验、显式映射和 typed DTO；保持公开行为回归测试。
3. 增加 Task typed Client并迁移现有 Task 页面调用点，构建正式 `web-dist`。
4. 运行 Contract Test、typecheck、affected/full verification 与 Task Browser Smoke；通过确定性 OpenSpec convergence 归档。

回滚只需整体回退本 Change 的 handler/client/schema/生成物与依赖变更；没有数据库、数据或公开 schema major migration。

## Open Questions

无。后续 operation 的迁移顺序和是否引入跨模块 catalog 由 Parent 的后续 Contribution 根据参考切片证据决定。
