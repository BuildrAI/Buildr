## Context

P0 已在 `infrastructure/contracts/json-schema-validator.mjs` 和 Task Record HTTP contracts 中建立严格 Draft 2020-12 编译、复用和生成投影的基础。Workspace HTTP adapter 目前直接把任意 JSON body 交给 Application，Workspace/Project/Service 页面则通过低层 `Promise<unknown>` 自行断言；Agent Assets 主要只有 CLI Application port，没有可审计的 HTTP operation catalog。

本 Child 横跨 Buildr Service 与 Buildr Web，必须把契约放在各模块 HTTP Interfaces，而不是把业务字段塞进 `public-json.mjs`。现有 Workspace/Application、Agent Assets/Application、SQLite/manifest writer、runtime projection 和 session/Origin 安全边界均是既有 authority。

## Goals / Non-Goals

**Goals:**

- 为 Workspace Control Plane 和 Agent Assets 管理面建立稳定 operation id、Schema `$id`、严格请求校验、成功/错误 DTO 和 Contract Test。
- 复用 P0 的 validator catalog 与构建期生成机制，生成后端/前端 DTO，并让 Workspace、Project、Service 管理页面通过能力 Client 消费。
- 保留现有路径、状态码、错误 envelope、Origin/session、`target/path/root` 禁止规则、writer、ownership 和 runtime projection 行为。
- 对 Agent Assets 先提供可被页面和自动化消费的目录/状态查询与受控 mutation operation；mutation 仍调用既有 Application writer，不把 DTO 当 canonical asset。

**Non-Goals:**

- 不迁移 Task 专业阶段、Runtime/System、Agent Adapter 或未触达的文章/发布接口。
- 不引入 OpenAPI、前端 Ajv、全量 TypeScript 重写、额外 Web 框架或全局前端 Store。
- 不重新设计 Workspace、Component、Skill、Rule、Command、Builtin 的业务语义、安装同步治理或持久化模型。

## Decisions

1. **模块内 Schema authority，通用机制集中复用。** 在 `workspace/interfaces/http` 与 `agent-assets/interfaces/http` 各自维护 Schema/operation catalog；只调用 P0 的通用 compile/validate 和 DTO 生成脚本。这样能让业务语义靠近 Application，同时避免 Infrastructure 变成全局业务 Schema 仓库。

2. **先迁移现有 HTTP surface，再增补 Agent Assets HTTP adapter。** Workspace 路由保持原 URL；Agent Assets 以 workspace-scoped `/agent-assets/*` operation 提供目录和受控写入的最小管理面。CLI 继续是同一 Application 的另一入口，HTTP 不复制 CLI 文本输出。

3. **校验只约束当前 operation，保留安全和错误优先级。** Schema 使用 `additionalProperties: false`、严格类型与必填字段；不自动转换、默认或删除。`target_forbidden`、Origin/session、Content-Type/body size、冲突 digest 等既有边界先于业务 Schema 或按现有顺序保留，错误 envelope 仍是 `{error:{code,message,details}}`。

4. **能力 Client 集中解析 DTO。** 低层 fetch Client 继续返回 `unknown` 以保持 transport 通用；新增 `workspaceApi`/`agentAssetsApi` 在边界完成类型投影，页面移除同一 payload 的手写接口和 `as` 断言。生成 TypeScript 只来自 Schema，不反向成为运行时 authority。

5. **写入 operation 采用显式 command mapping。** HTTP DTO 映射为已有 Workspace/Agent Assets Application 输入或受控 argv，再由 Application 执行 writer、ownership 和 projection；不让 HTTP DTO 进入 Domain、manifest Row 或 SQLite。

## Risks / Trade-offs

- **[Risk] Agent Assets 现有 CLI 方法以 argv 和 stdout 为接口，直接复用会污染 HTTP 响应。** → 为 HTTP 只暴露返回结构化结果的 Application query/command port；无法结构化的 runtime render/sync 在本 Child 只提供状态查询和 operation disposition，不把 CLI 文本当 DTO。
- **[Risk] Schema 收紧可能改变旧客户端可接受字段。** → 先为现有合法字段建立 Contract Test；未知字段按稳定 `task_api_field_forbidden`/资产对应错误返回，并在 Change 中记录接受范围变化。
- **[Risk] 生成物和 Schema 漂移。** → 将生成脚本、drift check 和 Contract Test 纳入受影响 Service build；未迁移能力不被全局 drift gate 阻塞。
- **[Risk] Workspace 写入与 runtime projection 有外部副作用。** → HTTP 仅调用既有 writer，保留写请求 session/Origin 授权和单次 mutation fence；浏览器 smoke 只覆盖一个安全的读取/编辑路径。

## Migration Plan

1. 在 Child worktree 中建立 Change-owned schemas、operation registry、结构化 Agent Assets HTTP port 与后端/前端生成目录。
2. 先接入 Workspace routes 和 typed Workspace client，再接入 Agent Assets query/mutation routes；每一步保留旧 Application 方法和 CLI。
3. 添加 request/success/error Contract Test、生成 drift check、Buildr Service typecheck/测试和 Buildr Web typecheck/build。
4. 完成正式 web-dist 与 Workspace 管理 smoke 后，执行 Change-owned convergence/archive；失败时保留现有 routes/CLI，回滚只撤销新 HTTP adapter、schemas、generated DTO 和 client。

## Open Questions

- Agent Assets 的 runtime render/sync 是否需要独立的后续 Runtime/System Child；本 Change 只要求状态查询和受控管理面不改变既有投影治理。
- 完整跨 Service 的 DTO 生成脚本是否在 P2 提取为统一 build plugin；本 Child 先复用 P0 可执行机制并保持生成输入/输出边界清晰。
